import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { loadEnv } from "vite";

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
