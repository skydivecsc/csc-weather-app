import { Tooltip } from "chart.js";
import { flowRotation, windArrowMarker } from "./direction";

// Resolve against the current layout, not an old pointer position, so an open
// popup follows its sample when the chart resizes or history rolls forward.
Tooltip.positioners.cscwxHistory = function (_elements, position) {
  const target = this.chart.$historyAnchor;
  if (!target) return position;
  const point = target.strip ? this.chart.$directionStrip?.points[target.index]
    : this.chart.getDatasetMeta(target.datasetIndex).data[target.index];
  return point ? { x: point.x, y: point.y } : position;
};

export function stripLayout(chart) {
  const directions = chart.data.datasets[0].historyDirections ?? [];
  const scale = chart.scales.x;
  const top = scale.bottom + 4;
  const spacing = directions.length > 1
    ? Math.abs(scale.getPixelForValue(1) - scale.getPixelForValue(0)) : 18;
  const size = Math.max(4, Math.min(18, Math.floor(spacing * 0.8)));
  const points = directions.map((direction, index) => ({
    x: scale.getPixelForValue(index), y: top + 12, index, direction, size,
    rotation: direction === null ? null : flowRotation(direction),
  }));
  const labels = [];
  let previousRight = -Infinity;
  for (const tick of scale.ticks) {
    const point = points[tick.value];
    if (!point || point.direction === null) continue;
    const text = `${point.direction}°`;
    const width = chart.ctx.measureText(text).width;
    const left = point.x - width / 2;
    const right = point.x + width / 2;
    if (left < 4 || right > chart.width - 4 || left < previousRight + 8) continue;
    labels.push({ index: point.index, text, x: point.x, y: top + 37, left, right });
    previousRight = right;
  }
  return { top, bottom: top + 46, points, labels };
}

export const directionStrip = {
  id: "directionStrip",
  afterLayout(chart) {
    chart.ctx.save();
    chart.ctx.font = "11px sans-serif";
    chart.$directionStrip = stripLayout(chart);
    chart.ctx.restore();
  },
  afterDatasetsDraw(chart, _args, options) {
    const strip = chart.$directionStrip;
    if (!strip) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = options.background;
    ctx.fillRect(chartArea.left - 10, strip.top, chartArea.width + 20, strip.bottom - strip.top);
    ctx.fillStyle = options.color;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const point of strip.points) {
      if (point.direction === null) {
        ctx.fillText("—", point.x, point.y);
      } else {
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(point.rotation * Math.PI / 180);
        const marker = windArrowMarker(point.size);
        if (typeof marker !== "string") ctx.drawImage(marker, -point.size / 2, -point.size / 2);
        ctx.restore();
      }
    }
    for (const label of strip.labels) ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  },
  afterDestroy(chart) {
    delete chart.$directionStrip;
    delete chart.$historyAnchor;
  },
};
