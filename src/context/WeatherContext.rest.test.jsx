import { useContext } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeatherProvider from "./WeatherContext";
import { WeatherContext } from "./WeatherContextValue";

class SilentWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor() {
    this.close = vi.fn(() => {
      this.readyState = SilentWebSocket.CLOSED;
    });
    this.onmessage = null;
    this.onopen = null;
    this.readyState = SilentWebSocket.CONNECTING;
    this.send = vi.fn();
  }
}

const response = (body, status = 200) => ({
  json: vi.fn().mockResolvedValue(body),
  ok: status >= 200 && status < 300,
  status,
});

const defaultBody = (url) => {
  if (url.endsWith("/api/weather/gusts")) {
    return [{ gust_speed: 6, wind_speed: 5, received_time: "2026-08-16" }];
  }
  if (url.endsWith("/api/weather/aloft")) {
    return {
      direction: { 1000: 180 },
      speed: { 1000: 10 },
      temp: { 1000: 20 },
      validtime: "now",
    };
  }
  if (url.endsWith("/api/jumpruns/")) {
    return { jumpruns: [{ offset: 12, spot: 5 }] };
  }
  if (url.endsWith("/api/weather/astronomy")) {
    return {
      results: {
        civil_twilight_end: "2026-08-16T01:00:00Z",
        sunrise: "2026-08-16T11:00:00Z",
        sunset: "2026-08-16T00:30:00Z",
      },
    };
  }
  throw new Error(`Unexpected URL: ${url}`);
};

function WeatherProbe() {
  const { gustData, jumpruns, newOffset, newSpot } = useContext(WeatherContext);
  return (
    <>
      <div data-testid="gust-speed">{gustData[0]?.wind_speed ?? "empty"}</div>
      <div data-testid="jumprun-count">
        {Array.isArray(jumpruns) ? jumpruns.length : "error"}
      </div>
      <div data-testid="new-spot">{newSpot || "empty"}</div>
      <div data-testid="new-offset">{newOffset || "empty"}</div>
    </>
  );
}

describe("WeatherProvider REST polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", SilentWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the existing endpoint cadences without extra requests", async () => {
    const fetchMock = vi.fn((url) =>
      Promise.resolve(response(defaultBody(url)))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <WeatherProvider>
        <WeatherProbe />
      </WeatherProvider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    const count = (suffix) =>
      fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix)).length;
    expect(count("/api/weather/gusts")).toBe(1);
    expect(count("/api/jumpruns/")).toBe(1);
    expect(count("/api/weather/aloft")).toBe(1);
    expect(count("/api/weather/astronomy")).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(180000));
    expect(count("/api/weather/gusts")).toBe(7);
    expect(count("/api/jumpruns/")).toBe(7);
    expect(count("/api/weather/aloft")).toBe(2);
    expect(count("/api/weather/astronomy")).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(420000));
    expect(count("/api/weather/gusts")).toBe(21);
    expect(count("/api/jumpruns/")).toBe(21);
    expect(count("/api/weather/aloft")).toBe(4);
    expect(count("/api/weather/astronomy")).toBe(2);
    unmount();
  });

  it("retains good gust data after failure and clears an empty jumprun", async () => {
    let gustCalls = 0;
    let jumprunCalls = 0;
    const fetchMock = vi.fn((url) => {
      if (url.endsWith("/api/weather/gusts")) {
        gustCalls += 1;
        if (gustCalls === 2) {
          return Promise.reject(new Error("offline"));
        }
        const windSpeed = gustCalls === 1 ? 10 : 20;
        return Promise.resolve(
          response([{ gust_speed: windSpeed, wind_speed: windSpeed }])
        );
      }
      if (url.endsWith("/api/jumpruns/")) {
        jumprunCalls += 1;
        return Promise.resolve(
          response(
            jumprunCalls === 1
              ? { jumpruns: [{ offset: 12, spot: 5 }] }
              : { jumpruns: [] }
          )
        );
      }
      return Promise.resolve(response(defaultBody(url)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <WeatherProvider>
        <WeatherProbe />
      </WeatherProvider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("10");
    expect(screen.getByTestId("new-spot")).toHaveTextContent(".5");
    expect(screen.getByTestId("new-offset")).toHaveTextContent("1.2");

    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("10");
    expect(screen.getByTestId("jumprun-count")).toHaveTextContent("0");
    expect(screen.getByTestId("new-spot")).toHaveTextContent("empty");
    expect(screen.getByTestId("new-offset")).toHaveTextContent("empty");

    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("20");
    unmount();
  });

  it("aborts every in-flight endpoint request on unmount", async () => {
    const signals = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      })
    );
    const { unmount } = render(
      <WeatherProvider>
        <WeatherProbe />
      </WeatherProvider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(signals).toHaveLength(4);
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("retains the last jumprun when a later response is null", async () => {
    let jumprunCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/jumpruns/")) {
          jumprunCalls += 1;
          return Promise.resolve(
            response(
              jumprunCalls === 1
                ? { jumpruns: [{ offset: 12, spot: 5 }] }
                : null
            )
          );
        }
        return Promise.resolve(response(defaultBody(url)));
      })
    );
    const { unmount } = render(
      <WeatherProvider>
        <WeatherProbe />
      </WeatherProvider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByTestId("jumprun-count")).toHaveTextContent("1");
    expect(screen.getByTestId("new-spot")).toHaveTextContent(".5");
    expect(screen.getByTestId("new-offset")).toHaveTextContent("1.2");
    unmount();
  });
});
