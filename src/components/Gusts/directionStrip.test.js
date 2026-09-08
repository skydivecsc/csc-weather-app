import { describe, expect, it, vi } from "vitest";
import { Tooltip } from "chart.js";
import { directionStrip, stripLayout } from "./directionStrip";

function chart(directions = [360, 90, 270, null], width = 400) {
  return {
    width,
    chartArea: { bottom: 150, left: 30, width: width - 60 },
    data: { datasets: [{ historyDirections: directions }] },
    ctx: { measureText: (text) => ({ width: text.length * 7 }) },
    scales: { x: { bottom: 200, getPixelForValue: (i) => 30 + i * (width - 60) / Math.max(1, directions.length - 1),
      ticks: directions.map((_, value) => ({ value })) } },
  };
}

describe("direction strip", () => {
  it("aligns arrows between the plotted baseline and time labels without degree labels", () => {
    const c = chart();
    const strip = stripLayout(c);
    expect(strip.points.map((point) => point.rotation)).toEqual([180, 270, 90, null]);
    strip.points.forEach((point) => {
      expect(point.x).toBe(c.scales.x.getPixelForValue(point.index));
      expect(point.y).toBeGreaterThan(c.chartArea.bottom);
      expect(point.y).toBeLessThan(c.scales.x.bottom);
    });
    expect(strip.labels).toBeUndefined();
  });
  it("keeps all 30 arrows within the available width without degree labels", () => {
    const strip = stripLayout(chart(Array(30).fill(270), 320));
    expect(strip.points).toHaveLength(30);
    expect(strip.labels).toBeUndefined();
    expect(strip.points[0].size).toBeLessThan(strip.points[1].x - strip.points[0].x);
  });
  it("recomputes positions after resizing independently of visible time ticks", () => {
    const c = chart();
    c.scales.x.ticks = [{ value: 0 }, { value: 2 }];
    expect(stripLayout(c).points).toHaveLength(4);
    const oldX = stripLayout(c).points[2].x;
    c.scales.x.getPixelForValue = (i) => 50 + i * 30;
    expect(stripLayout(c).points[2].x).not.toBe(oldX);
  });
  it("draws neutral dashes instead of inventing headings and clears layout on destruction", () => {
    const c = chart([null]);
    c.ctx = { ...c.ctx, save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
    directionStrip.afterLayout(c);
    directionStrip.afterDatasetsDraw(c, {}, { color: "black", background: "white" });
    expect(c.ctx.fillText).toHaveBeenCalledExactlyOnceWith("—", 30, 166);
    expect(c.$directionStrip.labels).toBeUndefined();
    directionStrip.afterDestroy(c);
    expect(c.$directionStrip).toBeUndefined();
  });
  it("anchors a popup to the current strip geometry on resize, and to plot markers otherwise", () => {
    const c = chart();
    c.$directionStrip = stripLayout(c);
    c.$historyAnchor = { index: 1, strip: true };
    const position = Tooltip.positioners.cscwxHistory.call({ chart: c }, [], { x: 0, y: 0 });
    expect(position).toEqual({ x: c.scales.x.getPixelForValue(1), y: 166 });
    c.$historyAnchor = { index: 1, strip: false, datasetIndex: 1 };
    c.getDatasetMeta = () => ({ data: [{}, { x: 50, y: 60 }] });
    expect(Tooltip.positioners.cscwxHistory.call({ chart: c }, [], {})).toEqual({ x: 50, y: 60 });
  });
});
