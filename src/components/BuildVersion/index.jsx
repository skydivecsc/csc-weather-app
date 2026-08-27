import { CURRENT_BUILD_ID } from "../UpdateDetector/constants";
import "./build-version.css";

const SHORT_BUILD_ID_LENGTH = 8;

function BuildVersion() {
  const shortBuildId = CURRENT_BUILD_ID.slice(0, SHORT_BUILD_ID_LENGTH);
  const accessibleLabel = `Build ${shortBuildId}; full build commit ${CURRENT_BUILD_ID}`;

  return (
    <span
      aria-label={accessibleLabel}
      className="build-version"
      data-build-id={CURRENT_BUILD_ID}
      title={`Full build commit: ${CURRENT_BUILD_ID}`}
    >
      Build {shortBuildId}
    </span>
  );
}

export default BuildVersion;
