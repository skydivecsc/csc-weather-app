import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import CurrentTemp from ".";

const renderTemperature = (overrides = {}) => render(
  <WeatherContext.Provider value={{ temp: 0, tempC: "-17.8", tempSetting: "true", setTempSetting: vi.fn(), ...overrides }}>
    <CurrentTemp />
  </WeatherContext.Provider>
);

afterEach(() => window.history.replaceState({}, "", "/"));

describe("Current weather temperature", () => {
  it.each(["/", "/detailed", "/loadingarea"])("displays zero Fahrenheit on %s", (path) => {
    window.history.replaceState({}, "", path);
    renderTemperature();
    expect(screen.getByText("0º F")).toBeInTheDocument();
  });

  it("displays zero Celsius", () => {
    renderTemperature({ temp: 32, tempC: "0.0", tempSetting: "false" });
    expect(screen.getByText("0.0º C")).toBeInTheDocument();
  });

  it.each([null, undefined])("marks missing temperature %s Unknown instead of blank or zero", (temp) => {
    renderTemperature({ temp, tempC: null });
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
