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

const response = (body, status = 200, headers = {}) => ({
  headers: {
    get: (name) => headers[name.toLowerCase()] ?? null,
  },
  json: vi.fn().mockResolvedValue(body),
  ok: status >= 200 && status < 300,
  status,
});

const aloftMap = (valueAtAltitude) =>
  Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => {
      const altitude = (index + 1) * 1000;
      return [`${altitude}`, valueAtAltitude(altitude)];
    })
  );

const validAloftBody = ({ direction = 180, speed = 10, temp = 20, validtime = "18" } = {}) => ({
  direction: aloftMap(() => direction),
  speed: aloftMap(() => speed),
  temp: aloftMap(() => temp),
  validtime,
});

const defaultBody = (url) => {
  if (url.endsWith("/api/weather/gusts")) {
    return [{ gust_speed: 6, wind_speed: 5, received_time: "2026-08-16" }];
  }
  if (url.endsWith("/api/weather/aloft")) {
    return validAloftBody();
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
  const {
    canEvaluateWindSafety,
    aloftStatus,
    astronomyStatus,
    directions,
    gustData,
    historyStatus,
    jumpruns,
    newOffset,
    newSpot,
    received,
    speed,
    sunset,
    windSource,
    windStatus,
  } = useContext(WeatherContext);
  return (
    <>
      <div data-testid="gust-speed">{gustData[0]?.wind_speed ?? "empty"}</div>
      <div data-testid="jumprun-count">
        {Array.isArray(jumpruns) ? jumpruns.length : "error"}
      </div>
      <div data-testid="new-spot">{newSpot || "empty"}</div>
      <div data-testid="new-offset">{newOffset || "empty"}</div>
      <div data-testid="aloft-direction">
        {directions?.[1000] ?? directions?.error ?? "empty"}
      </div>
      <div data-testid="aloft-received">{received || "empty"}</div>
      <div data-testid="sunset">{sunset || "empty"}</div>
      <div data-testid="aloft-status">{aloftStatus.state}</div>
      <div data-testid="aloft-has-sample">
        {aloftStatus.hasSample ? "yes" : "no"}
      </div>
      <div data-testid="astronomy-status">{astronomyStatus.state}</div>
      <div data-testid="astronomy-has-sample">
        {astronomyStatus.hasSample ? "yes" : "no"}
      </div>
      <div data-testid="current-speed">{speed}</div>
      <div data-testid="history-state">{historyStatus.state}</div>
      <div data-testid="safety-ready">
        {canEvaluateWindSafety ? "ready" : "incomplete"}
      </div>
      <div data-testid="wind-source">{windSource}</div>
      <div data-testid="wind-state">{windStatus}</div>
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
          response([{
            direction: 180,
            gust_speed: windSpeed,
            received_time: new Date(Date.now()).toISOString(),
            wind_speed: windSpeed,
          }])
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

  it("uses a validated recent gust row as a bounded backup source", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          return Promise.resolve(
            response([
              {
                direction: "280",
                gust_speed: "14",
                received_time: "2026-08-27T17:59:30Z",
                wind_speed: "11",
              },
            ])
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
    expect(screen.getByTestId("current-speed")).toHaveTextContent("11");
    expect(screen.getByTestId("wind-source")).toHaveTextContent("gust-history");
    expect(screen.getByTestId("wind-state")).toHaveTextContent("backup");
    expect(screen.getByTestId("history-state")).toHaveTextContent("current");
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("incomplete");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/weather/gusts"),
      expect.objectContaining({ cache: "no-store" })
    );

    await act(() => vi.advanceTimersByTimeAsync(61000));
    expect(screen.getByTestId("wind-state")).toHaveTextContent("stale");
    expect(screen.getByTestId("history-state")).toHaveTextContent("stale");
    unmount();
  });

  it("uses the server-time header when evaluating gust age", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:05:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          return Promise.resolve(
            response(
              [{
                direction: "280",
                gust_speed: "14",
                received_time: "2026-08-27T17:59:30Z",
                wind_speed: "11",
              }],
              200,
              { "x-cscwx-server-time": "2026-08-27T18:00:00Z" }
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
    expect(screen.getByTestId("wind-state")).toHaveTextContent("backup");
    expect(screen.getByTestId("history-state")).toHaveTextContent("current");
    unmount();
  });

  it("preserves last-known history across empty and invalid responses", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    let gustCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          gustCalls += 1;
          if (gustCalls === 1) {
            return Promise.resolve(response([{
              direction: "180",
              gust_speed: "12",
              received_time: "2026-08-27T18:00:00Z",
              wind_speed: "10",
            }]));
          }
          return Promise.resolve(response(gustCalls === 2 ? [] : [{}]));
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
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("10");
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("10");
    expect(screen.getByTestId("history-state")).toHaveTextContent("error");
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByTestId("gust-speed")).toHaveTextContent("10");
    expect(screen.getByTestId("history-state")).toHaveTextContent("error");
    unmount();
  });

  it("recovers every REST poller after initial aloft and astronomy failures", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const calls = {
      aloft: 0,
      astronomy: 0,
      gusts: 0,
      jumpruns: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        const endpoint = Object.keys(calls).find((name) =>
          url.includes(`/api/${name === "jumpruns" ? "jumpruns/" : `weather/${name}`}`)
        );
        if (endpoint) {
          calls[endpoint] += 1;
        }
        if (
          (url.endsWith("/api/weather/aloft") ||
            url.endsWith("/api/weather/astronomy")) &&
          calls[endpoint] === 1
        ) {
          return Promise.reject(new Error("initial request failed"));
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
    expect(calls).toEqual({ aloft: 1, astronomy: 1, gusts: 1, jumpruns: 1 });
    expect(screen.getByTestId("aloft-direction")).toHaveTextContent("empty");
    expect(screen.getByTestId("sunset")).toHaveTextContent("empty");
    expect(screen.getByTestId("aloft-status")).toHaveTextContent("error");
    expect(screen.getByTestId("aloft-has-sample")).toHaveTextContent("no");
    expect(screen.getByTestId("astronomy-status")).toHaveTextContent("error");
    expect(screen.getByTestId("astronomy-has-sample")).toHaveTextContent("no");

    act(() => window.dispatchEvent(new Event("focus")));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(calls).toEqual({ aloft: 2, astronomy: 2, gusts: 2, jumpruns: 2 });
    expect(screen.getByTestId("aloft-direction")).toHaveTextContent("180");
    expect(screen.getByTestId("aloft-received")).toHaveTextContent("18");
    expect(screen.getByTestId("sunset")).not.toHaveTextContent("empty");
    expect(screen.getByTestId("aloft-status")).toHaveTextContent("current");
    expect(screen.getByTestId("astronomy-status")).toHaveTextContent("current");

    for (const dispatchRecoveryEvent of [
      () => window.dispatchEvent(new Event("online")),
      () => window.dispatchEvent(new Event("pageshow")),
      () => document.dispatchEvent(new Event("visibilitychange")),
    ]) {
      act(dispatchRecoveryEvent);
      await act(() => vi.advanceTimersByTimeAsync(0));
    }

    expect(calls).toEqual({ aloft: 5, astronomy: 5, gusts: 5, jumpruns: 5 });
    visibility.mockRestore();
    unmount();
  });

  it("preserves successful aloft, astronomy, and jumprun data after later errors", async () => {
    let aloftCalls = 0;
    let astronomyCalls = 0;
    let jumprunCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/aloft")) {
          aloftCalls += 1;
          return aloftCalls === 1
            ? Promise.resolve(response(defaultBody(url)))
            : Promise.reject(new Error("temporary aloft failure"));
        }
        if (url.endsWith("/api/jumpruns/")) {
          jumprunCalls += 1;
          return Promise.resolve(
            response(
              jumprunCalls === 1
                ? { jumpruns: [{ offset: 12, spot: 5 }] }
                : { error: "temporary jumprun failure" }
            )
          );
        }
        if (url.endsWith("/api/weather/astronomy")) {
          astronomyCalls += 1;
          return Promise.resolve(
            response(
              astronomyCalls === 1
                ? defaultBody(url)
                : {
                    results: {
                      civil_twilight_end: null,
                      sunrise: null,
                      sunset: null,
                    },
                  }
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
    expect(screen.getByTestId("aloft-direction")).toHaveTextContent("180");
    expect(screen.getByTestId("aloft-received")).toHaveTextContent("18");
    expect(screen.getByTestId("jumprun-count")).toHaveTextContent("1");
    const sunset = screen.getByTestId("sunset").textContent;
    expect(sunset).not.toBe("empty");

    act(() => window.dispatchEvent(new Event("pageshow")));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByTestId("aloft-direction")).toHaveTextContent("180");
    expect(screen.getByTestId("aloft-received")).toHaveTextContent("18");
    expect(screen.getByTestId("jumprun-count")).toHaveTextContent("1");
    expect(screen.getByTestId("new-spot")).toHaveTextContent(".5");
    expect(screen.getByTestId("new-offset")).toHaveTextContent("1.2");
    expect(screen.getByTestId("sunset")).toHaveTextContent(sunset);
    expect(screen.getByTestId("aloft-status")).toHaveTextContent("error");
    expect(screen.getByTestId("aloft-has-sample")).toHaveTextContent("yes");
    expect(screen.getByTestId("astronomy-status")).toHaveTextContent("error");
    expect(screen.getByTestId("astronomy-has-sample")).toHaveTextContent("yes");
    unmount();
  });

  it("rejects semantically malformed aloft payloads without replacing good data", async () => {
    const missingAltitude = validAloftBody({ direction: 200, validtime: "19" });
    delete missingAltitude.direction["18000"];
    const invalidPayloads = [
      missingAltitude,
      validAloftBody({ direction: 361, validtime: "19" }),
      validAloftBody({ direction: 200, speed: -1, validtime: "19" }),
      validAloftBody({ direction: 200, temp: "not-a-number", validtime: "19" }),
      validAloftBody({ direction: 200, validtime: "24" }),
      validAloftBody({ direction: 200, validtime: "18.5" }),
    ];
    let aloftCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/aloft")) {
          const body =
            aloftCalls === 0
              ? validAloftBody()
              : invalidPayloads[aloftCalls - 1];
          aloftCalls += 1;
          return Promise.resolve(response(body));
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
    expect(screen.getByTestId("aloft-status")).toHaveTextContent("current");
    expect(screen.getByTestId("aloft-direction")).toHaveTextContent("180");
    expect(screen.getByTestId("aloft-received")).toHaveTextContent("18");

    for (let index = 0; index < invalidPayloads.length; index += 1) {
      act(() => window.dispatchEvent(new Event("focus")));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.getByTestId("aloft-status")).toHaveTextContent("error");
      expect(screen.getByTestId("aloft-has-sample")).toHaveTextContent("yes");
      expect(screen.getByTestId("aloft-direction")).toHaveTextContent("180");
      expect(screen.getByTestId("aloft-received")).toHaveTextContent("18");
    }

    expect(aloftCalls).toBe(invalidPayloads.length + 1);
    unmount();
  });
});
