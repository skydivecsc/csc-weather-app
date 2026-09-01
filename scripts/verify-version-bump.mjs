import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppVersion } from "./app-version.mjs";

const NULL_COMMIT = /^0{40}$/;
const TEST_FILE = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[^/]+$/;
const DOCUMENTATION_FILE =
  /(?:^|\/)(?:README|CHANGELOG|CONTRIBUTING|AGENTS|LICENSE)(?:\.[^/]*)?$|\.(?:md|mdx|rst|txt)$/i;
const CI_ONLY_FILES = new Set([
  ".gitignore",
  ".nvmrc",
  "eslint.config.js",
  "playwright.config.js",
  "vitest.config.js",
  "scripts/verify-build-hostnames.mjs",
  "scripts/verify-version-bump.mjs",
]);

export const isVersionBumpExempt = (path) =>
  !path.startsWith("public/") &&
  (path.startsWith(".github/") ||
    path.startsWith("docs/") ||
    path.startsWith("src/test/") ||
    TEST_FILE.test(path) ||
    DOCUMENTATION_FILE.test(path) ||
    CI_ONLY_FILES.has(path));

const parseVersion = (version) =>
  resolveAppVersion({ version }).split(".").map(Number);

export const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return Math.sign(leftParts[index] - rightParts[index]);
    }
  }

  return 0;
};

export const validateVersionPolicy = ({
  baseVersion,
  changedPaths,
  currentVersion,
  lockPackageVersion,
  lockVersion,
}) => {
  resolveAppVersion({ version: currentVersion });

  if (
    lockVersion !== currentVersion ||
    lockPackageVersion !== currentVersion
  ) {
    throw new Error(
      `package-lock.json versions ${lockVersion || "<missing>"} and ${lockPackageVersion || "<missing>"} must both match package.json version ${currentVersion}`,
    );
  }

  const deployedBehaviorPaths = changedPaths.filter(
    (path) => !isVersionBumpExempt(path),
  );

  if (baseVersion === null) {
    throw new Error(
      "A valid base commit is required for fail-closed change classification",
    );
  }

  resolveAppVersion({ version: baseVersion });
  const versionComparison = compareVersions(currentVersion, baseVersion);

  if (versionComparison < 0) {
    throw new Error(
      `Release version cannot decrease: ${baseVersion} -> ${currentVersion}`,
    );
  }

  if (deployedBehaviorPaths.length === 0) {
    return { deployedBehaviorPaths, versionBumpRequired: false };
  }

  if (versionComparison === 0) {
    throw new Error(
      `Deployed behavior changed without a version increase: ${baseVersion} -> ${currentVersion}. Changed: ${deployedBehaviorPaths.join(", ")}`,
    );
  }

  return { deployedBehaviorPaths, versionBumpRequired: true };
};

const git = (arguments_, projectDirectory) =>
  execFileSync("git", arguments_, {
    cwd: projectDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const main = () => {
  const projectDirectory = process.cwd();
  const baseCommit = process.argv[2]?.trim();
  const packageMetadata = readJson(resolve(projectDirectory, "package.json"));
  const lockMetadata = readJson(
    resolve(projectDirectory, "package-lock.json"),
  );

  if (!baseCommit || NULL_COMMIT.test(baseCommit)) {
    throw new Error(
      "A non-zero base commit is required for fail-closed version enforcement",
    );
  }

  git(["rev-parse", "--verify", `${baseCommit}^{commit}`], projectDirectory);
  const changedOutput = git(
    ["diff", "--name-only", "--no-renames", `${baseCommit}...HEAD`],
    projectDirectory,
  );
  const changedPaths = changedOutput ? changedOutput.split("\n") : [];
  const basePackage = JSON.parse(
    git(["show", `${baseCommit}:package.json`], projectDirectory),
  );
  const result = validateVersionPolicy({
    baseVersion: basePackage.version,
    changedPaths,
    currentVersion: packageMetadata.version,
    lockPackageVersion: lockMetadata.packages?.[""]?.version,
    lockVersion: lockMetadata.version,
  });

  if (result.versionBumpRequired) {
    console.log(
      `Verified version increase ${basePackage.version} -> ${packageMetadata.version} for ${result.deployedBehaviorPaths.length} deployed-behavior path(s).`,
    );
  } else {
    console.log(
      `No version increase required; all ${changedPaths.length} changed path(s) are documentation, test, or CI-only.`,
    );
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
