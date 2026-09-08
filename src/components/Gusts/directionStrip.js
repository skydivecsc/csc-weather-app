import { flowRotation } from "./direction";

export const STRIP_BACKGROUND = "#111";
export const STRIP_ARROW = "#fff200";
const STRIP_HEIGHT = 22;
const MIN_ARROW_SPACING = 18;

export function stripLayout(chart) {
  const directions = chart.data.datasets[0].historyDirections ?? [];
  const scale = chart.scales.x;
  const top = chart.chartArea.bottom + 1;
  const spacing = directions.length > 1
    ? Math.abs(scale.getPixelForValue(1) - scale.getPixelForValue(0)) : MIN_ARROW_SPACING;
  // On narrow screens keep arrows readable, aligned to actual samples. This
  // thins only the indicators, never the speed data or existing time labels.
  const stride = spacing > 0 ? Math.max(1, Math.ceil(MIN_ARROW_SPACING / spacing)) : directions.length || 1;
  const points = directions.flatMap((direction, index) => index % stride ? [] : [{
    x: scale.getPixelForValue(index), y: top + STRIP_HEIGHT / 2, index, direction, size: 18,
    rotation: direction === null ? null : flowRotation(direction),
  }]);
  return { top, bottom: top + STRIP_HEIGHT, points };
}

export const directionStrip = {
  id: "directionStrip",
  afterLayout(chart) {
    chart.$directionStrip = stripLayout(chart);
  },
  afterDatasetsDraw(chart) {
    const strip = chart.$directionStrip;
    if (!strip) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = STRIP_BACKGROUND;
    ctx.fillRect(chartArea.left - 9, strip.top, chartArea.width + 18, strip.bottom - strip.top);
    for (const point of strip.points) {
      if (point.direction === null) continue;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.rotation * Math.PI / 180);
      // Solid vector arrows remain crisp at high device pixel ratios.
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, 0);
      ctx.lineTo(2.5, -1);
      ctx.lineTo(2.5, 8);
      ctx.lineTo(-2.5, 8);
      ctx.lineTo(-2.5, -1);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fillStyle = STRIP_ARROW;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
  afterDestroy(chart) {
    delete chart.$directionStrip;
  },
};
