import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import GustChart from ".";
import { directionLabel, flowRotation, recordedDirection } from "./direction";

const chart = vi.hoisted(() => ({ props: null }));
vi.mock("react-chartjs-2", () => ({
  Line: (props) => { chart.props = props; return <div data-testid="chart" />; },
}));
vi.mock("./direction", async (importOriginal) => ({
  ...await importOriginal(),
  windArrowMarker: () => "test-arrow",
}));

const row = (id, direction, changes = {}) => ({
  id, direction, wind_speed: 10, gust_speed: 14,
  received_time: `2026-09-07T18:${String(id).padStart(2, "0")}:00.000Z`,
  unique_id: `wind-${id}`, ...changes,
});
const view = (rows, changes = {}) => (
  <WeatherContext.Provider value={{ gustData: rows, darkTheme: "true", speedUnit: "true", timeFormat: "true", ...changes }}>
    <GustChart />
  </WeatherContext.Provider>
);
afterEach(() => window.history.replaceState({}, "", "/"));

describe("historical direction semantics", () => {
  it.each([[90, 270, "E"], [180, 0, "S"], [270, 90, "W"], [360, 180, "N"], [359, 179, "N"], [1, 181, "N"]])(
    "wind from %i flows at rotation %i", (from, rotation, compass) => {
      expect(flowRotation(recordedDirection(row(1, from)))).toBe(rotation);
      expect(directionLabel(row(1, from))).toBe(`Wind from ${from}° (${compass})`);
    },
  );
  it.each([0, null, undefined, "", " ", "bad", true, -1, 361])("does not invent a heading for %s", (value) => {
    expect(recordedDirection(row(1, value))).toBeNull();
    expect(directionLabel(row(1, value))).toBe("Direction unavailable");
  });
  it("distinguishes calm from disconnected and placeholder samples", () => {
    expect(recordedDirection(row(1, 270, { wind_speed: 0 }))).toBeNull();
    expect(directionLabel(row(1, 270, { wind_speed: 0 }))).toBe("Calm — direction unavailable");
    for (const unique_id of ["starting_gust", "not_connected!", "no_report!"]) {
      expect(recordedDirection(row(1, 270, { unique_id }))).toBeNull();
      expect(directionLabel(row(1, 0, { wind_speed: 0, unique_id }))).toBe("Direction unavailable");
    }
  });
});

describe("historical wind chart", () => {
  it("matches each marker and tooltip to its own row, retaining gust circles", () => {
    render(view([row(1, "270"), row(2, 360), row(3, 0)]));
    const { data, options } = chart.props;
    expect([0, 1, 2].map((dataIndex) => data.datasets[0].pointStyle({ dataIndex, chart: { width: 300 } }))).toEqual(["test-arrow", "test-arrow", "circle"]);
    expect(data.datasets[0].pointRotation).toEqual([90, 180, 0]);
    expect(data.datasets[1].pointStyle).toBe("circle");
    expect(options.plugins.tooltip.callbacks.afterBody([{ dataIndex: 0 }])).toBe("Wind from 270° (W)");
    expect(options.plugins.tooltip.callbacks.afterBody([{ dataIndex: 1 }])).toBe("Wind from 360° (N)");
    expect(options.plugins.tooltip.callbacks.label({ dataset: data.datasets[1], formattedValue: "14" })).toBe("Gust Speed: 14 kts");
    expect(options.plugins.tooltip.callbacks.title([{ dataIndex: 0 }])).toBe("1:01 PM Chicago time");
  });

  it("keeps selected timestamp across shifted history and returns to latest when it expires", () => {
    const { rerender } = render(view([row(1, 90), row(2, 270)]));
    const select = screen.getByLabelText("History sample");
    const details = screen.getByRole("status", { name: "Selected wind sample" });
    fireEvent.change(select, { target: { value: `2:${row(2, 270).received_time}` } });
    rerender(view([row(2, 270), row(3, 180)]));
    expect(details).toHaveTextContent("Wind from 270° (W)");
    rerender(view([row(3, 180), row(4, 360)]));
    expect(select).toHaveValue("");
    expect(details).toHaveTextContent("Wind from 360° (N)");
  });

  it("follows newest history by default and supports a keyboard-accessible selector", () => {
    const { rerender } = render(view([row(1, 90)]));
    rerender(view([row(1, 90), row(2, 270)]));
    expect(screen.getByRole("status", { name: "Selected wind sample" })).toHaveTextContent("Wind from 270° (W)");
    fireEvent.change(screen.getByLabelText("History sample"), { target: { value: `1:${row(1, 90).received_time}` } });
    expect(screen.getByRole("status", { name: "Selected wind sample" })).toHaveTextContent("Wind from 90° (E)");
  });

  it("uses selected units and Chicago 24-hour time", () => {
    render(view([row(1, 270)], { speedUnit: "false", timeFormat: "false", darkTheme: "false" }));
    expect(chart.props.data.datasets[0].data).toEqual([12]);
    expect(chart.props.data.datasets[1].data).toEqual([16]);
    expect(screen.getByRole("status", { name: "Selected wind sample" })).toHaveTextContent("13:01 Chicago timeWind speed: 12 mphGust speed: 16 mphWind from 270° (W)");
  });

  it("uses arrows and fixed knots on loadingarea despite an mph preference", () => {
    window.history.replaceState({}, "", "/loadingarea");
    render(view([row(1, 270)], { speedUnit: "false" }));
    expect(chart.props.data.datasets[0].pointStyle({ dataIndex: 0, chart: { width: 300 } })).toBe("test-arrow");
    expect(chart.props.data.datasets[0].data).toEqual([10]);
    expect(screen.getByRole("status", { name: "Selected wind sample" })).toHaveTextContent("Wind speed: 10 kts");
  });

  it("preserves loading and unavailable states", () => {
    const { rerender } = render(view([]));
    expect(screen.getByText(/Live Gusts Loading/)).toBeInTheDocument();
    rerender(view([{ error: "no data" }]));
    expect(screen.getByText("No Gust Data Found")).toBeInTheDocument();
    expect(screen.queryByLabelText("History sample")).not.toBeInTheDocument();
  });
});
