import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateDetector from ".";
import {
  CURRENT_APP_VERSION,
  CURRENT_BUILD_ID,
  KIOSK_RELOAD_STORAGE_KEY,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_MANIFEST_PATH,
} from "./constants";

const manifestResponse = (
  buildId,
  { ok = true, version = CURRENT_APP_VERSION } = {}
) => ({
  json: () =>
    Promise.resolve(version === null ? { buildId } : { version, buildId }),
  ok,
});

describe("UpdateDetector", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("checks the no-store version manifest on startup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      manifestResponse(CURRENT_BUILD_ID)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UpdateDetector />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      VERSION_MANIFEST_PATH,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers a refresh when the build changes without a version change", async () => {
    const reloadPage = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          manifestResponse("1111111111111111111111111111111111111111")
        )
    );

    render(<UpdateDetector reloadPage={reloadPage} />);

    const prompt = await screen.findByRole("status");
    expect(prompt).toHaveTextContent(
      "A newer CSC Weather version is available."
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("does not offer a refresh when only the human version differs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        manifestResponse(CURRENT_BUILD_ID, { version: "9.9.9" })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<UpdateDetector />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("supports a legacy build-only manifest during rollout", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          manifestResponse("4444444444444444444444444444444444444444", {
            version: null,
          })
        )
    );

    render(<UpdateDetector />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "A newer CSC Weather version is available."
    );
  });

  it("reloads the kiosk once for each available build", async () => {
    const reloadPage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        manifestResponse("2222222222222222222222222222222222222222")
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(
      <UpdateDetector isKiosk reloadPage={reloadPage} />
    );

    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(KIOSK_RELOAD_STORAGE_KEY)).toBe(
      "2222222222222222222222222222222222222222"
    );

    firstRender.unmount();
    render(<UpdateDetector isKiosk reloadPage={reloadPage} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("checks again every five minutes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      manifestResponse(CURRENT_BUILD_ID)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UpdateDetector />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks again on pageshow, online, focus, and return to a visible tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      manifestResponse(CURRENT_BUILD_ID)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UpdateDetector />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event("pageshow"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    delete document.visibilityState;
  });

  it("removes foreground recovery listeners when unmounted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      manifestResponse(CURRENT_BUILD_ID)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<UpdateDetector />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    unmount();

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pageshow"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledOnce();
    delete document.visibilityState;
  });

  it("keeps the weather display uninterrupted when a check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<UpdateDetector />);

    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
