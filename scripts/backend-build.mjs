import { execFileSync } from "node:child_process";

const BUILD_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

const resolveGitCommitTree = (repository, commit) => {
  if (!repository) {
    throw new Error(
      "CSCWX_BACKEND_REPOSITORY is required for a tree-equivalent backend commit",
    );
  }
  let tree;
  try {
    execFileSync(
      "git",
      ["-C", repository, "cat-file", "-e", `${commit}^{commit}`],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    tree = execFileSync(
      "git",
      ["-C", repository, "rev-parse", `${commit}^{tree}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    throw new Error(
      "The supplied backend commit cannot be resolved in CSCWX_BACKEND_REPOSITORY",
    );
  }
  if (!BUILD_COMMIT_PATTERN.test(tree)) {
    throw new Error("The supplied backend commit did not resolve to an exact tree");
  }
  return tree;
};

export const resolveBackendBuildCommit = (
  releaseMetadata,
  publicSettings = {},
  environment = process.env,
  {
    commitTreeResolver = resolveGitCommitTree,
    target = "staging",
  } = {},
) => {
  const releaseBackendCommit = releaseMetadata?.backendBuildId?.trim();
  const releaseBackendTree = releaseMetadata?.backendTreeId?.trim();
  const cscwxBackendCommit = environment.CSCWX_BACKEND_COMMIT?.trim();
  const viteBackendCommit = (
    environment.VITE_BACKEND_BUILD_COMMIT ||
    publicSettings.VITE_BACKEND_BUILD_COMMIT
  )?.trim();
  const cscwxBackendTree = environment.CSCWX_BACKEND_TREE?.trim();
  const viteBackendTree = (
    environment.VITE_BACKEND_BUILD_TREE ||
    publicSettings.VITE_BACKEND_BUILD_TREE
  )?.trim();

  if (!BUILD_COMMIT_PATTERN.test(releaseBackendCommit || "")) {
    throw new Error(
      "release-metadata.json backendBuildId must be an exact lowercase 40-character Git SHA",
    );
  }
  if (!BUILD_COMMIT_PATTERN.test(releaseBackendTree || "")) {
    throw new Error(
      "release-metadata.json backendTreeId must be an exact lowercase 40-character Git tree SHA",
    );
  }

  if (
    cscwxBackendCommit &&
    viteBackendCommit &&
    cscwxBackendCommit !== viteBackendCommit
  ) {
    throw new Error(
      "CSCWX_BACKEND_COMMIT and VITE_BACKEND_BUILD_COMMIT must identify the same commit",
    );
  }

  const suppliedBackendCommit = cscwxBackendCommit || viteBackendCommit;
  if (
    suppliedBackendCommit &&
    !BUILD_COMMIT_PATTERN.test(suppliedBackendCommit)
  ) {
    throw new Error(
      "The supplied backend build commit must be an exact lowercase 40-character Git SHA",
    );
  }
  if (
    cscwxBackendTree &&
    viteBackendTree &&
    cscwxBackendTree !== viteBackendTree
  ) {
    throw new Error(
      "CSCWX_BACKEND_TREE and VITE_BACKEND_BUILD_TREE must identify the same tree",
    );
  }
  const suppliedBackendTree = cscwxBackendTree || viteBackendTree;

  if (
    suppliedBackendTree &&
    !BUILD_COMMIT_PATTERN.test(suppliedBackendTree)
  ) {
    throw new Error(
      "The supplied backend tree must be an exact lowercase 40-character Git tree SHA",
    );
  }
  if (suppliedBackendTree && suppliedBackendTree !== releaseBackendTree) {
    throw new Error(
      "The supplied backend tree must match release-metadata.json",
    );
  }

  if (
    suppliedBackendCommit &&
    suppliedBackendCommit !== releaseBackendCommit &&
    target !== "production"
  ) {
    throw new Error(
      "A tree-equivalent backend commit is allowed only for production",
    );
  }

  if (
    suppliedBackendCommit &&
    suppliedBackendCommit !== releaseBackendCommit &&
    !suppliedBackendTree
  ) {
    throw new Error(
      "A different backend commit requires its verified tree SHA",
    );
  }

  if (suppliedBackendCommit && suppliedBackendCommit !== releaseBackendCommit) {
    const resolvedTree = commitTreeResolver(
      environment.CSCWX_BACKEND_REPOSITORY?.trim(),
      suppliedBackendCommit,
    );
    if (resolvedTree !== suppliedBackendTree) {
      throw new Error(
        "The supplied backend commit does not resolve to the verified tree SHA",
      );
    }
  }

  return suppliedBackendCommit || releaseBackendCommit;
};
