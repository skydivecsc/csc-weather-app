import { StrictMode, useContext } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeatherProvider from "./WeatherContext";
import { WeatherContext } from "./WeatherContextValue";

const socketInstances = [];

const response = (body, status = 200) => ({
  headers: { get: () => null },
  json: vi.fn().mockResolvedValue(body),
  ok: status >= 200 && status < 300,
  status,
});

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url, protocols) {
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.onopen = null;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.url = url;
    socketInstances.push(this);
  }
}

function SocketProbe() {
  const {
    canEvaluateWindSafety,
    gustHistoryStatus,
    isAwosLive,
    speed,
    weatherStatus,
    windSource,
    windStatus,
  } = useContext(WeatherContext);
  return (
    <>
      <div data-testid="socket-status">{isAwosLive ? "LIVE" : "DOWN"}</div>
      <div data-testid="socket-speed">{speed}</div>
      <div data-testid="weather-status">{weatherStatus.state}</div>
      <div data-testid="wind-source">{windSource}</div>
      <div data-testid="wind-state">{windStatus}</div>
      <div data-testid="gust-history-state">{gustHistoryStatus.state}</div>
      <div data-testid="safety-ready">
        {canEvaluateWindSafety ? "ready" : "incomplete"}
      </div>
    </>
  );
}

const renderProvider = (children = <SocketProbe />) =>
  render(<WeatherProvider>{children}</WeatherProvider>);

const openAndAcknowledge = (socket) => {
  socket.readyState = MockWebSocket.OPEN;
  act(() => socket.onopen());
  act(() =>
    socket.onmessage({ data: JSON.stringify({ type: "connection_ack" }) })
  );
};

const sendWindReport = (socket, wind) => {
  act(() =>
    socket.onmessage({
      data: JSON.stringify({
        id: "wind",
        payload: {
          data: {
            wind: {
              receivedAt: new Date(Date.now()).toISOString(),
              ...wind,
            },
          },
        },
        type: "data",
      }),
    })
  );
};

const sendWind = (socket, speed = 12) =>
  sendWindReport(socket, {
    direction: 180,
    gustSpeed: 15,
    speed,
    variableDirection: [170, 190],
  });

const sendWeather = (socket, temperature = 70) => {
  act(() =>
    socket.onmessage({
      data: JSON.stringify({
        id: "weather",
        payload: {
          data: {
            weather: {
              receivedAt: new Date(Date.now()).toISOString(),
              metar: "KAAA 010000Z CLR 70 50 A3000",
              presentWeather: null,
              skyCondition: [{ altitude: null, cloudCover: "CLR" }],
              temperature,
            },
          },
        },
        type: "data",
      }),
    })
  );
};

