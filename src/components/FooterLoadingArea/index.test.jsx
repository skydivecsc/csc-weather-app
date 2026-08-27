import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import { CURRENT_BUILD_ID } from "../UpdateDetector/constants";
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
  it("renders the short build with the full commit in accessible metadata", () => {
    renderFooter();

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
