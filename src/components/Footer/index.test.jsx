import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import { CURRENT_BUILD_ID } from "../UpdateDetector/constants";
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

    const shortBuildId = CURRENT_BUILD_ID.slice(0, 8);
    const buildVersion = screen.getByText(`Build ${shortBuildId}`);

    expect(buildVersion).toHaveAccessibleName(
      `Build ${shortBuildId}; full build commit ${CURRENT_BUILD_ID}`
    );
    expect(buildVersion).toHaveAttribute(
      "title",
      `Full build commit: ${CURRENT_BUILD_ID}`
    );
    expect(buildVersion).toHaveAttribute("data-build-id", CURRENT_BUILD_ID);
  });
});
