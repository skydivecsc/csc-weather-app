import {
  CURRENT_BACKEND_BUILD_ID,
  CURRENT_BUILD_ID,
} from "./constants";

const BUILD_ID_PATTERN = /^[0-9a-f]{40}$/;

export const resolveRemoteRelease = (manifest) => {
  const legacyBuildId = manifest?.buildId;
  const explicitWeatherBuildId = manifest?.weatherBuildId;
  const weatherBuildId = explicitWeatherBuildId || legacyBuildId;
  const backendBuildId = manifest?.backendBuildId;

  if (
    typeof weatherBuildId !== "string" ||
    !BUILD_ID_PATTERN.test(weatherBuildId) ||
    (legacyBuildId !== undefined &&
      (typeof legacyBuildId !== "string" ||
        !BUILD_ID_PATTERN.test(legacyBuildId))) ||
    (explicitWeatherBuildId !== undefined &&
      (typeof explicitWeatherBuildId !== "string" ||
        !BUILD_ID_PATTERN.test(explicitWeatherBuildId))) ||
    (legacyBuildId !== undefined &&
      explicitWeatherBuildId !== undefined &&
      legacyBuildId !== explicitWeatherBuildId) ||
    (backendBuildId !== undefined &&
      (typeof backendBuildId !== "string" ||
        !BUILD_ID_PATTERN.test(backendBuildId)))
  ) {
    return null;
  }

  const updateAvailable =
    weatherBuildId !== CURRENT_BUILD_ID ||
    (backendBuildId !== undefined &&
      backendBuildId !== CURRENT_BACKEND_BUILD_ID);

  return {
    updateAvailable,
    releaseKey: backendBuildId
      ? `${weatherBuildId}:${backendBuildId}`
      : weatherBuildId,
  };
};
