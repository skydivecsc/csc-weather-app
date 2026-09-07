import "chart.js/auto";
import { Line } from "react-chartjs-2";
import { useCallback, useContext, useId, useMemo, useState } from "react";
import { WeatherContext } from "../../context/WeatherContextValue";
import LoadingDots from "../LoadingDots";
import { directionLabel, flowRotation, recordedDirection, windArrowMarker } from "./direction";
import "./gusts.css";

const sampleKey = (row) => `${row.id ?? ""}:${row.received_time}`;

function GustChart() {
  const { gustData, darkTheme, speedUnit, timeFormat } = useContext(WeatherContext);
  const isLoadingArea = window.location.pathname === "/loadingarea";
  const useKnots = isLoadingArea || speedUnit === "true";
  const unit = useKnots ? "kts" : "mph";
  const [selectedKey, setSelectedKey] = useState("");
  const selectorId = useId();
  const legendId = useId();
  const samples = useMemo(() => {
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      hour12: timeFormat === "true",
    });
    return gustData.filter((row) => !row.error).map((row) => ({
      ...row,
      key: sampleKey(row),
      time: format.format(new Date(row.received_time)),
      wind: useKnots ? row.wind_speed : Math.round(row.wind_speed * 1.151),
      gust: useKnots ? row.gust_speed : Math.round(row.gust_speed * 1.151),
      directionText: directionLabel(row),
    }));
  }, [gustData, timeFormat, useKnots]);
  const selected = samples.find((row) => row.key === selectedKey) ?? samples.at(-1);
  const selectSample = useCallback((_event, elements) => {
    if (elements.length && samples[elements[0].index]) {
      setSelectedKey(samples[elements[0].index].key);
    }
  }, [samples]);

  const data = useMemo(() => {
    // Keep every minute visible without overlapping markers on narrow screens.
    const markerSize = ({ chart }) => Math.max(8, Math.min(18,
      Math.floor((chart.chartArea?.width ?? chart.width ?? 300) / Math.max(1, samples.length - 1) * 0.85)
    ));
    return ({
    labels: samples.map((row) => row.time),
    datasets: [
      {
        label: "Wind Speed",
        data: samples.map((row) => row.wind),
        fill: true,
        backgroundColor: "rgba(8, 228, 209, .8)",
        borderColor: "rgba(0,0,0,1)",
        pointBackgroundColor: "rgb(8, 228, 209)",
        pointBorderColor: "#fff",
        pointStyle: (context) => recordedDirection(samples[context.dataIndex]) === null ? "circle" : windArrowMarker(markerSize(context)),
        pointRotation: samples.map((row) => recordedDirection(row) === null ? 0 : flowRotation(recordedDirection(row))),
        pointRadius: (context) => recordedDirection(samples[context.dataIndex]) === null ? 3 : markerSize(context) / 2,
        pointHoverRadius: (context) => recordedDirection(samples[context.dataIndex]) === null ? 5 : markerSize(context) / 2,
        pointHitRadius: 14,
        tension: 0.4,
      },
      {
        label: "Gust Speed",
        data: samples.map((row) => row.gust),
        fill: true,
        backgroundColor: "rgba(255,0,0,.7)",
        borderColor: "rgba(0,0,0,1)",
        pointBackgroundColor: "rgba(255,0,0,1)",
        pointBorderColor: "#fff",
        pointStyle: "circle",
        pointRadius: 3,
        pointHoverRadius: 5,
        pointHitRadius: 14,
        tension: 0.4,
      },
    ],
    });
  }, [samples]);

  const options = useMemo(() => ({
    maintainAspectRatio: false,
    // Do not tween headings through invented intermediate directions.
    animation: false,
    layout: { padding: 10 },
    interaction: { mode: "index", axis: "x", intersect: false },
    onHover: selectSample,
    onClick: selectSample,
    plugins: {
      title: {
        display: true,
        font: { size: isLoadingArea ? 13 : 16, weight: "bold" },
        color: darkTheme === "true" ? "rgb(8, 228, 209)" : "#111",
        text: `Wind Speed in ${unit} - Previous 30 Mins`,
      },
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items.length ? `${samples[items[0].dataIndex].time} Chicago time` : "",
          label: (item) => `${item.dataset.label}: ${item.formattedValue} ${unit}`,
          afterBody: (items) => items.length ? samples[items[0].dataIndex].directionText : "",
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        min: 0,
        max: 30,
        ticks: { color: darkTheme === "true" ? "rgb(8, 228, 209)" : "#000" },
        grid: { color: darkTheme === "true" ? "rgb(8, 228, 209)" : "#000" },
      },
      x: { grid: { color: "#000" }, ticks: { color: darkTheme === "true" ? "rgb(8, 228, 209)" : "#000", maxRotation: 45 } },
    },
  }), [darkTheme, isLoadingArea, samples, selectSample, unit]);

  if (!gustData.length) {
    return <div className="loading">Live Gusts Loading<LoadingDots /></div>;
  }
  if (!samples.length) return <div className="loading">No Gust Data Found</div>;

  return (
    <div
      className={`gust-chart${isLoadingArea ? " gust-chart-kiosk" : ""}${darkTheme === "true" ? "" : " gust-chart-light"}`}
      id={isLoadingArea ? undefined : darkTheme === "true" ? "gust-app" : "gust-app-light"}
    >
      <div className="gust-chart-frame">
        <Line
          className="chart"
          data={data}
          options={options}
          aria-label="Wind and gust speed history with wind direction arrows"
          aria-describedby={legendId}
          fallbackContent="Use the History sample selector below for wind speed, gust speed, and direction."
        />
      </div>
      <p className="gust-direction-legend" id={legendId}>
        Arrows show wind flow; direction labels show wind FROM.
      </p>
      <div className="gust-sample-controls">
        <label htmlFor={selectorId}>History sample</label>
        <select
          id={selectorId}
          value={samples.some((row) => row.key === selectedKey) ? selectedKey : ""}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          <option value="">Latest sample</option>
          {samples.map((row) => <option key={row.key} value={row.key}>{row.time}</option>)}
        </select>
      </div>
      <div className="gust-sample-details" role="status" aria-label="Selected wind sample" aria-atomic="true">
        <span>{selected.time} Chicago time</span>
        <span>Wind speed: {selected.wind} {unit}</span>
        <span>Gust speed: {selected.gust} {unit}</span>
        <span>{selected.directionText}</span>
      </div>
    </div>
  );
}

export default GustChart;
