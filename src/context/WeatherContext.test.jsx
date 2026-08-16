import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeatherProvider from "./WeatherContext";

const socketInstances = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url, protocols) {
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
    this.onmessage = null;
    this.onopen = null;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.url = url;
    socketInstances.push(this);
  }
}

describe("WeatherProvider WebSocket lifecycle", () => {
  beforeEach(() => {
    socketInstances.length = 0;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
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

    socketInstances[1].readyState = MockWebSocket.OPEN;
    unmount();

    expect(socketInstances[1].close).toHaveBeenCalledOnce();
    expect(socketInstances[1].onopen).toBeNull();
    expect(socketInstances[1].onmessage).toBeNull();
  });
});
