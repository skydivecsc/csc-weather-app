const DEFAULT_TIMEOUT_MS = 15000;

const isAbortError = (error) => error?.name === "AbortError";

const createAbortError = () => {
  if (typeof DOMException === "function") {
    return new DOMException("The request was aborted", "AbortError");
  }

  const error = new Error("The request was aborted");
  error.name = "AbortError";
  return error;
};

export function startPolling({
  intervalMs,
  request,
  onResult,
  onError = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError("intervalMs must be a positive number");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number");
  }
  if (typeof request !== "function" || typeof onResult !== "function") {
    throw new TypeError("request and onResult must be functions");
  }

  let disposed = false;
  let activeRun = null;
  let queuedRun = false;

  const run = async ({ queueIfBusy = false } = {}) => {
    if (disposed) {
      return;
    }
    if (activeRun) {
      if (queueIfBusy) {
        queuedRun = true;
      }
      return activeRun.promise;
    }

    const controller = new AbortController();
    const currentRun = {
      controller,
      promise: null,
      timedOut: false,
      timeoutId: null,
    };
    activeRun = currentRun;

    const aborted = new Promise((_, reject) => {
      currentRun.abortHandler = () => reject(createAbortError());
      controller.signal.addEventListener("abort", currentRun.abortHandler, {
        once: true,
      });
      currentRun.timeoutId = setTimeout(() => {
        currentRun.timedOut = true;
        controller.abort();
      }, timeoutMs);
    });

    currentRun.promise = (async () => {
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => request({ signal: controller.signal })),
          aborted,
        ]);

        if (
          !disposed &&
          activeRun === currentRun &&
          !controller.signal.aborted
        ) {
          onResult(result);
        }
      } catch (error) {
        if (
          !disposed &&
          activeRun === currentRun &&
          (currentRun.timedOut || !isAbortError(error))
        ) {
          onError(
            currentRun.timedOut
              ? new Error("Polling request timed out")
              : error
          );
        }
      } finally {
        clearTimeout(currentRun.timeoutId);
        controller.signal.removeEventListener("abort", currentRun.abortHandler);
        if (activeRun === currentRun) {
          activeRun = null;
        }

        if (!disposed && queuedRun) {
          queuedRun = false;
          void run();
        }
      }
    })();

    return currentRun.promise;
  };

  const initialTimer = setTimeout(() => void run(), 0);
  const intervalTimer = setInterval(() => void run(), intervalMs);

  const stop = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    queuedRun = false;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);

    if (activeRun) {
      clearTimeout(activeRun.timeoutId);
      activeRun.controller.abort();
      activeRun = null;
    }
  };

  stop.runNow = () => run({ queueIfBusy: true });

  return stop;
}
