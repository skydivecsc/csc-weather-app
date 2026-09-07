import { expect, test } from "@playwright/test";

const API_ORIGIN = "https://login.cscwx2.com";
const LEGEND = "Arrows show wind flow; direction labels show wind FROM.";
const aloftMap = (value) =>
  Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [`${(index + 1) * 1000}`, value])
  );

const makeHistory = () => {
  const now = Date.now();
  return [
    [360, 10, 14],
    [90, 11, 16],
    [270, 12, 18],
    [180, 0, 0],
    [0, 9, 12],
    [90, 8, 11],
    [180, 13, 19],
  ].map(([direction, wind, gust], index) => ({
    id: index + 1,
    unique_id: index === 5 ? "no_report!" : `direction-test-${index}`,
    received_time: new Date(now - (6 - index) * 60000).toISOString(),
    direction: `${direction}`,
    wind_speed: `${wind}`,
    gust_speed: `${gust}`,
  }));
};

const isolateWeather = async (page, { darkTheme = "true", speedUnit = "true" } = {}) => {
  const state = { history: makeHistory(), gustRequests: 0, forbiddenRequests: [] };
  await page.addInitScript(({ theme, units }) => {
    localStorage.setItem("darkTheme", theme);
    localStorage.setItem("speedUnit", units);
  }, { theme: darkTheme, units: speedUnit });
  await page.routeWebSocket("wss://api.skydivecsc.com/graphql", (socket) =>
    socket.close({ code: 1013, reason: "Isolated direction test" })
  );

  // Only the local Vite server may reach the network. All API responses and
  // third-party resources are isolated, including on the loading-area route.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.origin !== API_ORIGIN) return route.abort();

    const now = Date.now();
    let body = {};
    switch (url.pathname) {
      case "/api/weather/gusts":
        state.gustRequests += 1;
        body = state.history;
        break;
      case "/api/weather/aloft":
        body = {
          direction: aloftMap(270), speed: aloftMap(10), temp: aloftMap(20), validtime: "18",
        };
        break;
      case "/api/weather/astronomy":
        body = { results: {
          sunrise: new Date(now - 3600000).toISOString(),
          sunset: new Date(now + 1800000).toISOString(),
          civil_twilight_end: new Date(now + 3600000).toISOString(),
        } };
        break;
      case "/api/jumpruns/":
        body = { jumpruns: [] };
        break;
      case "/api/loads/":
        body = [];
        break;
      default:
        state.forbiddenRequests.push(url.pathname);
        return route.abort();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
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

// Inspect the existing Chart.js instance to locate painted points for real
// pointer/touch input; no test-only application globals are needed.
const chartSnapshot = (page) => page.evaluate(async () => {
  const moduleUrl = performance.getEntriesByType("resource")
    .find(({ name }) => /\/chart__js_auto\.js(?:\?|$)/.test(name))?.name;
  if (!moduleUrl) throw new Error("The chart.js/auto module has not loaded");
  const { default: Chart } = await import(moduleUrl);
  const canvas = document.querySelector(".gust-chart canvas");
  const chart = Chart.getChart(canvas);
  if (!chart) throw new Error("The gust chart has not initialized");
  return {
    title: chart.options.plugins.title.text,
    settled: chart.data.datasets.every((_, index) =>
      chart.getDatasetMeta(index).data.every((point) => {
        const target = point.getProps(["x", "y"], true);
        return Math.abs(point.x - target.x) < 0.1 && Math.abs(point.y - target.y) < 0.1;
      })
    ),
    datasets: chart.data.datasets.map((dataset, index) => ({
      label: dataset.label,
      values: dataset.data.map(Number),
      points: chart.getDatasetMeta(index).data.map((point) => {
        const marker = point.options.pointStyle;
        return {
          x: point.x, y: point.y,
          marker: marker instanceof HTMLCanvasElement ? "canvas" : marker,
          markerWidth: marker instanceof HTMLCanvasElement ? marker.width : null,
          rotation: point.options.rotation,
          paintedMarker: marker instanceof HTMLCanvasElement
            ? marker.getContext("2d").getImageData(0, 0, marker.width, marker.height)
              .data.some((value, pixelIndex) => pixelIndex % 4 === 3 && value > 0)
            : null,
        };
      }),
    })),
  };
});

const sampleDetails = (page) => page.getByRole("status", { name: "Selected wind sample" });

for (const pathname of ["/gusts", "/loadingarea"]) {
  test(`${pathname} draws historical wind arrows and selects the matching sample by pointer`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const chart = page.locator(".gust-chart");
    const canvas = chart.locator("canvas");
    await expect(chart.getByText(LEGEND, { exact: true })).toBeVisible();
    await expect(sampleDetails(page)).toContainText("Wind from 180° (S)");
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);

    const snapshot = await chartSnapshot(page);
    const wind = snapshot.datasets[0];
    const gust = snapshot.datasets[1];
    expect(wind.label).toBe("Wind Speed");
    expect(gust.label).toBe("Gust Speed");
    expect(wind.points.map(({ marker }) => marker)).toEqual([
      "canvas", "canvas", "canvas", "circle", "circle", "circle", "canvas",
    ]);
    expect(wind.points.slice(0, 3).map(({ rotation }) => rotation)).toEqual([180, 270, 90]);
    expect(wind.points.filter(({ marker }) => marker === "canvas")
      .every(({ paintedMarker }) => paintedMarker)).toBe(true);
    expect(gust.points.every(({ marker }) => marker === "circle")).toBe(true);

    const position = { x: wind.points[2].x, y: wind.points[2].y };
    if (isMobile) await canvas.tap({ position });
    else await canvas.hover({ position });
    await expect(sampleDetails(page)).toContainText("Wind from 270° (W)");
    await expect(sampleDetails(page)).toContainText("Wind speed: 12 kts");
    await expect(sampleDetails(page)).toContainText("Gust speed: 18 kts");

    if (!isMobile) {
      const selector = page.getByRole("combobox", { name: "History sample" });
      await selector.focus();
      await selector.press("ArrowUp");
      await expect(sampleDetails(page)).toContainText("Wind from 90° (E)");
      await expect(sampleDetails(page)).toContainText("Wind speed: 11 kts");
    }
    const frame = await page.locator(".gust-chart-frame").boundingBox();
    expect(frame.width).toBeGreaterThan(100);
    expect(frame.height).toBeGreaterThan(80);
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} preserves light theme and route-specific units with historical direction`, async ({ page }) => {
    const state = await isolateWeather(page, { darkTheme: "false", speedUnit: "false" });
    await page.goto(pathname);
    await expect(sampleDetails(page)).toContainText("Wind from 180° (S)");
    const useKnots = pathname === "/loadingarea";
    await expect(sampleDetails(page)).toContainText(`Wind speed: ${useKnots ? 13 : 15} ${useKnots ? "kts" : "mph"}`);
    await expect(sampleDetails(page)).toContainText(`Gust speed: ${useKnots ? 19 : 22} ${useKnots ? "kts" : "mph"}`);
    await expect(page.locator(".Applight")).toBeVisible();
    const snapshot = await chartSnapshot(page);
    expect(snapshot.title).toContain(`Wind Speed in ${useKnots ? "kts" : "mph"}`);
    expect(snapshot.datasets[0].points[2].rotation).toBe(90);
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} fits all 30 near-flat history arrows within the available chart width`, async ({ page, isMobile }, testInfo) => {
    if (!isMobile && pathname === "/loadingarea") {
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
    const state = await isolateWeather(page);
    const now = Date.now();
    const directions = [360, 45, 90, 135, 180, 225, 270, 315];
    state.history = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      unique_id: `dense-direction-${index}`,
      received_time: new Date(now - (29 - index) * 60000).toISOString(),
      direction: `${directions[index % directions.length]}`,
      wind_speed: `${10 + (index % 3) * 0.1}`,
      gust_speed: `${13 + (index % 3) * 0.1}`,
    }));
    await page.goto(pathname);
    await expect(sampleDetails(page)).toContainText("Wind from 225° (SW)");
    const chart = page.locator(".gust-chart");
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    const snapshot = await chartSnapshot(page);
    const windPoints = snapshot.datasets[0].points;
    expect(windPoints).toHaveLength(30);
    expect(snapshot.datasets[1].points).toHaveLength(30);
    await expect(page.getByRole("combobox", { name: "History sample" }).locator("option")).toHaveCount(31);
    const spacing = windPoints[1].x - windPoints[0].x;
    for (const point of windPoints) {
      expect(point.marker).toBe("canvas");
      expect(point.paintedMarker).toBe(true);
      expect(point.markerWidth).toBeGreaterThanOrEqual(8);
      expect(point.markerWidth).toBeLessThanOrEqual(18);
      expect(point.markerWidth).toBeLessThanOrEqual(spacing);
    }
    const box = await chart.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);

    const screenshotPath = testInfo.outputPath(`${pathname.slice(1)}-dense-wind.png`);
    if (!isMobile && pathname === "/loadingarea") {
      await page.screenshot({ path: screenshotPath });
    } else {
      await chart.screenshot({ path: screenshotPath });
    }
    await testInfo.attach("30-minute direction layout", { path: screenshotPath, contentType: "image/png" });
    expect(state.forbiddenRequests).toEqual([]);
  });
}

