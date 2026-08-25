import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPolling } from "./polling";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

describe("startPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs immediately and never overlaps a pending request", async () => {
    const first = deferred();
    const request = vi.fn(() => first.promise);
    const onResult = vi.fn();
    const stop = startPolling({
      intervalMs: 1000,
      timeoutMs: 10000,
      request,
      onResult,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledOnce();

    first.resolve("first result");
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledWith("first result");

    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });

  it("aborts a timed-out request and permits the next cadence", async () => {
    const first = deferred();
    const signals = [];
    const request = vi
      .fn(({ signal }) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return Promise.resolve("fresh result");
      });
    const onResult = vi.fn();
    const stop = startPolling({
      intervalMs: 1000,
      timeoutMs: 100,
      request,
      onResult,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(signals[0].aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledWith("fresh result");

    first.resolve("stale result");
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);
    stop();
  });

  it("contains failures and recovers on a later tick", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("recovered");
    const onError = vi.fn();
    const onResult = vi.fn();
    const stop = startPolling({
      intervalMs: 1000,
      request,
      onError,
      onResult,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "offline",
    }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith("recovered");
    stop();
  });

  it("aborts on cleanup and suppresses a late result", async () => {
    const pending = deferred();
    let signal;
    const request = vi.fn(({ signal: requestSignal }) => {
      signal = requestSignal;
      return pending.promise;
    });
    const onResult = vi.fn();
    const stop = startPolling({
      intervalMs: 1000,
      request,
      onResult,
    });

    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(signal.aborted).toBe(true);

    pending.resolve("too late");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onResult).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
  });
});
