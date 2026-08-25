import { StrictMode, useContext } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeatherProvider from "./WeatherContext";
import { WeatherContext } from "./WeatherContextValue";

const socketInstances = [];

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
  const { isAwosLive, speed } = useContext(WeatherContext);
  return (
    <>
      <div data-testid="socket-status">{isAwosLive ? "LIVE" : "DOWN"}</div>
      <div data-testid="socket-speed">{speed}</div>
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
            wind,
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
    socketInstances.length = 0;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(screen.getByTestId("socket-status")).toHaveTextContent("LIVE");

    const weatherHandler = secondSocket.onmessage;
    expect(() =>
      act(() =>
        weatherHandler({
          data: JSON.stringify({
            id: "weather",
            payload: {
              data: {
                weather: {
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

    await act(() => vi.advanceTimersByTimeAsync(1000));
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

  it("backs off repeated acknowledged disconnects and caps the delay", async () => {
    const { unmount } = renderProvider();
    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];

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

  it("does not reconnect after unmount while a retry is pending", async () => {
    const { unmount } = renderProvider();
    const close = socketInstances[0].onclose;
    act(() => close());
    unmount();

    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(socketInstances).toHaveLength(1);
  });
});
