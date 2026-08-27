import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import LoadingArea from ".";

vi.mock("../Gusts", () => ({ default: () => <div>Gust chart</div> }));
vi.mock("./windsaloft", () => ({
  default: () => <div>Winds aloft table</div>,
}));

const weather = {
  astronomyStatus: { hasSample: true, state: "current" },
  darkTheme: "true",
  direction: 0,
  gustSpeed: null,
  jumpruns: [],
  maxGust: 0,
  maxSpeed: 0,
  newOffset: "",
  newSpot: "",
  skyCondition1: "",
  skyCondition2: "",
  skyCondition3: "",
  speed: 0,
  sunset: "7:00 PM",
  windStatus: "unavailable",
  windStatusDetail: { hasSample: false },
  windStatusText: "WIND DATA UNAVAILABLE",
};

const renderLoadingArea = (overrides = {}) =>
  render(
    <WeatherContext.Provider value={{ ...weather, ...overrides }}>
      <LoadingArea />
    </WeatherContext.Provider>
  );

describe("LoadingArea astronomy status", () => {
  it("shows an explicit unavailable retry state on initial failure", () => {
    renderLoadingArea({
      astronomyStatus: { hasSample: false, state: "error" },
      sunset: null,
    });

    expect(
      screen.getByText("ASTRONOMY DATA UNAVAILABLE — RETRYING")
    ).toBeInTheDocument();
  });

  it("keeps and labels the last-known sunset after refresh failure", () => {
    renderLoadingArea({
      astronomyStatus: {
        ageLabel: "5m ago",
        hasSample: true,
        state: "error",
      },
    });

    expect(screen.getByText("7:00 PM")).toHaveClass(
      "astronomy-value-last-known"
    );
    expect(
      screen.getByText(
        "SHOWING LAST-KNOWN ASTRONOMY DATA — UPDATE FAILED, RETRYING"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Last successful update 5m ago")).toBeInTheDocument();
  });
});
