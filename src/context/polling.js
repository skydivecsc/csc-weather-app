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

  const run = async () => {
    if (disposed || activeRun) {
      return;
    }

    const controller = new AbortController();
    const currentRun = { controller, timeoutId: null };
    activeRun = currentRun;

    const aborted = new Promise((_, reject) => {
      currentRun.abortHandler = () => reject(createAbortError());
      controller.signal.addEventListener("abort", currentRun.abortHandler, {
        once: true,
      });
      currentRun.timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    });

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
        !isAbortError(error)
      ) {
        onError(error);
      }
    } finally {
      clearTimeout(currentRun.timeoutId);
      controller.signal.removeEventListener("abort", currentRun.abortHandler);
      if (activeRun === currentRun) {
        activeRun = null;
      }
    }
  };

  const initialTimer = setTimeout(run, 0);
  const intervalTimer = setInterval(run, intervalMs);

  return () => {
    if (disposed) {
      return;
    }

    disposed = true;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);

    if (activeRun) {
      clearTimeout(activeRun.timeoutId);
      activeRun.controller.abort();
      activeRun = null;
    }
  };
}
