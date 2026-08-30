import {
  CURRENT_APP_VERSION,
  CURRENT_BUILD_ID,
} from "../UpdateDetector/constants";
import "./build-version.css";

function BuildVersion() {
  const accessibleLabel = `Version ${CURRENT_APP_VERSION}`;
  const buildDetails = `Version ${CURRENT_APP_VERSION}; exact build commit: ${CURRENT_BUILD_ID}`;

  return (
    <span
      aria-label={accessibleLabel}
      className="build-version"
      data-app-version={CURRENT_APP_VERSION}
      data-build-id={CURRENT_BUILD_ID}
      title={buildDetails}
    >
      Version {CURRENT_APP_VERSION}
    </span>
  );
}

export default BuildVersion;
