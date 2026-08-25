import { useContext } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Manifest from "../components/Manifest";
import LoadProvider from "./LoadContext";
import { LoadContext } from "./LoadContextValue";
import { WeatherContext } from "./WeatherContextValue";

const jsonResponse = (body, status = 200) => ({
  json: vi.fn().mockResolvedValue(body),
  ok: status >= 200 && status < 300,
  status,
});

function LoadProbe() {
  const { loads } = useContext(LoadContext);
  return <div data-testid="loads">{JSON.stringify(loads)}</div>;
}

describe("LoadProvider polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the last good loads after a failure and later recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ loads: [{ name: "Alpha 1" }] }))
      .mockResolvedValueOnce({
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce(jsonResponse({ loads: [{ name: "Bravo 2" }] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LoadProvider>
        <LoadProbe />
      </LoadProvider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("loads")).toHaveTextContent("Alpha 1");

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByTestId("loads")).toHaveTextContent("Alpha 1");

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByTestId("loads")).toHaveTextContent("Bravo 2");
  });

  it("keeps server errors object-shaped so Manifest renders safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Burble unavailable" }, 503)
      )
    );

    render(
      <WeatherContext.Provider value={{ darkTheme: "true" }}>
        <LoadProvider>
          <Manifest />
        </LoadProvider>
      </WeatherContext.Provider>
    );

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Burble unavailable")).toBeInTheDocument();
  });

  it("uses a timeout above the backend's two-call budget", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_, { signal: requestSignal }) => {
        signal = requestSignal;
        return new Promise(() => {});
      })
    );

    const { unmount } = render(
      <LoadProvider>
        <LoadProbe />
      </LoadProvider>
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(signal.aborted).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(signal.aborted).toBe(true);
    unmount();
  });
});
