import { afterEach, describe, expect, it, vi } from "vitest";
import { attachHistoryInteraction } from "./interaction";

const row = (id) => ({ id, received_time: `time-${id}`, time: `1:0${id} PM`, wind: id, gust: id + 5, unit: "kts", directionText: "Wind from 270° (W)" });
const cleanups = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.replaceChildren(); });

function setup() {
  const canvas = document.createElement("canvas");
  const announcement = document.createElement("div");
  document.body.append(canvas, announcement);
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 200 });
  let active = [], tooltipActive = [];
  const chart = {
    canvas, width: 200, height: 200, chartArea: { left: 0, top: 0, right: 200, bottom: 200 },
    isDatasetVisible: () => true,
    getDatasetMeta: (dataset) => ({ data: [0, 1, 2].map((i) => ({ x: 20 + i * 70, y: dataset ? 30 : 100 })) }),
    getActiveElements: () => active,
    setActiveElements: vi.fn((elements) => { active = elements; }),
    update: vi.fn(),
    tooltip: { getActiveElements: () => tooltipActive, setActiveElements: vi.fn((elements) => { tooltipActive = elements; }) },
  };
  const controller = attachHistoryInteraction(chart, announcement);
  controller.setSamples([row(1), row(2), row(3)]);
  cleanups.push(controller.destroy);
  const pointer = (type, values = {}, target = canvas) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerType: "mouse", pointerId: 1, button: 0, buttons: 0, clientX: 100, clientY: 120, ...values });
    target.dispatchEvent(event);
  };
  const key = (key, target = canvas) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return { canvas, announcement, chart, controller, pointer, key };
}

describe("chart popup interaction", () => {
  it("selects strip arrows with the same proximity rule and follows their sample on refresh", () => {
    const s = setup();
    s.chart.$directionStrip = { points: [{ x: 20, y: 175, index: 0 }, { x: 90, y: 175, index: 1 }] };
    s.pointer("pointerup", { clientX: 100, clientY: 195 });
    expect(s.announcement.textContent).toContain("Wind speed: 2 kts");
    expect(s.chart.$historyAnchor).toMatchObject({ index: 1, strip: true });
    s.controller.setSamples([row(2), row(3)]);
    expect(s.chart.$historyAnchor).toMatchObject({ index: 0, strip: true });
    s.pointer("pointerup", { clientX: 100, clientY: 220 });
    expect(s.chart.getActiveElements()).toEqual([]);
    expect(s.chart.$historyAnchor).toBeUndefined();
  });
  it("uses a 24px two-dimensional marker hit area, including gust markers", () => {
    const s = setup();
    s.pointer("pointermove", { clientY: 144 });
    expect(s.chart.getActiveElements()).toEqual([{ datasetIndex: 0, index: 1 }, { datasetIndex: 1, index: 1 }]);
    expect(s.announcement.textContent).toContain("Wind speed: 2 kts");
    s.pointer("pointermove", { clientY: 145 });
    expect(s.chart.getActiveElements()).toEqual([]);
    expect(s.chart.tooltip.getActiveElements()).toEqual([]);
    s.pointer("pointerup", { clientY: 50 });
    expect(s.announcement.textContent).toContain("Gust speed: 7 kts");
    s.pointer("pointerdown", { clientY: 200 });
    expect(s.announcement.textContent).toBe("");
  });
  it("measures CSS pixels even when the canvas is scaled", () => {
    const s = setup();
    s.canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 400 });
    s.pointer("pointermove", { clientX: 190, clientY: 244 });
    expect(s.chart.getActiveElements()).toHaveLength(2);
    s.pointer("pointermove", { clientX: 190, clientY: 245 });
    expect(s.chart.getActiveElements()).toEqual([]);
  });
  it("dismisses on outside input, mouse departure, blur, scroll and Escape", () => {
    const s = setup();
    const dismissers = [
      () => s.pointer("pointerdown", {}, document.body),
      () => s.pointer("pointerleave"),
      () => s.canvas.dispatchEvent(new Event("blur")),
      () => document.dispatchEvent(new Event("scroll")),
      () => s.key("Escape", document),
    ];
    for (const dismiss of dismissers) {
      s.pointer("pointermove");
      dismiss();
      expect(s.announcement.textContent).toBe("");
      expect(s.chart.getActiveElements()).toEqual([]);
      expect(s.chart.tooltip.getActiveElements()).toEqual([]);
    }
  });
  it("allows a touch tap, not scrolling, cancellation, or compatibility clicks", () => {
    const s = setup();
    const touch = { pointerType: "touch" };
    s.pointer("pointerdown", touch);
    expect(s.announcement.textContent).toBe("");
    s.pointer("pointerup", touch);
    expect(s.chart.getActiveElements()).toHaveLength(2);
    s.pointer("pointerleave", touch);
    expect(s.chart.getActiveElements()).toHaveLength(2);
    s.pointer("pointerdown", touch);
    s.pointer("pointermove", { ...touch, clientY: 135 });
    s.pointer("pointerup", touch);
    s.canvas.click();
    expect(s.chart.getActiveElements()).toEqual([]);
    s.pointer("pointerdown", touch);
    s.pointer("pointercancel", touch);
    s.pointer("pointerup", touch);
    expect(s.chart.getActiveElements()).toEqual([]);
  });
  it("opens latest with Left, earliest with Right, and clamps at history ends", () => {
    const s = setup();
    s.key("ArrowLeft");
    expect(s.announcement.textContent).toContain("Wind speed: 3 kts");
    s.key("ArrowLeft");
    expect(s.announcement.textContent).toContain("Wind speed: 2 kts");
    s.key("Escape");
    s.key("ArrowRight");
    expect(s.announcement.textContent).toContain("Wind speed: 1 kts");
    s.key("ArrowLeft");
    expect(s.announcement.textContent).toContain("Wind speed: 1 kts");
  });
  it("keeps an active timestamp aligned on refresh, expires it, and never reopens after dismissal", () => {
    const s = setup();
    s.pointer("pointermove");
    s.controller.setSamples([row(2), row(3), row(4)]);
    expect(s.chart.getActiveElements()[0].index).toBe(0);
    expect(s.announcement.textContent).toContain("Wind speed: 2 kts");
    s.controller.setSamples([row(3), row(4)]);
    expect(s.chart.getActiveElements()).toEqual([]);
    s.key("ArrowLeft");
    s.key("Escape");
    s.controller.setSamples([row(4), row(5)]);
    expect(s.announcement.textContent).toBe("");
    expect(s.chart.tooltip.getActiveElements()).toEqual([]);
  });
  it("removes listeners and clears state on cleanup", () => {
    const s = setup();
    s.pointer("pointermove");
    s.controller.destroy();
    s.pointer("pointermove");
    s.key("ArrowRight");
    expect(s.announcement.textContent).toBe("");
    expect(s.chart.getActiveElements()).toEqual([]);
  });
});
