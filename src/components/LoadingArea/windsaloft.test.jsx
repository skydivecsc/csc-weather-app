import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import WindsAloftLoading from "./windsaloft";

const aloftMap = (value) =>
  Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [
      `${(index + 1) * 1000}`,
      value,
    ])
  );

const renderAloft = (status, data = {}) =>
  render(
    <WeatherContext.Provider
      value={{
        aloftStatus: status,
        darkTheme: "true",
        directions: data.directions || {},
        received: data.received || null,
        speeds: data.speeds || {},
        temps: data.temps || {},
        timeFormat: "true",
      }}
    >
      <WindsAloftLoading />
    </WeatherContext.Provider>
  );

describe("loading-area winds aloft status", () => {
  it("shows an explicit retry state before the first successful forecast", () => {
    renderAloft({ hasSample: false, state: "error" });

    expect(
      screen.getByText("WINDS ALOFT UNAVAILABLE — RETRYING")
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("retains and labels forecast rows after a later failure", () => {
    const { container } = renderAloft(
      { ageLabel: "3m ago", hasSample: true, state: "error" },
      {
        directions: aloftMap(270),
        received: "18",
        speeds: aloftMap(12),
        temps: aloftMap(15),
      }
    );

    expect(
      screen.getByText(
        "SHOWING LAST-KNOWN WINDS ALOFT — UPDATE FAILED, RETRYING"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Last successful update 3m ago")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("undefined");
    expect(container).not.toHaveTextContent("NaN");
  });
});
