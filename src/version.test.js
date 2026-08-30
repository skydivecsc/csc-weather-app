import { describe, expect, it } from "vitest";
import { resolveAppVersion } from "../scripts/app-version.mjs";

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
