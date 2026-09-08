import { expect, test } from "@playwright/test";

const API_ORIGIN = "https://login.cscwx2.com";
const aloftMap = (value) => Object.fromEntries(
  Array.from({ length: 18 }, (_, index) => [`${(index + 1) * 1000}`, value]),
);
const makeHistory = () => {
  const now = Date.now();
  return [[360, 10, 14], [90, 11, 16], [270, 12, 18], [180, 0, 0], [0, 9, 12], [90, 8, 11], [180, 13, 19]]
    .map(([direction, wind, gust], index) => ({
      id: index + 1, unique_id: index === 5 ? "no_report!" : `direction-test-${index}`,
      received_time: new Date(now - (6 - index) * 60000).toISOString(),
      direction: `${direction}`, wind_speed: `${wind}`, gust_speed: `${gust}`,
    }));
};

const isolateWeather = async (page, { darkTheme = "true", speedUnit = "true" } = {}) => {
  const state = { history: makeHistory(), gustRequests: 0, forbiddenRequests: [] };
  await page.addInitScript(({ theme, units }) => {
    localStorage.setItem("darkTheme", theme);
    localStorage.setItem("speedUnit", units);
  }, { theme: darkTheme, units: speedUnit });
  await page.routeWebSocket("wss://api.skydivecsc.com/graphql", (socket) =>
    socket.close({ code: 1013, reason: "Isolated direction test" }),
  );
  // All API data is synthetic. Production and the side-effectful wind route
  // are never contacted; only this test's local Vite server reaches a network.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.origin !== API_ORIGIN) return route.abort();
    const now = Date.now();
    let body;
    switch (url.pathname) {
      case "/api/weather/gusts":
        state.gustRequests += 1;
        body = state.history;
        break;
      case "/api/weather/aloft":
        body = { direction: aloftMap(270), speed: aloftMap(10), temp: aloftMap(20), validtime: "18" };
        break;
      case "/api/weather/astronomy":
        body = { results: {
          sunrise: new Date(now - 3600000).toISOString(),
          sunset: new Date(now + 1800000).toISOString(),
          civil_twilight_end: new Date(now + 3600000).toISOString(),
        } };
        break;
      case "/api/jumpruns/": body = { jumpruns: [] }; break;
      case "/api/loads/": body = []; break;
      default:
        state.forbiddenRequests.push(url.pathname);
        return route.abort();
    }
    return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(body),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-CSCWX-Server-Time",
        "Cache-Control": "no-store",
        "X-CSCWX-Server-Time": new Date(now).toISOString(),
      },
    });
  });
  return state;
};