test("selection follows the latest reading until pinned and survives rolling history refresh", async ({ page }) => {
  const state = await isolateWeather(page);
  await page.goto("/gusts");
  const selector = page.getByRole("combobox", { name: "History sample" });
  await expect(sampleDetails(page)).toContainText("Wind from 180° (S)");

  const refresh = async () => {
    const before = state.gustRequests;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(() => state.gustRequests).toBeGreaterThan(before);
  };
  state.history = [...state.history, {
    id: 8, unique_id: "direction-test-new",
    received_time: new Date().toISOString(),
    direction: "315", wind_speed: "15", gust_speed: "20",
  }];
  await refresh();
  await expect(sampleDetails(page)).toContainText("Wind from 315° (NW)");

  // The first option follows latest; the fourth option is the original west sample.
  await selector.selectOption({ index: 3 });
  await expect(sampleDetails(page)).toContainText("Wind from 270° (W)");
  const selectedValue = await selector.inputValue();
  state.history = state.history.slice(1);
  await refresh();
  await expect(selector).toHaveValue(selectedValue);
  await expect(sampleDetails(page)).toContainText("Wind from 270° (W)");
  await expect(sampleDetails(page)).toContainText("Wind speed: 12 kts");

  state.history = state.history.filter(({ direction }) => direction !== "270");
  await refresh();
  await expect(selector).toHaveValue("");
  await expect(sampleDetails(page)).toContainText("Wind from 315° (NW)");
  expect(state.forbiddenRequests).toEqual([]);
});
