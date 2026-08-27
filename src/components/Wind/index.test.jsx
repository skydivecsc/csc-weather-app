import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import Wind from ".";

const defaultWeather = {
  cloudCeiling1: "",
  cloudCeiling2: "",
  cloudCeiling3: "",
  cloudCeilingM1: "",
  cloudCeilingM2: "",
  cloudCeilingM3: "",
  direction: 280,
  gustSpeed: 14,
  metarAbbr: "",
  metarDesc: "",
  skyCondition1: "Clear Sky",
  skyCondition2: "",
  skyCondition3: "",
  speed: 12,
  speedUnit: "true",
  unitSetting: "true",
  windStatus: "live",
  windStatusDetail: { hasSample: true, isCurrent: true },
  windStatusText: "LIVE — updated 1s ago",
};

const renderWind = (weather = {}) =>
  render(
    <WeatherContext.Provider value={{ ...defaultWeather, ...weather }}>
      <Wind />
    </WeatherContext.Provider>
  );

describe("Wind freshness presentation", () => {
  it("keeps backup readings visible but muted and labeled", () => {
    const { container } = renderWind({
      windStatus: "backup",
      windStatusDetail: { hasSample: true, isCurrent: true },
      windStatusText: "BACKUP WIND — 1-minute sample, updated 30s ago",
    });

    expect(container.firstChild).toHaveClass("wind-data-aged");
    expect(
      screen.getByText("BACKUP WIND — 1-minute sample, updated 30s ago")
    ).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("does not present missing wind as calm", () => {
    renderWind({
      direction: 0,
      speed: 0,
      windStatus: "unavailable",
      windStatusDetail: { hasSample: false, isCurrent: false },
      windStatusText: "WIND DATA UNAVAILABLE",
    });

    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.getByText("Direction unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Calm")).not.toBeInTheDocument();
  });
});
