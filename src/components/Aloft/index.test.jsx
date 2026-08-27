import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import WindsAloft from ".";

const aloftMap = (value) =>
  Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [
      `${(index + 1) * 1000}`,
      value,
    ])
  );

const weather = {
  aloftStatus: {
    ageLabel: "2m ago",
    hasSample: true,
    state: "error",
  },
  darkTheme: "true",
  directions: aloftMap(180),
  received: "18",
  speeds: aloftMap(10),
  speedUnit: "true",
  temps: aloftMap(20),
  tempSetting: "true",
  timeFormat: "true",
  unitSetting: "true",
};

const renderAloft = (overrides = {}) =>
  render(
    <WeatherContext.Provider value={{ ...weather, ...overrides }}>
      <WindsAloft />
    </WeatherContext.Provider>
  );

describe("WindsAloft refresh status", () => {
  it("shows retrying instead of a table when no forecast has succeeded", () => {
    renderAloft({
      aloftStatus: { hasSample: false, state: "error" },
      directions: {},
      received: null,
      speeds: {},
      temps: {},
    });

    expect(
      screen.getByText("WINDS ALOFT UNAVAILABLE — RETRYING")
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps and labels the last-known forecast after refresh failure", () => {
    const { container } = renderAloft();

    expect(
      screen.getByText(
        "SHOWING LAST-KNOWN WINDS ALOFT — UPDATE FAILED, RETRYING"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Last successful update 2m ago")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container).toHaveTextContent("180º");
    expect(container).not.toHaveTextContent("undefined");
    expect(container).not.toHaveTextContent("NaN");
  });
});
