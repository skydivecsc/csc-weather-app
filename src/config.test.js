import { describe, expect, it } from "vitest";
import {
  LOGIN_BASE_URL,
  PUBLIC_SITE_LABEL,
  PUBLIC_SITE_URL,
  TRIVIA_SITE_LABEL,
  TRIVIA_SITE_URL,
} from "./config";

describe("environment configuration", () => {
  it("loads every public setting from the explicit test environment", () => {
    expect({
      LOGIN_BASE_URL,
      PUBLIC_SITE_LABEL,
      PUBLIC_SITE_URL,
      TRIVIA_SITE_LABEL,
      TRIVIA_SITE_URL,
    }).toEqual({
      LOGIN_BASE_URL: "https://login.test.invalid",
      PUBLIC_SITE_LABEL: "weather.test.invalid",
      PUBLIC_SITE_URL: "https://weather.test.invalid",
      TRIVIA_SITE_LABEL: "trivia.test.invalid",
      TRIVIA_SITE_URL: "https://trivia.test.invalid",
    });
  });
});
