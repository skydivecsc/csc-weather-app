import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { loadEnv } from "vite";
import { resolveBuildCommit } from "../vite.config.js";
import { resolveAppVersion } from "./app-version.mjs";

const TARGETS = {
  staging: {
    outputDirectory: "dist/staging",
    settings: {
      VITE_LOGIN_BASE_URL: "https://login.cscwx2.com",
      VITE_PUBLIC_SITE_URL: "https://cscwx2.com",
      VITE_PUBLIC_SITE_LABEL: "cscwx2.com",
      VITE_TRIVIA_SITE_URL: "https://trivia.cscwx2.com",
      VITE_TRIVIA_SITE_LABEL: "trivia.cscwx2.com",
    },
    forbiddenHostname: /(?:^|[^a-z0-9-])(?:[a-z0-9-]+\.)*cscwx\.com(?=$|[^a-z0-9.-])/i,
    forbiddenDescription: "a production cscwx.com hostname",
  },
  production: {
    outputDirectory: "dist/production",
    settings: {
      VITE_LOGIN_BASE_URL: "https://login.cscwx.com",
      VITE_PUBLIC_SITE_URL: "https://cscwx.com",
      VITE_PUBLIC_SITE_LABEL: "cscwx.com",
      VITE_TRIVIA_SITE_URL: "https://trivia.cscwx.com",
      VITE_TRIVIA_SITE_LABEL: "trivia.cscwx.com",
    },
    forbiddenHostname: /(?:^|[^a-z0-9-])(?:[a-z0-9-]+\.)*cscwx2\.com(?=$|[^a-z0-9.-])/i,
    forbiddenDescription: "a staging cscwx2.com hostname",
  },
};

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

const targetName = process.argv[2];
const target = TARGETS[targetName];

if (!target) {
  throw new Error(
    `Usage: node scripts/verify-build-hostnames.mjs <${Object.keys(TARGETS).join("|")}>`,
  );
}

const projectDirectory = process.cwd();
const packageMetadata = JSON.parse(
  readFileSync(resolve(projectDirectory, "package.json"), "utf8")
);
const buildDirectory = resolve(projectDirectory, target.outputDirectory);
const loadedSettings = loadEnv(targetName, projectDirectory, "VITE_");

for (const [name, expectedValue] of Object.entries(target.settings)) {
  if (loadedSettings[name] !== expectedValue) {
    throw new Error(
      `${targetName} requires ${name}=${expectedValue}; received ${loadedSettings[name] || "<missing>"}`,
    );
  }
}

const collectTextFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTextFiles(path);
    }

    return entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))
      ? [path]
      : [];
  });

if (!statSync(buildDirectory).isDirectory()) {
  throw new Error(`Build output is not a directory: ${target.outputDirectory}`);
}

const buildFiles = collectTextFiles(buildDirectory);

if (buildFiles.length === 0) {
  throw new Error(`No text build artifacts found in ${target.outputDirectory}`);
}

const artifacts = buildFiles.map((path) => ({
  content: readFileSync(path, "utf8"),
  path: relative(projectDirectory, path),
}));
const combinedArtifacts = artifacts.map(({ content }) => content).join("\n");
const versionArtifact = artifacts.find(
  ({ path }) => path === `${target.outputDirectory}/version.json`,
);

if (!versionArtifact) {
  throw new Error(`${targetName} build is missing version.json`);
}

let versionManifest;

try {
  versionManifest = JSON.parse(versionArtifact.content);
} catch {
  throw new Error(`${targetName} version.json is not valid JSON`);
}

const expectedBuildCommit = resolveBuildCommit(loadedSettings);
const expectedAppVersion = resolveAppVersion(packageMetadata);

if (versionManifest.version !== expectedAppVersion) {
  throw new Error(
    `${targetName} version.json version does not match package.json`,
  );
}

if (
  !/^[0-9a-f]{40}$/.test(versionManifest.buildId) ||
  versionManifest.buildId !== expectedBuildCommit
) {
  throw new Error(
    `${targetName} version.json buildId does not match the exact build commit`,
  );
}

const javascriptArtifacts = artifacts.filter(
  ({ path }) => extname(path) === ".js",
);

if (
  javascriptArtifacts.length === 0 ||
  !javascriptArtifacts.some(({ content }) =>
    content.includes(expectedBuildCommit),
  )
) {
  throw new Error(
    `${targetName} JavaScript bundle does not contain the version.json buildId`,
  );
}

if (
  !javascriptArtifacts.some(({ content }) =>
    content.includes(expectedAppVersion),
  )
) {
  throw new Error(
    `${targetName} JavaScript bundle does not contain the package.json version`,
  );
}

const requiredBuildLabelMarkers = [
  "build-version",
  "data-app-version",
  "data-build-id",
  "Version ",
  "exact build commit:",
];
const missingBuildLabelMarkers = requiredBuildLabelMarkers.filter(
  (marker) => !combinedArtifacts.includes(marker),
);

if (missingBuildLabelMarkers.length > 0) {
  throw new Error(
    `${targetName} build is missing visible build label metadata: ${missingBuildLabelMarkers.join(", ")}`,
  );
}

for (const [name, expectedValue] of Object.entries(target.settings)) {
  if (!combinedArtifacts.includes(expectedValue)) {
    throw new Error(
      `${targetName} build does not contain the configured ${name} value`,
    );
  }
}

const unresolvedPlaceholders = artifacts
  .filter(({ content }) => /%VITE_[A-Z0-9_]+%/.test(content))
  .map(({ path }) => path);

if (unresolvedPlaceholders.length > 0) {
  throw new Error(
    `Unresolved Vite placeholders in: ${unresolvedPlaceholders.join(", ")}`,
  );
}

const forbiddenAttributionUrl =
  "https://www.linkedin.com/in/ryan-erickson-dev";
const attributionFiles = artifacts
  .filter(({ content }) => content.includes(forbiddenAttributionUrl))
  .map(({ path }) => path);

if (attributionFiles.length > 0) {
  throw new Error(
    `Build contains the retired Ryan Erickson LinkedIn attribution URL in: ${attributionFiles.join(", ")}`,
  );
}

const requiredCreatorCredit = "Created by: Ryan Erickson";

if (!combinedArtifacts.includes(requiredCreatorCredit)) {
  throw new Error(
    `${targetName} build is missing the visible ${requiredCreatorCredit} credit`,
  );
}

const contaminatedFiles = artifacts
  .filter(({ content }) => target.forbiddenHostname.test(content))
  .map(({ path }) => path);

if (contaminatedFiles.length > 0) {
  throw new Error(
    `${targetName} build contains ${target.forbiddenDescription} in: ${contaminatedFiles.join(", ")}`,
  );
}

console.log(
  `Verified ${targetName} hostname isolation across ${buildFiles.length} text artifacts.`,
);
