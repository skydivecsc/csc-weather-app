const HIT_DISTANCE = 24;
const TAP_MOVEMENT = 8;
const keyFor = (sample) => `${sample.id ?? ""}:${sample.received_time}`;

// Chart.js owns drawing; this controller owns input so an empty part of the
// plot cannot select a timestamp or replay an old event during polling.
export function attachHistoryInteraction(chart, announcement) {
  const canvas = chart.canvas;
  const document = canvas.ownerDocument;
  const listeners = [];
  let samples = [];
  let activeKey = null;
  let gesture = null;

  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  };
  const dismiss = () => {
    activeKey = null;
    announcement.textContent = "";
    const hadActive = chart.getActiveElements().length || chart.tooltip?.getActiveElements().length;
    chart.setActiveElements([]);
    chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
    if (hadActive) chart.update("none");
  };
  const show = (index, anchor) => {
    const sample = samples[index];
    if (!sample) return dismiss();
    const elements = [0, 1].filter((datasetIndex) =>
      chart.isDatasetVisible(datasetIndex) && chart.getDatasetMeta(datasetIndex).data[index]
    ).map((datasetIndex) => ({ datasetIndex, index }));
    if (!elements.length) return dismiss();
    const point = anchor ?? chart.getDatasetMeta(elements[0].datasetIndex).data[index];
    activeKey = keyFor(sample);
    chart.setActiveElements(elements);
    chart.tooltip?.setActiveElements(elements, { x: point.x, y: point.y });
    chart.update("none");
    announcement.textContent = `${sample.time} Chicago time. Wind speed: ${sample.wind} ${sample.unit}. Gust speed: ${sample.gust} ${sample.unit}. ${sample.directionText}`;
  };
  const pick = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return dismiss();
    let nearest = null;
    let distance = HIT_DISTANCE;
    for (const datasetIndex of [0, 1]) {
      if (!chart.isDatasetVisible(datasetIndex)) continue;
      chart.getDatasetMeta(datasetIndex).data.forEach((point, index) => {
        if (!samples[index] || point.skip || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const area = chart.chartArea;
        if (point.x < area.left || point.x > area.right || point.y < area.top || point.y > area.bottom) return;
        const dx = event.clientX - rect.left - point.x * rect.width / chart.width;
        const dy = event.clientY - rect.top - point.y * rect.height / chart.height;
        const candidate = Math.hypot(dx, dy);
        if (candidate <= distance) {
          distance = candidate;
          nearest = { index, point };
        }
      });
    }
    if (nearest) show(nearest.index, nearest.point);
    else dismiss();
  };

  listen(canvas, "pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      if (event.button === 0) pick(event);
      return;
    }
    dismiss();
    if (gesture || event.isPrimary === false) {
      if (gesture) gesture.moved = true;
      return;
    }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });
  listen(canvas, "pointermove", (event) => {
    if (event.pointerType === "mouse") {
      if (!event.buttons) pick(event);
    } else if (gesture?.id === event.pointerId &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > TAP_MOVEMENT) {
      gesture.moved = true;
      dismiss();
    }
  });
  listen(canvas, "pointerup", (event) => {
    if (event.pointerType === "mouse") {
      if (event.button === 0) pick(event);
      return;
    }
    if (gesture?.id !== event.pointerId) return;
    const tapped = !gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= TAP_MOVEMENT;
    gesture = null;
    if (tapped) pick(event);
    else dismiss();
  });
  listen(canvas, "pointercancel", () => { gesture = null; dismiss(); });
  listen(canvas, "pointerleave", (event) => {
    if (event.pointerType === "mouse") dismiss();
  });
  listen(canvas, "blur", dismiss);
  listen(canvas, "keydown", (event) => {
    if (!samples.length || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = samples.findIndex((sample) => keyFor(sample) === activeKey);
    const next = index < 0 ? (event.key === "ArrowLeft" ? samples.length - 1 : 0)
      : Math.max(0, Math.min(samples.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
    show(next);
  });
  listen(document, "keydown", (event) => {
    if (event.key === "Escape") dismiss();
  });
  listen(document, "pointerdown", (event) => {
    if (event.target !== canvas) { gesture = null; dismiss(); }
  }, true);
  listen(document, "scroll", () => {
    if (gesture) gesture.moved = true;
    dismiss();
  }, { capture: true, passive: true });

  return {
    setSamples(nextSamples) {
      samples = nextSamples;
      if (activeKey !== null) {
        const index = samples.findIndex((sample) => keyFor(sample) === activeKey);
        if (index >= 0) show(index);
        else dismiss();
      }
    },
    destroy() {
      listeners.forEach((remove) => remove());
      gesture = null;
      dismiss();
    },
  };
}
