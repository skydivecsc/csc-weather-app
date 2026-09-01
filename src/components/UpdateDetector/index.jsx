import { useEffect, useState } from "react";
import {
  KIOSK_RELOAD_STORAGE_KEY,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_MANIFEST_PATH,
} from "./constants";
import { resolveRemoteRelease } from "./release";
import "./update-detector.css";

const reloadCurrentPage = () => window.location.reload();

function UpdateDetector({
  isKiosk = false,
  reloadPage = reloadCurrentPage,
}) {
  const [availableReleaseKey, setAvailableReleaseKey] = useState(null);

  useEffect(() => {
    let activeController = null;
    let disposed = false;

    const checkForUpdate = async () => {
      if (disposed || activeController) {
        return;
      }

      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(
        () => controller.abort(),
        VERSION_CHECK_TIMEOUT_MS
      );

      try {
        const response = await fetch(VERSION_MANIFEST_PATH, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const manifest = await response.json();
        const remoteRelease = resolveRemoteRelease(manifest);

        if (
          disposed ||
          controller.signal.aborted ||
          !remoteRelease
        ) {
          return;
        }

        setAvailableReleaseKey(
          remoteRelease.updateAvailable ? remoteRelease.releaseKey : null
        );
      } catch {
        // A failed version check must not interrupt the live weather display.
      } finally {
        window.clearTimeout(timeout);
        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    checkForUpdate();
    const interval = window.setInterval(
      checkForUpdate,
      VERSION_CHECK_INTERVAL_MS
    );

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("pageshow", checkForUpdate);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("pageshow", checkForUpdate);
      activeController?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isKiosk || !availableReleaseKey) {
      return;
    }

    try {
      if (
        sessionStorage.getItem(KIOSK_RELOAD_STORAGE_KEY) ===
        availableReleaseKey
      ) {
        return;
      }

      sessionStorage.setItem(
        KIOSK_RELOAD_STORAGE_KEY,
        availableReleaseKey
      );
    } catch {
      // Without session storage, avoid a reload that could loop indefinitely.
      return;
    }

    reloadPage();
  }, [availableReleaseKey, isKiosk, reloadPage]);

  if (!availableReleaseKey) {
    return null;
  }

  return (
    <aside
      aria-atomic="true"
      aria-live="polite"
      className="update-detector"
      role="status"
    >
      <span>A newer CSC Weather version is available.</span>
      <button type="button" onClick={reloadPage}>
        Refresh now
      </button>
    </aside>
  );
}

export default UpdateDetector;
