import { describe, expect, it, vi } from "vitest";
import { directionStrip, stripLayout } from "./directionStrip";

function chart(directions = [360, 90, 270, null], width = 400) {
  return {
    width,
    chartArea: { bottom: 150, left: 30, right: width - 30, width: width - 60 },
    data: { datasets: [{ historyDirections: directions }] },
    scales: { x: {
      bottom: 205,
      getPixelForValue: (index) => 30 + index * (width - 60) / Math.max(1, directions.length - 1),
      ticks: directions.map((_, value) => ({ value })),
    } },
  };
}

describe("the noninteractive direction strip", () => {
  it("aligns wind flow to each sample immediately below the bars", () => {
    const c = chart();
    const strip = stripLayout(c);
    expect(strip.top - c.chartArea.bottom).toBeGreaterThanOrEqual(0);
    expect(strip.top - c.chartArea.bottom).toBeLessThanOrEqual(2);
    expect(strip.bottom - strip.top).toBeLessThanOrEqual(24);
    expect(strip.bottom).toBeLessThan(c.scales.x.bottom);
    expect(strip.points.map(({ rotation }) => rotation)).toEqual([180, 270, 90, null]);
    for (const point of strip.points) {
      expect(point.x).toBe(c.scales.x.getPixelForValue(point.index));
      expect(point.y - point.size / 2).toBeGreaterThanOrEqual(strip.top);
      expect(point.y + point.size / 2).toBeLessThanOrEqual(strip.bottom);
    }
    expect(strip.labels).toBeUndefined();
  });

  it("keeps arrows readable without overlapping on a 30-sample phone chart", () => {
    const c = chart(Array(30).fill(270), 320);
    const { points } = stripLayout(c);
    expect(points.length).toBeGreaterThan(5);
    expect(points.length).toBeLessThanOrEqual(30);
    for (const [index, point] of points.entries()) {
      expect(point.size).toBeGreaterThanOrEqual(14);
      expect(point.size).toBeLessThanOrEqual(18);
      expect(point.x).toBe(c.scales.x.getPixelForValue(point.index));
      if (index) expect(point.x - points[index - 1].x).toBeGreaterThanOrEqual(point.size);
    }
  });

  it("draws every sample when sufficient width is available", () => {
    const { points } = stripLayout(chart(Array(30).fill(270), 1200));
    expect(points).toHaveLength(30);
    expect(points.map(({ index }) => index)).toEqual(Array.from({ length: 30 }, (_, index) => index));
  });

  it("recomputes from current sample positions rather than autoskipped time ticks", () => {
    const c = chart();
    c.scales.x.ticks = [{ value: 0 }, { value: 2 }];
    expect(stripLayout(c).points).toHaveLength(4);
    const oldX = stripLayout(c).points[2].x;
    c.scales.x.getPixelForValue = (index) => 50 + index * 30;
    expect(stripLayout(c).points[2].x).not.toBe(oldX);
  });

  it("paints bright arrows on an opaque dark strip without text or fake calm headings", () => {
    const c = chart([360, 90, null]);
    const fills = [];
    const backgrounds = [];
    c.ctx = Object.fromEntries([
      "save", "restore", "translate", "rotate", "scale", "beginPath", "moveTo",
      "lineTo", "closePath", "stroke", "fillText",
    ].map((key) => [key, vi.fn()]));
    c.ctx.fill = vi.fn(function () { fills.push(this.fillStyle); });
    c.ctx.fillRect = vi.fn(function () { backgrounds.push(this.fillStyle); });
    directionStrip.afterLayout(c);
    directionStrip.afterDatasetsDraw(c, {}, { color: "#fff200", background: "#111" });
    expect(backgrounds).toContain("#111");
    expect(fills).toEqual(["#fff200", "#fff200"]);
    expect(c.ctx.rotate.mock.calls.map(([rotation]) => rotation)).toEqual([Math.PI, 1.5 * Math.PI]);
    expect(c.ctx.fillText).not.toHaveBeenCalled();
    expect(c.$directionStrip.labels).toBeUndefined();
    directionStrip.afterDestroy(c);
    expect(c.$directionStrip).toBeUndefined();
  });

  it("handles an empty history without inventing data or interaction handlers", () => {
    expect(stripLayout(chart([])).points).toEqual([]);
    expect(directionStrip.beforeEvent).toBeUndefined();
    expect(directionStrip.afterEvent).toBeUndefined();
  });
});