describe("WeatherProvider WebSocket lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    socketInstances.length = 0;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("closes superseded and unmounted connections under Strict Mode", () => {
    const { unmount } = render(
      <StrictMode>
        <WeatherProvider>
          <div>Weather consumer</div>
        </WeatherProvider>
      </StrictMode>
    );

    expect(socketInstances).toHaveLength(2);
    expect(socketInstances[0].close).toHaveBeenCalledOnce();
    expect(socketInstances[0].onopen).toBeNull();
    expect(socketInstances[0].onmessage).toBeNull();
    expect(socketInstances[0].onerror).toBeNull();
    expect(socketInstances[0].onclose).toBeNull();

    socketInstances[1].readyState = MockWebSocket.OPEN;
    unmount();

    expect(socketInstances[1].close).toHaveBeenCalledOnce();
    expect(socketInstances[1].onopen).toBeNull();
    expect(socketInstances[1].onmessage).toBeNull();
    expect(socketInstances[1].onerror).toBeNull();
    expect(socketInstances[1].onclose).toBeNull();
  });

  it("waits for connection acknowledgement before subscribing", () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    socket.readyState = MockWebSocket.OPEN;

    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    act(() => socket.onopen());
    expect(socket.send).toHaveBeenCalledOnce();
    expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({
      type: "connection_init",
    });

    act(() => socket.onmessage({ data: JSON.stringify({ type: "ka" }) }));
    expect(socket.send).toHaveBeenCalledOnce();

    act(() =>
      socket.onmessage({ data: JSON.stringify({ type: "connection_ack" }) })
    );
    expect(socket.send).toHaveBeenCalledTimes(3);
    expect(
      socket.send.mock.calls.slice(1).map(([message]) => JSON.parse(message).id)
    ).toEqual(["weather", "wind"]);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    act(() =>
      socket.onmessage({ data: JSON.stringify({ type: "connection_ack" }) })
    );
    expect(socket.send).toHaveBeenCalledTimes(3);

    sendWind(socket);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");
    unmount();
  });

  it("disconnects and retries when the server never acknowledges", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    socket.readyState = MockWebSocket.OPEN;
    act(() => socket.onopen());

    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(socket.close).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(socketInstances).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socketInstances).toHaveLength(2);
    unmount();
  });

  it("disconnects an acknowledged socket that never sends data", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    openAndAcknowledge(socket);

    await act(() => vi.advanceTimersByTimeAsync(14999));
    expect(socket.close).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    expect(screen.getByTestId("wind-state")).toHaveTextContent("unavailable");
    unmount();
  });

  it("accepts the live API's calm-wind shape", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    openAndAcknowledge(socket);

    sendWindReport(socket, {
      direction: null,
      gustSpeed: null,
      speed: 0,
      variableDirection: null,
    });
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");
    expect(screen.getByTestId("socket-speed")).toHaveTextContent("0");

    await act(() => vi.advanceTimersByTimeAsync(14999));
    expect(socket.close).not.toHaveBeenCalled();
    unmount();
  });

  it("marks a previously live socket down when data becomes stale", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    sendWind(socket);

    await act(() => vi.advanceTimersByTimeAsync(14999));
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    unmount();
  });

  it("ignores duplicate and out-of-order wind timestamps without extending freshness", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    const firstTimestamp = new Date(Date.now()).toISOString();

    sendWindReport(socket, {
      direction: 180,
      gustSpeed: 15,
      receivedAt: firstTimestamp,
      speed: 12,
      variableDirection: null,
    });
    await act(() => vi.advanceTimersByTimeAsync(10000));
    sendWindReport(socket, {
      direction: 190,
      gustSpeed: 20,
      receivedAt: firstTimestamp,
      speed: 99,
      variableDirection: null,
    });
    sendWindReport(socket, {
      direction: 200,
      gustSpeed: 20,
      receivedAt: "2026-08-27T17:59:59Z",
      speed: 98,
      variableDirection: null,
    });

    expect(screen.getByTestId("socket-speed")).toHaveTextContent("12");
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(socket.close).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("wind-state")).toHaveTextContent("stale");
    unmount();
  });

  it("keeps weather current without letting weather frames extend wind freshness", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    sendWind(socket, 12);

    await act(() => vi.advanceTimersByTimeAsync(10000));
    sendWeather(socket);
    expect(screen.getByTestId("weather-status")).toHaveTextContent("live");

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("wind-state")).toHaveTextContent("stale");
    expect(screen.getByTestId("weather-status")).toHaveTextContent("live");
    unmount();
  });

  it("enables safety evaluation only with live wind and current history", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          return Promise.resolve(response([{
            direction: "180",
            gust_speed: "15",
            received_time: "2026-08-27T18:00:00Z",
            wind_speed: "12",
          }]));
        }
        return new Promise(() => {});
      })
    );
    const { unmount } = renderProvider();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("gust-history-state")).toHaveTextContent("current");
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("incomplete");

    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    sendWind(socket, 12);
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("ready");

    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("incomplete");
    unmount();
  });

  it("fails safety evaluation when current history polling errors", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    let gustCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          gustCalls += 1;
          return gustCalls === 1
            ? Promise.resolve(response([{
                direction: "180",
                gust_speed: "15",
                received_time: "2026-08-27T18:00:00Z",
                wind_speed: "12",
              }]))
            : Promise.reject(new Error("offline"));
        }
        return new Promise(() => {});
      })
    );
    const { unmount } = renderProvider();
    await act(() => vi.advanceTimersByTimeAsync(0));
    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    sendWind(socket, 12);
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("ready");

    act(() => window.dispatchEvent(new Event("focus")));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("gust-history-state")).toHaveTextContent("error");
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("incomplete");
    unmount();
  });

  it("fails safety evaluation when gust history ages out while wind stays live", async () => {
    vi.setSystemTime(new Date("2026-08-27T18:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.endsWith("/api/weather/gusts")) {
          return Promise.resolve(response([{
            direction: "180",
            gust_speed: "15",
            received_time: "2026-08-27T18:00:00Z",
            wind_speed: "12",
          }]));
        }
        return new Promise(() => {});
      })
    );
    const { unmount } = renderProvider();
    await act(() => vi.advanceTimersByTimeAsync(0));
    const socket = socketInstances[0];
    openAndAcknowledge(socket);
    sendWind(socket, 12);

    for (let elapsed = 10000; elapsed <= 90000; elapsed += 10000) {
      await act(() => vi.advanceTimersByTimeAsync(10000));
      sendWind(socket, 12);
    }
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("ready");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByTestId("wind-state")).toHaveTextContent("live");
    expect(screen.getByTestId("gust-history-state")).toHaveTextContent("stale");
    expect(screen.getByTestId("safety-ready")).toHaveTextContent("incomplete");
    unmount();
  });

  it("reconnects after malformed or complete frames and ignores stale data", async () => {
    const { unmount } = renderProvider();
    const firstSocket = socketInstances[0];
    const firstClose = firstSocket.onclose;
    const staleMessage = firstSocket.onmessage;

    act(() => {
      firstClose();
      firstClose();
    });
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    expect(socketInstances).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(socketInstances).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socketInstances).toHaveLength(2);

    const replacement = socketInstances[1];
    openAndAcknowledge(replacement);

    act(() =>
      staleMessage({
        data: JSON.stringify({
          id: "wind",
          payload: { data: { wind: { speed: 99 } } },
          type: "data",
        }),
      })
    );
    expect(screen.getByTestId("socket-speed")).toHaveTextContent("0");

    sendWind(replacement, 12);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");
    expect(screen.getByTestId("socket-speed")).toHaveTextContent("12");

    const malformedHandler = replacement.onmessage;
    expect(() =>
      act(() => malformedHandler({ data: "not json" }))
    ).not.toThrow();
    expect(replacement.onmessage).toBeNull();
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    const afterMalformed = socketInstances[2];
    openAndAcknowledge(afterMalformed);
    sendWind(afterMalformed, 13);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");

    const completeHandler = afterMalformed.onmessage;
    act(() =>
      completeHandler({ data: JSON.stringify({ type: "complete" }) })
    );
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(socketInstances).toHaveLength(4);
    unmount();
  });

  it("rejects empty wind, malformed weather, and GraphQL errors", async () => {
    const { unmount } = renderProvider();
    const firstSocket = socketInstances[0];
    openAndAcknowledge(firstSocket);
    sendWind(firstSocket);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");

    const windHandler = firstSocket.onmessage;
    act(() =>
      windHandler({
        data: JSON.stringify({
          id: "wind",
          payload: { data: { wind: {} } },
          type: "data",
        }),
      })
    );
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    expect(screen.getByTestId("socket-speed")).toHaveTextContent("12");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    const secondSocket = socketInstances[1];
    openAndAcknowledge(secondSocket);
    sendWeather(secondSocket);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    expect(screen.getByTestId("weather-status")).toHaveTextContent("live");

    const weatherHandler = secondSocket.onmessage;
    expect(() =>
      act(() =>
        weatherHandler({
          data: JSON.stringify({
            id: "weather",
            payload: {
              data: {
                  weather: {
                  receivedAt: new Date(Date.now()).toISOString(),
                  metar: "KAAA 010000Z CLR 70 50 A3000",
                  presentWeather: {},
                  skyCondition: [{ altitude: null, cloudCover: "CLR" }],
                  temperature: 70,
                },
              },
            },
            type: "data",
          }),
        })
      )
    ).not.toThrow();
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    await act(() => vi.advanceTimersByTimeAsync(2000));
    const thirdSocket = socketInstances[2];
    openAndAcknowledge(thirdSocket);
    sendWind(thirdSocket, 14);
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");

    const errorHandler = thirdSocket.onmessage;
    act(() =>
      errorHandler({
        data: JSON.stringify({
          id: "wind",
          payload: {
            data: {
              wind: {
                direction: 180,
                gustSpeed: 15,
                speed: 99,
                variableDirection: [170, 190],
              },
            },
            errors: [{ message: "partial upstream failure" }],
          },
          type: "data",
        }),
      })
    );
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");
    expect(screen.getByTestId("socket-speed")).toHaveTextContent("14");
    unmount();
  });

  it("backs off with bounded jitter at the cap and resets only after fresh wind", async () => {
    const { unmount } = renderProvider();
    Math.random.mockReturnValue(0);
    const expectedDelays = [800, 1600, 3200, 6400, 12800, 24000, 24000];

    for (const delay of expectedDelays) {
      const socket = socketInstances.at(-1);
      openAndAcknowledge(socket);
      const close = socket.onclose;
      act(() => close());
      const countBeforeRetry = socketInstances.length;

      await act(() => vi.advanceTimersByTimeAsync(delay - 1));
      expect(socketInstances).toHaveLength(countBeforeRetry);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(socketInstances).toHaveLength(countBeforeRetry + 1);
    }

    const recoveredSocket = socketInstances.at(-1);
    openAndAcknowledge(recoveredSocket);
    sendWind(recoveredSocket, 12);
    act(() => recoveredSocket.onclose());
    const countBeforeResetRetry = socketInstances.length;
    await act(() => vi.advanceTimersByTimeAsync(799));
    expect(socketInstances).toHaveLength(countBeforeResetRetry);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(socketInstances).toHaveLength(countBeforeResetRetry + 1);

    unmount();
  });

  it("coalesces an error and close into one reconnect", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];
    const error = socket.onerror;
    const close = socket.onclose;

    act(() => {
      error();
      close();
    });
    expect(screen.getByTestId("socket-status")).toHaveTextContent("DOWN");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(socketInstances).toHaveLength(2);
    unmount();
  });

  it("recovers immediately on focus, pageshow, and visible lifecycle events", () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const { unmount } = renderProvider();

    act(() => socketInstances[0].onclose());
    act(() => window.dispatchEvent(new Event("focus")));
    expect(socketInstances).toHaveLength(2);

    act(() => socketInstances[1].onclose());
    act(() => window.dispatchEvent(new Event("pageshow")));
    expect(socketInstances).toHaveLength(3);

    visibility.mockReturnValue("hidden");
    act(() => socketInstances[2].onclose());
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(socketInstances).toHaveLength(3);
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(socketInstances).toHaveLength(4);
    unmount();
  });

  it("suspends reconnects offline and reconnects immediately online", async () => {
    const { unmount } = renderProvider();
    const socket = socketInstances[0];

    act(() => window.dispatchEvent(new Event("offline")));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(screen.getByTestId("wind-state")).toHaveTextContent("unavailable");
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(socketInstances).toHaveLength(1);

    act(() => window.dispatchEvent(new Event("online")));
    expect(socketInstances).toHaveLength(2);
    expect(screen.getByTestId("wind-state")).toHaveTextContent("connecting");
    unmount();
  });

  it("does not reconnect after unmount while a retry is pending", async () => {
    const { unmount } = renderProvider();
    const close = socketInstances[0].onclose;
    act(() => close());
    unmount();

    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(socketInstances).toHaveLength(1);
  });
});
