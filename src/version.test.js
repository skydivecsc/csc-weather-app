import { describe, expect, it } from "vitest";
import { resolveAppVersion } from "../scripts/app-version.mjs";
import { resolveBackendBuildCommit } from "../scripts/backend-build.mjs";

const BACKEND_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BACKEND_TREE = "dddddddddddddddddddddddddddddddddddddddd";
const RELEASE_METADATA = {
  backendBuildId: BACKEND_COMMIT,
  backendTreeId: BACKEND_TREE,
};

describe("application version", () => {
  it("accepts a strict major.minor.patch version", () => {
    expect(resolveAppVersion({ version: "1.0.0" })).toBe("1.0.0");
    expect(resolveAppVersion({ version: "12.34.56" })).toBe("12.34.56");
  });

  it.each([
    "",
    "1",
    "1.0",
    "v1.0.0",
    "01.0.0",
    "1.0.0-beta.1",
    " 1.0.0 ",
  ])(
    "rejects unsupported version %j",
    (version) => {
      expect(() => resolveAppVersion({ version })).toThrow(
        /strict semantic version/
      );
    }
  );
});

describe("paired backend release commit", () => {
  it("accepts an exact commit from checked release metadata", () => {
    expect(
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {}
      )
    ).toBe(BACKEND_COMMIT);
  });

  it("accepts a matching deployment override", () => {
    expect(
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        { CSCWX_BACKEND_COMMIT: BACKEND_COMMIT }
      )
    ).toBe(BACKEND_COMMIT);
  });

  it.each([
    undefined,
    "",
    "abc123",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ])("rejects invalid checked commit %j", (backendBuildId) => {
    expect(() =>
      resolveBackendBuildCommit(
        { backendBuildId, backendTreeId: BACKEND_TREE },
        {},
        {}
      )
    ).toThrow(/exact lowercase 40-character Git SHA/);
  });

  it("accepts a different production merge commit only for the checked tree", () => {
    const productionCommit =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {
          CSCWX_BACKEND_COMMIT: productionCommit,
          CSCWX_BACKEND_TREE: BACKEND_TREE,
          CSCWX_BACKEND_REPOSITORY: "/verified/backend",
        },
        {
          target: "production",
          commitTreeResolver: (_repository, commit) => {
            expect(commit).toBe(productionCommit);
            return BACKEND_TREE;
          },
        },
      )
    ).toBe(productionCommit);
  });

  it("rejects a different commit without the checked tree", () => {
    expect(() =>
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {
          CSCWX_BACKEND_COMMIT:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        }
      )
    ).toThrow(/allowed only for production/);
  });

  it("rejects a different production commit without the checked tree", () => {
    expect(() =>
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {
          CSCWX_BACKEND_COMMIT:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        { target: "production" },
      )
    ).toThrow(/requires its verified tree SHA/);
  });

  it("rejects a tree-equivalent production commit in a staging build", () => {
    expect(() =>
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {
          CSCWX_BACKEND_COMMIT:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          CSCWX_BACKEND_TREE: BACKEND_TREE,
          CSCWX_BACKEND_REPOSITORY: "/verified/backend",
        },
        { target: "staging", commitTreeResolver: () => BACKEND_TREE },
      )
    ).toThrow(/allowed only for production/);
  });

  it("rejects a deployment override whose tree differs", () => {
    expect(() =>
      resolveBackendBuildCommit(RELEASE_METADATA, {}, {
        CSCWX_BACKEND_COMMIT:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        CSCWX_BACKEND_TREE:
          "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      })
    ).toThrow(/tree must match release-metadata.json/);
  });

  it("rejects a claimed tree that the supplied commit does not resolve to", () => {
    expect(() =>
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {},
        {
          CSCWX_BACKEND_COMMIT:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          CSCWX_BACKEND_TREE: BACKEND_TREE,
          CSCWX_BACKEND_REPOSITORY: "/verified/backend",
        },
        {
          target: "production",
          commitTreeResolver: () =>
            "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        },
      )
    ).toThrow(/does not resolve to the verified tree SHA/);
  });

  it("rejects conflicting deployment override names", () => {
    expect(() =>
      resolveBackendBuildCommit(
        RELEASE_METADATA,
        {
          VITE_BACKEND_BUILD_COMMIT:
            "cccccccccccccccccccccccccccccccccccccccc",
        },
        { CSCWX_BACKEND_COMMIT: BACKEND_COMMIT }
      )
    ).toThrow(/must identify the same commit/);
  });
});
