const STRICT_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const resolveAppVersion = (packageMetadata) => {
  const appVersion =
    typeof packageMetadata?.version === "string"
      ? packageMetadata.version
      : "";

  if (!STRICT_SEMVER_PATTERN.test(appVersion)) {
    throw new Error(
      `package.json version must be a strict semantic version (major.minor.patch); received ${appVersion || "<missing>"}`
    );
  }

  return appVersion;
};
