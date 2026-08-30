import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import WebCam from ".";

const YARD_PLAYER_URL =
  "https://api.wetmet.net/widgets/stream/frame.php?uid=7795ed8bc355d24aee9b77b82884944a";
const STALE_AFTER_MS = 25 * 60 * 1000;
const START_TIME = new Date("2026-08-29T12:00:00Z");

const renderWebcam = (webcamDirection = "yard") => {
  const setWebcamDirection = vi.fn();

  render(
    <WeatherContext.Provider
      value={{
        darkTheme: "true",
        setWebcamDirection,
        webcamDirection,
      }}
    >
      <WebCam />
    </WeatherContext.Provider>
  );

  return { setWebcamDirection };
};

const yardFrame = () => screen.getByTitle("CSC Yard webcam");

const frameUrl = () => new URL(yardFrame().getAttribute("src"));

const expectYardEndpoint = (url) => {
  expect(`${url.origin}${url.pathname}`).toBe(
    "https://api.wetmet.net/widgets/stream/frame.php"
  );
  expect(url.searchParams.get("uid")).toBe(
    "7795ed8bc355d24aee9b77b82884944a"
  );
  expect(url.searchParams.get("cscwx_reload")).toMatch(/^\d+$/);
};

describe("WebCam Yard player", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
  });

  afterEach(() => {
    delete document.visibilityState;
    vi.useRealTimers();
  });

  it("delegates media permissions and offers a direct fallback", () => {
    renderWebcam();

    const iframe = yardFrame();
    expect(iframe).toHaveAttribute("allow");
    const permissions = (iframe.getAttribute("allow") || "")
      .split(";")
      .map((permission) => permission.trim());

    expect(permissions).toEqual(
      expect.arrayContaining(["autoplay", "fullscreen"])
    );
    expect(iframe).toHaveAttribute("allowfullscreen");
    expectYardEndpoint(frameUrl());

    const directLink = screen.getByRole("link", {
      name: "Open Yard camera directly",
    });
    expect(directLink).toHaveAttribute("href", YARD_PLAYER_URL);
    expect(directLink).toHaveAttribute("target", "_blank");
    expect(directLink.getAttribute("rel").split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"])
    );
  });

  it("always obtains a fresh frame when Reload is selected", () => {
    renderWebcam();
    const initialUrl = frameUrl();

    vi.setSystemTime(START_TIME.getTime() + 1000);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload Yard camera" })
    );

    const reloadedUrl = frameUrl();
    expectYardEndpoint(reloadedUrl);
    expect(reloadedUrl.href).not.toBe(initialUrl.href);
  });

  it("refreshes foreground recovery events only after the frame is stale", () => {
    renderWebcam();
    const initialUrl = frameUrl().href;

    vi.setSystemTime(START_TIME.getTime() + STALE_AFTER_MS - 1);
    act(() => window.dispatchEvent(new Event("pageshow")));
    expect(frameUrl().href).toBe(initialUrl);

    vi.setSystemTime(START_TIME.getTime() + STALE_AFTER_MS);
    act(() => window.dispatchEvent(new Event("pageshow")));
    const pageshowUrl = frameUrl().href;
    expect(pageshowUrl).not.toBe(initialUrl);

    vi.setSystemTime(START_TIME.getTime() + 2 * STALE_AFTER_MS - 1);
    act(() => window.dispatchEvent(new Event("online")));
    expect(frameUrl().href).toBe(pageshowUrl);

    vi.setSystemTime(START_TIME.getTime() + 2 * STALE_AFTER_MS);
    act(() => window.dispatchEvent(new Event("online")));
    const onlineUrl = frameUrl().href;
    expect(onlineUrl).not.toBe(pageshowUrl);

    vi.setSystemTime(START_TIME.getTime() + 3 * STALE_AFTER_MS);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frameUrl().href).toBe(onlineUrl);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frameUrl().href).not.toBe(onlineUrl);
  });

  it("does not show Yard recovery controls for snapshot cameras", () => {
    renderWebcam("east");

    expect(screen.queryByTitle("CSC Yard webcam")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reload Yard camera" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open Yard camera directly" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("https://webcam.skydivecsc.com/hangar_ne?")
    );
  });
});