// Use Chart.js's existing public registry, not application test globals. A
// visible canvas may precede instance attachment during React StrictMode.
const chartSnapshot = async (page) => {
  let snapshot;
  await expect(async () => {
    snapshot = await page.evaluate(async () => {
      const moduleUrl = performance.getEntriesByType("resource")
        .find(({ name }) => /\/chart__js_auto\.js(?:\?|$)/.test(name))?.name;
      if (!moduleUrl) throw new Error("Chart.js has not loaded");
      const { default: Chart } = await import(moduleUrl);
      const canvas = document.querySelector(".gust-chart canvas");
      const chart = Chart.getChart(canvas);
      if (!chart?.$directionStrip) throw new Error("Direction strip has not laid out");
      const strip = chart.$directionStrip;
      const ratio = chart.currentDevicePixelRatio;
      const pixels = chart.ctx.getImageData(
        Math.ceil(chart.chartArea.left * ratio), Math.ceil(strip.top * ratio),
        Math.floor(chart.chartArea.width * ratio), Math.floor((strip.bottom - strip.top) * ratio),
      ).data;
      let yellowPixels = 0;
      let darkPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] < 240) continue;
        if (pixels[offset] > 220 && pixels[offset + 1] > 200 && pixels[offset + 2] < 40) yellowPixels += 1;
        if (pixels[offset] < 40 && pixels[offset + 1] < 40 && pixels[offset + 2] < 40) darkPixels += 1;
      }
      return {
        area: { ...chart.chartArea }, strip, axisBottom: chart.scales.x.bottom,
        width: chart.width, height: chart.height,
        title: chart.options.plugins.title.text,
        configuredTooltip: Boolean(chart.config.options.plugins.tooltip),
        configuredEvents: chart.config.options.events ?? null,
        tooltip: {
          opacity: chart.tooltip.opacity ?? 0,
          lines: (chart.tooltip.body ?? []).flatMap(({ lines }) => lines),
        },
        pixels: { yellow: yellowPixels, dark: darkPixels, total: pixels.length / 4 },
        settled: chart.data.datasets.every((_, index) => chart.getDatasetMeta(index).data.every((point) => {
          const target = point.getProps(["x", "y"], true);
          return Math.abs(point.x - target.x) < 0.1 && Math.abs(point.y - target.y) < 0.1;
        })),
        datasets: chart.data.datasets.map((dataset, index) => ({
          label: dataset.label, values: dataset.data.map(Number), fill: dataset.fill, tension: dataset.tension,
          points: chart.getDatasetMeta(index).data.map((point) => ({
            x: point.x, y: point.y, marker: point.options.pointStyle,
          })),
        })),
      };
    });
  }).toPass({ timeout: 5000 });
  return snapshot;
};

const assertStrip = (snapshot, history) => {
  expect(snapshot.strip.top - snapshot.area.bottom).toBeGreaterThanOrEqual(0);
  expect(snapshot.strip.top - snapshot.area.bottom).toBeLessThanOrEqual(2);
  expect(snapshot.strip.bottom - snapshot.strip.top).toBeLessThanOrEqual(24);
  expect(snapshot.strip.bottom).toBeLessThan(snapshot.axisBottom);
  expect(snapshot.strip.labels).toBeUndefined();
  expect(snapshot.pixels.yellow).toBeGreaterThan(10);
  expect(snapshot.pixels.dark).toBeGreaterThan(snapshot.pixels.total / 2);
  for (const [index, point] of snapshot.strip.points.entries()) {
    const sample = history[point.index];
    expect(point.x).toBeCloseTo(snapshot.datasets[0].points[point.index].x, 3);
    expect(point.y - point.size / 2).toBeGreaterThanOrEqual(snapshot.strip.top);
    expect(point.y + point.size / 2).toBeLessThanOrEqual(snapshot.strip.bottom);
    expect(point.size).toBeGreaterThanOrEqual(14);
    expect(point.size).toBeLessThanOrEqual(18);
    if (index) expect(point.x - snapshot.strip.points[index - 1].x).toBeGreaterThanOrEqual(point.size);
    const invalid = Number(sample.wind_speed) === 0 || Number(sample.direction) === 0 || sample.unique_id === "no_report!";
    expect(point.rotation).toBe(invalid ? null : (Number(sample.direction) + 180) % 360);
  }
  expect(snapshot.datasets.every(({ points, fill, tension }) =>
    fill && tension === 0.4 && points.every(({ marker }) => marker === "circle"),
  )).toBe(true);
  expect(snapshot.configuredTooltip).toBe(false);
  expect(snapshot.configuredEvents).toBeNull();
};

