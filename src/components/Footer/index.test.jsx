import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import {
  CURRENT_BACKEND_BUILD_ID,
  CURRENT_APP_VERSION,
  CURRENT_WEATHER_BUILD_ID,
} from "../UpdateDetector/constants";
import Footer from ".";

describe("Footer attribution", () => {
  it("renders Ryan Erickson's credit as plain text", () => {
    render(
      <WeatherContext.Provider
        value={{ jumpruns: [], metar: "", newOffset: "", newSpot: "" }}
      >
        <Footer />
      </WeatherContext.Provider>
    );

    expect(screen.getByText("Created by: Ryan Erickson")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Created by: Ryan Erickson" })
    ).not.toBeInTheDocument();

    const buildVersion = screen.getByText(`Version ${CURRENT_APP_VERSION}`);

    expect(buildVersion).toHaveAccessibleName(`Version ${CURRENT_APP_VERSION}`);
    expect(buildVersion).toHaveAttribute(
      "title",
      `Version ${CURRENT_APP_VERSION}; exact weather commit: ${CURRENT_WEATHER_BUILD_ID}; exact backend commit: ${CURRENT_BACKEND_BUILD_ID}`
    );
    expect(buildVersion).toHaveAttribute(
      "data-app-version",
      CURRENT_APP_VERSION
    );
    expect(buildVersion).toHaveAttribute(
      "data-build-id",
      CURRENT_WEATHER_BUILD_ID
    );
    expect(buildVersion).toHaveAttribute(
      "data-weather-build-id",
      CURRENT_WEATHER_BUILD_ID
    );
    expect(buildVersion).toHaveAttribute(
      "data-backend-build-id",
      CURRENT_BACKEND_BUILD_ID
    );
    expect(screen.queryByText(/^Build /)).not.toBeInTheDocument();
  });
});
