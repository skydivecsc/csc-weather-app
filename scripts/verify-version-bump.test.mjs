import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isVersionBumpExempt,
  validateVersionPolicy,
} from "./verify-version-bump.mjs";

describe("release version policy", () => {
  it("orders strict semantic versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("2.0.0", "3.0.0")).toBe(-1);
  });

  it.each([
    "README.md",
    "docs/release.md",
    "src/components/Footer/index.test.jsx",
    "tests/browser/update-detector.e2e.js",
    ".github/workflows/ci.yml",
    "scripts/verify-build-hostnames.mjs",
  ])("exempts documentation, test, and CI-only path %s", (path) => {
    expect(isVersionBumpExempt(path)).toBe(true);
  });

  it.each([
    "src/App.jsx",
    "public/favicon.ico",
    "public/robots.txt",
    "public/release-notes.md",
    "vite.config.js",
    "release-metadata.json",
    "package.json",
  ])("treats deployed path %s as versioned behavior", (path) => {
    expect(isVersionBumpExempt(path)).toBe(false);
  });

  it("requires an increase for a deployed-behavior change", () => {
    expect(() =>
      validateVersionPolicy({
        baseVersion: "1.0.1",
        changedPaths: ["src/App.jsx"],
        currentVersion: "1.0.1",
        lockPackageVersion: "1.0.1",
        lockVersion: "1.0.1",
      }),
    ).toThrow(/without a version increase/);
  });

  it("accepts a release increase and reports deployed paths", () => {
    expect(
      validateVersionPolicy({
        baseVersion: "1.0.0",
        changedPaths: ["README.md", "src/App.jsx"],
        currentVersion: "1.0.1",
        lockPackageVersion: "1.0.1",
        lockVersion: "1.0.1",
      }),
    ).toEqual({
      deployedBehaviorPaths: ["src/App.jsx"],
      versionBumpRequired: true,
    });
  });

  it("does not require an increase for exempt-only changes", () => {
    expect(
      validateVersionPolicy({
        baseVersion: "1.0.1",
        changedPaths: ["README.md", ".github/workflows/ci.yml"],
        currentVersion: "1.0.1",
        lockPackageVersion: "1.0.1",
        lockVersion: "1.0.1",
      }),
    ).toEqual({
      deployedBehaviorPaths: [],
      versionBumpRequired: false,
    });
  });

  it("rejects a version decrease even when no deployed behavior changed", () => {
    expect(() =>
      validateVersionPolicy({
        baseVersion: "1.0.1",
        changedPaths: ["README.md"],
        currentVersion: "1.0.0",
        lockPackageVersion: "1.0.0",
        lockVersion: "1.0.0",
      }),
    ).toThrow(/Release version cannot decrease: 1\.0\.1 -> 1\.0\.0/);
  });

  it("always requires package and lock versions to agree", () => {
    expect(() =>
      validateVersionPolicy({
        baseVersion: "1.0.0",
        changedPaths: ["README.md"],
        currentVersion: "1.0.1",
        lockPackageVersion: "1.0.0",
        lockVersion: "1.0.0",
      }),
    ).toThrow(/must both match/);
  });

  it("fails closed without a usable base version", () => {
    expect(() =>
      validateVersionPolicy({
        baseVersion: null,
        changedPaths: [],
        currentVersion: "1.0.1",
        lockPackageVersion: "1.0.1",
        lockVersion: "1.0.1",
      }),
    ).toThrow(/valid base commit is required/);
  });
});
