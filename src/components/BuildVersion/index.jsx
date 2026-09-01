import {
  CURRENT_BACKEND_BUILD_ID,
  CURRENT_APP_VERSION,
  CURRENT_WEATHER_BUILD_ID,
} from "../UpdateDetector/constants";
import "./build-version.css";

function BuildVersion() {
  const accessibleLabel = `Version ${CURRENT_APP_VERSION}`;
  const buildDetails = `Version ${CURRENT_APP_VERSION}; exact weather commit: ${CURRENT_WEATHER_BUILD_ID}; exact backend commit: ${CURRENT_BACKEND_BUILD_ID}`;

  return (
    <span
      aria-label={accessibleLabel}
      className="build-version"
      data-app-version={CURRENT_APP_VERSION}
      data-backend-build-id={CURRENT_BACKEND_BUILD_ID}
      data-build-id={CURRENT_WEATHER_BUILD_ID}
      data-weather-build-id={CURRENT_WEATHER_BUILD_ID}
      title={buildDetails}
    >
      Version {CURRENT_APP_VERSION}
    </span>
  );
}

export default BuildVersion;