for (const pathname of ["/gusts", "/loadingarea"]) {
  test(`${pathname} adds only a high-contrast arrow strip and retains the original tooltip`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const chart = page.locator(".gust-chart");
    const canvas = chart.locator("canvas");
    await expect(chart).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    const snapshot = await chartSnapshot(page);
    assertStrip(snapshot, state.history);
    expect(snapshot.strip.points.map(({ rotation }) => rotation)).toEqual([180, 270, 90, null, null, null, 0]);
    await expect(chart.locator(":scope > *")).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "History sample" })).toHaveCount(0);
    await expect(chart.locator(".gust-chart-frame, .gust-sample-details, .gust-direction-legend")).toHaveCount(0);
    await expect(chart).toHaveText("");
    const point = snapshot.datasets[0].points[2];
    if (isMobile) await canvas.tap({ position: { x: point.x, y: point.y } });
    else await canvas.hover({ position: { x: point.x, y: point.y } });
    await expect.poll(async () => (await chartSnapshot(page)).tooltip.opacity).toBe(1);
    const tooltip = (await chartSnapshot(page)).tooltip.lines.join(" ");
    expect(tooltip).toContain("Wind Speed: 12");
    expect(tooltip).not.toContain("Wind from");
    expect(tooltip).not.toContain("°");
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} preserves light theme, units, and the same arrow contrast`, async ({ page }) => {
    const state = await isolateWeather(page, { darkTheme: "false", speedUnit: "false" });
    await page.goto(pathname);
    await expect(page.locator(".gust-chart")).toBeVisible();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    const snapshot = await chartSnapshot(page);
    assertStrip(snapshot, state.history);
    const knots = pathname === "/loadingarea";
    expect(snapshot.datasets[0].values.at(-1)).toBe(knots ? 13 : 15);
    expect(snapshot.datasets[1].values.at(-1)).toBe(knots ? 19 : 22);
    expect(snapshot.title).toBe(`Wind Speed in ${knots ? "kts" : "mph"} - Previous 30 Mins`);
    await expect(page.locator(".Applight")).toBeVisible();
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} keeps dense-history arrows readable and aligned after resize`, async ({ page, isMobile }, testInfo) => {
    if (!isMobile && pathname === "/loadingarea") await page.setViewportSize({ width: 1920, height: 1080 });
    const state = await isolateWeather(page);
    const now = Date.now();
    const directions = [360, 45, 90, 135, 180, 225, 270, 315];
    state.history = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1, unique_id: `dense-direction-${index}`,
      received_time: new Date(now - (29 - index) * 60000).toISOString(),
      direction: `${directions[index % directions.length]}`,
      wind_speed: `${10 + (index % 3) * 0.1}`, gust_speed: `${13 + (index % 3) * 0.1}`,
    }));
    await page.goto(pathname);
    const chart = page.locator(".gust-chart");
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    let snapshot = await chartSnapshot(page);
    assertStrip(snapshot, state.history);
    expect(snapshot.datasets[0].points).toHaveLength(30);
    expect(snapshot.strip.points.length).toBeGreaterThan(5);
    const screenshotPath = testInfo.outputPath(`${pathname.slice(1)}-dense-wind.png`);
    await chart.screenshot({ path: screenshotPath });
    await testInfo.attach("Original chart with direction strip", { path: screenshotPath, contentType: "image/png" });
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width + 120, height: viewport.height });
    await expect.poll(async () => (await chartSnapshot(page)).width).not.toBe(snapshot.width);
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    snapshot = await chartSnapshot(page);
    assertStrip(snapshot, state.history);
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} refreshes arrows with their own history rows without extra controls`, async ({ page }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    await expect(page.locator(".gust-chart")).toBeVisible();
    await chartSnapshot(page);
    state.history = [...state.history.slice(1), {
      id: 8, unique_id: "direction-new", received_time: new Date().toISOString(),
      direction: "315", wind_speed: "15", gust_speed: "20",
    }];
    const before = state.gustRequests;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(() => state.gustRequests).toBeGreaterThan(before);
    await expect.poll(async () => (await chartSnapshot(page)).datasets[0].values.at(-1)).toBe(15);
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    const snapshot = await chartSnapshot(page);
    assertStrip(snapshot, state.history);
    expect(snapshot.strip.points.at(-1).rotation).toBe(135);
    await expect(page.locator(".gust-chart")).toHaveText("");
    expect(state.forbiddenRequests).toEqual([]);
  });
}
