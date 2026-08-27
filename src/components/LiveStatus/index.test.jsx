import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import LiveStatus from ".";

const renderStatus = (value) =>
  render(
    <WeatherContext.Provider value={value}>
      <MemoryRouter initialEntries={["/"]}>
        <LiveStatus />
      </MemoryRouter>
    </WeatherContext.Provider>
  );

describe("LiveStatus wind freshness", () => {
  it("shows the centralized aged backup label", () => {
    renderStatus({
      windStatus: "backup",
      windStatusText: "BACKUP WIND — 1-minute sample, updated 30s ago",
    });

    expect(
      screen.getByText("BACKUP WIND — 1-minute sample, updated 30s ago")
    ).toBeInTheDocument();
  });

  it("shows the explicit unavailable state", () => {
    renderStatus({
      windStatus: "unavailable",
      windStatusText: "WIND DATA UNAVAILABLE",
    });

    expect(screen.getByText("WIND DATA UNAVAILABLE")).toBeInTheDocument();
  });
});
