import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import GustChart from ".";
import { flowRotation, recordedDirection } from "./direction";

const chart = vi.hoisted(() => ({ props: null }));
vi.mock("react-chartjs-2", () => ({
  Line: (props) => { chart.props = props; return <canvas data-testid="chart" />; },
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

describe("historical direction validation", () => {
  it.each([[90, 270], [180, 0], [270, 90], [360, 180], [359, 179], [1, 181]])(
    "wind from %i points along its flow at rotation %i", (from, rotation) => {
      expect(recordedDirection(row(1, from))).toBe(from);
      expect(recordedDirection(row(1, String(from)))).toBe(from);
      expect(flowRotation(from)).toBe(rotation);
    },
  );
  it.each([0, null, undefined, "", " ", "bad", true, false, -1, 361, NaN, Infinity, {}, [90]])(
    "rejects invalid direction %s", (value) => expect(recordedDirection(row(1, value))).toBeNull(),
  );
  it.each([0, "0", -1, "bad", Infinity, null, undefined])(
    "omits a heading for calm or invalid speed %s", (wind_speed) => {
      expect(recordedDirection(row(1, 270, { wind_speed }))).toBeNull();
    },
  );
  it.each(["starting_gust", "not_connected!", "no_report!"])(
    "omits placeholder samples %s", (unique_id) => {
      expect(recordedDirection(row(1, 270, { unique_id }))).toBeNull();
    },
  );
});

describe("original chart with an additive direction strip", () => {
  it("adds row-aligned directions while preserving both speed datasets", () => {
    render(view([row(1, "270"), row(2, 360), row(3, 0)]));
    const { data, plugins } = chart.props;
    expect(data.labels).toEqual(["1:01", "1:02", "1:03"]);
    expect(data.datasets[0].historyDirections).toEqual([270, 360, null]);
    expect(plugins.map(({ id }) => id)).toEqual(["directionStrip"]);
    expect(data.datasets.map(({ label, data: values, fill, tension }) => ({ label, values, fill, tension })))
      .toEqual([
        { label: "Wind Speed", values: [10, 10, 10], fill: true, tension: 0.4 },
        { label: "Gust Speed", values: [14, 14, 14], fill: true, tension: 0.4 },
      ]);
    expect(data.datasets[0].backgroundColor).toBe("rgba(8, 228, 209, .8)");
    expect(data.datasets[1].backgroundColor).toBe("rgba(255,0,0,.7)");
    for (const dataset of data.datasets) {
      expect(dataset.pointStyle).toBeUndefined();
      expect(dataset.pointRadius).toBeUndefined();
      expect(dataset.pointRotation).toBeUndefined();
      expect(dataset.borderColor).toBe("rgba(0,0,0,1)");
      expect(dataset.pointBorderColor).toBe("#fff");
    }
  });
  it("retains original scales, title, tooltips, pointer behavior, and wrapper", () => {
    const { container } = render(view([row(1, 90)]));
    const { options } = chart.props;
    expect(options.maintainAspectRatio).toBe(false);
    expect(options.scales.y).toMatchObject({ beginAtZero: true, min: 0, max: 30 });
    expect(options.scales.x.grid.color).toBe("rgb(0, 0, 0)");
    expect(options.plugins.title.text).toBe("Wind Speed in kts - Previous 30 Mins");
    expect(options.plugins.legend.display).toBe(false);
    expect(options.plugins.tooltip).toBeUndefined();
    expect(options.interaction).toBeUndefined();
    expect(options.events).toBeUndefined();
    expect(options.layout).toBeUndefined();
    expect(chart.props.ref).toBeUndefined();
    expect(chart.props.tabIndex).toBeUndefined();
    expect(container.querySelector("#gust-app").children).toHaveLength(1);
    expect(container.querySelector("#gust-app").firstElementChild.tagName).toBe("CANVAS");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector(".gust-chart-frame, .gust-sample-details, .gust-direction-legend")).toBeNull();
    expect(container.textContent).toBe("");
  });
  it("preserves selected units, Chicago time, and light theme", () => {
    const { container } = render(view([row(1, 270)], {
      speedUnit: "false", timeFormat: "false", darkTheme: "false",
    }));
    expect(chart.props.data.labels).toEqual(["13:01"]);
    expect(chart.props.data.datasets[0].data).toEqual([12]);
    expect(chart.props.data.datasets[1].data).toEqual([16]);
    expect(chart.props.options.plugins.title.text).toBe("Wind Speed in mph - Previous 30 Mins");
    expect(chart.props.options.scales.y.ticks.color).toBe("rgb(0, 0, 0)");
    expect(container.querySelector("#gust-app-light")).not.toBeNull();
  });
  it("preserves fixed knots and the unmodified loading-area wrapper", () => {
    window.history.replaceState({}, "", "/loadingarea");
    const { container } = render(view([row(1, 270)], { speedUnit: "false" }));
    expect(chart.props.data.datasets[0].historyDirections).toEqual([270]);
    expect(chart.props.data.datasets[0].data).toEqual([10]);
    expect(chart.props.options.plugins.title.text).toBe("Wind Speed in kts - Previous 30 Mins");
    expect(container.querySelector(".gust-chart").hasAttribute("id")).toBe(false);
  });
  it("preserves loading and unavailable states", () => {
    const { rerender } = render(view([]));
    expect(screen.getByText(/Live Gusts Loading/)).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    rerender(view([{ error: "no data" }]));
    expect(screen.getByText("No Gust Data Found")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
  it("keeps refreshed history rows, values, and directions aligned", () => {
    const { rerender } = render(view([row(1, 90), row(2, 270)]));
    rerender(view([row(2, 270), row(3, 180, { wind_speed: 13, gust_speed: 19 })]));
    expect(chart.props.data.labels).toEqual(["1:02", "1:03"]);
    expect(chart.props.data.datasets[0].historyDirections).toEqual([270, 180]);
    expect(chart.props.data.datasets[0].data).toEqual([10, 13]);
    expect(chart.props.data.datasets[1].data).toEqual([14, 19]);
  });
});
