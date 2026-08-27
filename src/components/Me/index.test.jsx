import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import Me from ".";

const defaultWeather = {
  canEvaluateWindSafety: true,
  darkTheme: "true",
  gustSpeed: null,
  isAwosLive: true,
  maxGust: 0,
  maxSpeed: 0,
  speed: 0,
};

function renderMe(weather = {}) {
  return render(
    <WeatherContext.Provider value={{ ...defaultWeather, ...weather }}>
      <Me />
    </WeatherContext.Provider>
  );
}

describe("Me safety guidance", () => {
  it("prompts for preferences when no personal limits are configured", () => {
    renderMe({ speed: 30 });

    expect(screen.getByText("Select one or more options...")).toBeInTheDocument();
  });

  it.each([
    ["A", 17, "CONDITIONS ARE OK!"],
    ["A", 18, "CSC RECOMMENDS STAND DOWN"],
    ["B", 19, "CONDITIONS ARE OK!"],
    ["B", 20, "CSC RECOMMENDS STAND DOWN"],
    ["C", 21, "CONDITIONS ARE OK!"],
    ["C", 22, "CSC RECOMMENDS STAND DOWN"],
    ["D", 25, "CONDITIONS ARE OK!"],
    ["D", 26, "CSC RECOMMENDS STAND DOWN"],
  ])(
    "applies the current %s-license limit at %i knots",
    (license, speed, expectedText) => {
      localStorage.setItem("userLicense", license);

      renderMe({ speed });

      expect(screen.getByText(expectedText)).toBeInTheDocument();
    }
  );

  it("stands down when a configured maximum sustained speed is exceeded", () => {
    localStorage.setItem("userMaxSpeed", "12");

    renderMe({ speed: 13 });

    expect(screen.getByText("CSC RECOMMENDS STAND DOWN")).toBeInTheDocument();
  });

  it("stands down when a configured maximum gust is exceeded", () => {
    localStorage.setItem("userMaxGust", "15");

    renderMe({ gustSpeed: 16 });

    expect(screen.getByText("CSC RECOMMENDS STAND DOWN")).toBeInTheDocument();
  });

  it("treats the configured differential as inclusive", () => {
    localStorage.setItem("userDif", "5");

    renderMe({ gustSpeed: 15, maxGust: 15, maxSpeed: 10, speed: 10 });

    expect(screen.getByText("CONDITIONS ARE OK!")).toBeInTheDocument();
  });

  it("stands down when the configured differential is exceeded", () => {
    localStorage.setItem("userDif", "5");

    renderMe({ gustSpeed: 16, maxGust: 16, maxSpeed: 10, speed: 10 });

    expect(screen.getByText("CSC RECOMMENDS STAND DOWN")).toBeInTheDocument();
  });

  it("recovers immediately when a selected limit changes", () => {
    localStorage.setItem("userLicense", "A");
    renderMe({ speed: 18 });

    expect(screen.getByText("CSC RECOMMENDS STAND DOWN")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "D" },
    });

    expect(screen.getByText("CONDITIONS ARE OK!")).toBeInTheDocument();
    expect(localStorage.getItem("userLicense")).toBe("D");
  });

  it("fails closed before safety guidance when wind data is stale", () => {
    localStorage.setItem("userLicense", "D");

    renderMe({
      canEvaluateWindSafety: false,
    });

    expect(
      screen.getByText("WIND DATA INCOMPLETE — DO NOT USE FOR GO/NO-GO")
    ).toBeInTheDocument();
    expect(screen.queryByText("CONDITIONS ARE OK!")).not.toBeInTheDocument();
  });

  it("does not issue favorable guidance from REST fallback data", () => {
    localStorage.setItem("userLicense", "D");

    renderMe({
      canEvaluateWindSafety: false,
    });

    expect(
      screen.getByText("WIND DATA INCOMPLETE — DO NOT USE FOR GO/NO-GO")
    ).toBeInTheDocument();
    expect(screen.queryByText("CONDITIONS ARE OK!")).not.toBeInTheDocument();
  });
});
