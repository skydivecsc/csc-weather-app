export const CURRENT_APP_VERSION = import.meta.env.VITE_APP_VERSION;
export const CURRENT_WEATHER_BUILD_ID = import.meta.env.VITE_BUILD_COMMIT;
export const CURRENT_BACKEND_BUILD_ID =
  import.meta.env.VITE_BACKEND_BUILD_COMMIT;
// Retain this alias for integrations that still call the weather commit buildId.
export const CURRENT_BUILD_ID = CURRENT_WEATHER_BUILD_ID;
export const KIOSK_RELOAD_STORAGE_KEY = "cscwx:kiosk-reloaded-build";
export const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const VERSION_CHECK_TIMEOUT_MS = 10 * 1000;
export const VERSION_MANIFEST_PATH = "/version.json";
