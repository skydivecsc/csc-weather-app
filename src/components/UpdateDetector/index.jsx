import { useEffect, useState } from "react";
import {
  CURRENT_BUILD_ID,
  KIOSK_RELOAD_STORAGE_KEY,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_MANIFEST_PATH,
} from "./constants";
import "./update-detector.css";

const BUILD_ID_PATTERN = /^[0-9a-f]{40}$/;
const reloadCurrentPage = () => window.location.reload();

function UpdateDetector({
  isKiosk = false,
  reloadPage = reloadCurrentPage,
}) {
  const [availableBuildId, setAvailableBuildId] = useState(null);

  useEffect(() => {
    let activeController = null;
    let disposed = false;

    const checkForUpdate = async () => {
      if (disposed || activeController) {
        return;
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch(VERSION_MANIFEST_PATH, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const manifest = await response.json();
        const remoteBuildId = manifest?.buildId;

        if (
          disposed ||
          controller.signal.aborted ||
          typeof remoteBuildId !== "string" ||
          !BUILD_ID_PATTERN.test(remoteBuildId)
        ) {
          return;
        }

        setAvailableBuildId(
          remoteBuildId === CURRENT_BUILD_ID ? null : remoteBuildId
        );
      } catch {
        // A failed version check must not interrupt the live weather display.
      } finally {
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
    if (!isKiosk || !availableBuildId) {
      return;
    }

    try {
      if (
        sessionStorage.getItem(KIOSK_RELOAD_STORAGE_KEY) === availableBuildId
      ) {
        return;
      }

      sessionStorage.setItem(KIOSK_RELOAD_STORAGE_KEY, availableBuildId);
    } catch {
      // Without session storage, avoid a reload that could loop indefinitely.
      return;
    }

    reloadPage();
  }, [availableBuildId, isKiosk, reloadPage]);

  if (!availableBuildId) {
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
