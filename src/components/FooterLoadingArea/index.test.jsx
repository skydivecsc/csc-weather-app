import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import {
  CURRENT_APP_VERSION,
  CURRENT_BUILD_ID,
} from "../UpdateDetector/constants";
import FooterLoadingArea from ".";

const renderFooter = (weather = {}) =>
  render(
    <WeatherContext.Provider
      value={{
        canEvaluateWindSafety: false,
        jumpruns: [],
        maxGust: 0,
        maxSpeed: 0,
        speed: 0,
        ...weather,
      }}
    >
      <FooterLoadingArea />
    </WeatherContext.Provider>
  );

describe("FooterLoadingArea safety gating", () => {
  it("renders the app version with the full commit in diagnostic metadata", () => {
    renderFooter();

    const buildVersion = screen.getByText(`Version ${CURRENT_APP_VERSION}`);

    expect(buildVersion).toHaveAccessibleName(`Version ${CURRENT_APP_VERSION}`);
    expect(buildVersion).toHaveAttribute(
      "title",
      `Version ${CURRENT_APP_VERSION}; exact build commit: ${CURRENT_BUILD_ID}`
    );
    expect(buildVersion).toHaveAttribute(
      "data-app-version",
      CURRENT_APP_VERSION
    );
    expect(buildVersion).toHaveAttribute("data-build-id", CURRENT_BUILD_ID);
    expect(screen.queryByText(/^Build /)).not.toBeInTheDocument();
  });

  it("fails closed when either required wind source is incomplete", () => {
    renderFooter();

    expect(
      screen.getByText(/WIND DATA INCOMPLETE — DO NOT USE FOR GO\/NO-GO/)
    ).toBeInTheDocument();
  });

  it("uses limits only after combined safety evaluation is available", () => {
    renderFooter({
      canEvaluateWindSafety: true,
      maxSpeed: 18,
      speed: 18,
    });

    expect(screen.getByText("*** STUDENT WIND HOLD ***")).toBeInTheDocument();
    expect(
      screen.queryByText(/WIND DATA INCOMPLETE — DO NOT USE FOR GO\/NO-GO/)
    ).not.toBeInTheDocument();
  });
});
