import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import DetailedPage from ".";

const weather = {
  astronomyStatus: { hasSample: true, state: "current" },
  canEvaluateWindSafety: false,
  cloudCeiling1: "",
  cloudCeiling2: "",
  cloudCeiling3: "",
  cloudCeilingM1: "",
  cloudCeilingM2: "",
  cloudCeilingM3: "",
  darkTheme: "true",
  densityAlt: null,
  dewPoint: null,
  direction: 280,
  gustSpeed: 14,
  jumpruns: [],
  maxGust: 14,
  maxSpeed: 12,
  metarAbbr: "",
  metarDesc: "",
  newOffset: "",
  newSpot: "",
  pressure: null,
  skyCondition1: "",
  skyCondition2: "",
  skyCondition3: "",
  speed: 12,
  speedUnit: "true",
  sunrise: "6:00 AM",
  sunrise24: "06:00",
  sunset: "7:00 PM",
  sunset24: "19:00",
  timeFormat: "true",
  twilight: "7:30 PM",
  twilight24: "19:30",
  unitSetting: "true",
  variableDirection1: "",
  variableDirection2: "",
  visibility: null,
  windStatus: "backup",
  windStatusDetail: { hasSample: true },
  windStatusText: "BACKUP WIND — 1-minute sample, updated 30s ago",
};

const renderDetailed = (overrides = {}) =>
  render(
    <WeatherContext.Provider value={{ ...weather, ...overrides }}>
      <MemoryRouter>
        <DetailedPage />
      </MemoryRouter>
    </WeatherContext.Provider>
  );

describe("Detailed wind safety presentation", () => {
  it("mutes aged wind rows and suppresses favorable conclusions", () => {
    renderDetailed();

    expect(
      screen.getByText("WIND DATA INCOMPLETE — DO NOT USE FOR GO/NO-GO")
    ).toBeInTheDocument();
    expect(screen.queryByText("WINDS OK FOR STUDENTS!")).not.toBeInTheDocument();
    expect(screen.getByText("Current Speed:").closest("tr")).toHaveClass(
      "detailed-wind-aged"
    );
  });

  it("shows astronomy unavailable while an initial failure retries", () => {
    renderDetailed({
      astronomyStatus: { hasSample: false, state: "error" },
      sunrise: null,
      sunrise24: null,
      sunset: null,
      sunset24: null,
      twilight: null,
      twilight24: null,
    });

    expect(
      screen.getByText("ASTRONOMY DATA UNAVAILABLE — RETRYING")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
  });

  it("keeps and labels last-known astronomy values after refresh failure", () => {
    renderDetailed({
      astronomyStatus: {
        ageLabel: "4m ago",
        hasSample: true,
        state: "error",
      },
    });

    expect(screen.getByText("7:00 PM")).toHaveClass(
      "astronomy-value-last-known"
    );
    expect(screen.getByText("6:00 AM")).toHaveClass(
      "astronomy-value-last-known"
    );
    expect(
      screen.getByText(
        "SHOWING LAST-KNOWN ASTRONOMY DATA — UPDATE FAILED, RETRYING"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Last successful update 4m ago")).toBeInTheDocument();
  });
});
