import { expect, test } from "@playwright/test";

const API_ORIGIN = "https://login.cscwx2.com";
const LEGEND = "Arrows show flow; degrees show wind FROM.";
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
const chartSnapshot = async (page) => {
  let snapshot;
  // A visible canvas can precede Chart.js attachment (especially in WebKit
  // and during StrictMode recreation). Await the real initialized instance.
  await expect(async () => {
    snapshot = await page.evaluate(async () => {
  const moduleUrl = performance.getEntriesByType("resource")
    .find(({ name }) => /\/chart__js_auto\.js(?:\?|$)/.test(name))?.name;
  if (!moduleUrl) throw new Error("The chart.js/auto module has not loaded");
  const { default: Chart } = await import(moduleUrl);
  const canvas = document.querySelector(".gust-chart canvas");
  const chart = Chart.getChart(canvas);
  if (!chart) throw new Error("The gust chart has not initialized");
  return {
    title: chart.options.plugins.title.text,
    area: { ...chart.chartArea },
    strip: chart.$directionStrip,
    axisBottom: chart.scales.x.bottom,
    height: chart.height,
    tooltip: {
      opacity: chart.tooltip.opacity ?? 0,
      indexes: (chart.tooltip.dataPoints ?? []).map(({ dataIndex }) => dataIndex),
    },
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
  }).toPass({ timeout: 5000 });
  return snapshot;
};

const sampleDetails = (page) => page.getByRole("status", { name: "Active wind sample" });
const chartCanvas = (page) => page.locator(".gust-chart canvas");

const expectClosed = async (page) => {
  await expect(sampleDetails(page)).toHaveText("");
  await expect.poll(async () => (await chartSnapshot(page)).tooltip.opacity).toBe(0);
};

const expectSample = async (page, index, direction) => {
  await expect(sampleDetails(page)).toContainText(direction);
  await expect.poll(async () => (await chartSnapshot(page)).tooltip.opacity).toBe(1);
  const snapshot = await chartSnapshot(page);
  expect(snapshot.tooltip.indexes).toEqual([index, index]);
};

const pointInput = async (page, isMobile, position, { hover = false } = {}) => {
  const canvas = chartCanvas(page);
  if (isMobile) await canvas.tap({ position });
  else if (hover) await canvas.hover({ position });
  else await canvas.click({ position });
};

const refreshHistory = async (page, state) => {
  const before = state.gustRequests;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => state.gustRequests).toBeGreaterThan(before);
};

for (const pathname of ["/gusts", "/loadingarea"]) {
  test(`${pathname} draws a separate historical direction strip and selects its sample by pointer`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const chart = page.locator(".gust-chart");
    const canvas = chart.locator("canvas");
    await expect(chart.getByText(LEGEND, { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "History sample" })).toHaveCount(0);
    await expect(chart.locator(".gust-sample-controls, .gust-sample-details")).toHaveCount(0);
    await expectClosed(page);
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);

    const snapshot = await chartSnapshot(page);
    const wind = snapshot.datasets[0];
    const gust = snapshot.datasets[1];
    expect(wind.label).toBe("Wind Speed");
    expect(gust.label).toBe("Gust Speed");
    expect(wind.points.every(({ marker }) => marker === "circle")).toBe(true);
    expect(snapshot.strip.points.map(({ rotation }) => rotation)).toEqual([180, 270, 90, null, null, null, 0]);
    expect(snapshot.strip.top).toBeGreaterThan(snapshot.axisBottom);
    expect(snapshot.strip.bottom).toBeLessThan(snapshot.height);
    snapshot.strip.points.forEach((point, index) => expect(point.x).toBeCloseTo(wind.points[index].x, 3));
    expect(gust.points.every(({ marker }) => marker === "circle")).toBe(true);

    const position = { x: snapshot.strip.points[2].x, y: snapshot.strip.points[2].y };
    await pointInput(page, isMobile, position, { hover: true });
    await expectSample(page, 2, "Wind from 270° (W)");
    await expect(sampleDetails(page)).toContainText(/Wind speed: 12 kts/i);
    await expect(sampleDetails(page)).toContainText(/Gust speed: 18 kts/i);
    await expect(sampleDetails(page)).toContainText("Chicago time");
    const frame = await page.locator(".gust-chart-frame").boundingBox();
    expect(frame.width).toBeGreaterThan(100);
    expect(frame.height).toBeGreaterThan(80);
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} preserves light theme and route-specific units with historical direction`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page, { darkTheme: "false", speedUnit: "false" });
    await page.goto(pathname);
    await expect(page.locator(".gust-chart")).toBeVisible();
    const snapshot = await chartSnapshot(page);
    const point = snapshot.datasets[0].points[6];
    await pointInput(page, isMobile, { x: point.x, y: point.y });
    await expectSample(page, 6, "Wind from 180° (S)");
    const useKnots = pathname === "/loadingarea";
    await expect(sampleDetails(page)).toContainText(new RegExp(`Wind speed: ${useKnots ? 13 : 15} ${useKnots ? "kts" : "mph"}`, "i"));
    await expect(sampleDetails(page)).toContainText(new RegExp(`Gust speed: ${useKnots ? 19 : 22} ${useKnots ? "kts" : "mph"}`, "i"));
    await expect(page.locator(".Applight")).toBeVisible();
    expect(snapshot.title).toContain(`Wind Speed in ${useKnots ? "kts" : "mph"}`);
    expect(snapshot.strip.points[2].rotation).toBe(90);
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
    const chart = page.locator(".gust-chart");
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartSnapshot(page)).settled).toBe(true);
    const snapshot = await chartSnapshot(page);
    const windPoints = snapshot.datasets[0].points;
    expect(windPoints).toHaveLength(30);
    expect(snapshot.datasets[1].points).toHaveLength(30);
    await expect(page.getByRole("combobox", { name: "History sample" })).toHaveCount(0);
    const spacing = windPoints[1].x - windPoints[0].x;
    expect(windPoints.every((point) => point.marker === "circle")).toBe(true);
    expect(snapshot.strip.points).toHaveLength(30);
    for (const point of snapshot.strip.points) {
      expect(point.size).toBeGreaterThanOrEqual(4);
      expect(point.size).toBeLessThanOrEqual(18);
      expect(point.size).toBeLessThanOrEqual(spacing);
      expect(point.x).toBeCloseTo(windPoints[point.index].x, 3);
    }
    expect(snapshot.strip.labels.length).toBeGreaterThan(1);
    if (isMobile) expect(snapshot.strip.labels.length).toBeLessThan(30);
    snapshot.strip.labels.forEach((label, index) => {
      expect(label.text).toBe(`${state.history[label.index].direction}°`);
      if (index) expect(label.left).toBeGreaterThanOrEqual(snapshot.strip.labels[index - 1].right + 8);
    });
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

  test(`${pathname} requires two-dimensional marker proximity and dismisses distant or outside input`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    await chartCanvas(page).scrollIntoViewIfNeeded();
    const snapshot = await chartSnapshot(page);
    const wind = snapshot.datasets[0].points[2];
    const gust = snapshot.datasets[1].points[2];

    // The 24px radius uses CSS pixels even on high-DPI phones. Select by
    // proximity below a wind marker, then reject a point just beyond it.
    await pointInput(page, isMobile, { x: wind.x, y: wind.y + 23 });
    await expectSample(page, 2, "Wind from 270° (W)");
    await pointInput(page, isMobile, { x: wind.x, y: wind.y + 26 });
    await expectClosed(page);
    await pointInput(page, isMobile, { x: wind.x, y: wind.y });
    await expectSample(page, 2, "Wind from 270° (W)");
    await pointInput(page, isMobile, { x: wind.x + 18, y: wind.y + 18 });
    await expectClosed(page);

    // Gust markers select the same timestamp's complete data too.
    await pointInput(page, isMobile, { x: gust.x, y: gust.y });
    await expectSample(page, 2, "Wind from 270° (W)");
    await pointInput(page, isMobile, { x: wind.x, y: snapshot.area.top + 2 });
    await expectClosed(page);

    // Same-axis index selection must not turn any empty chart space into a hit.
    await pointInput(page, isMobile, { x: wind.x, y: wind.y });
    await expectSample(page, 2, "Wind from 270° (W)");
    const legend = page.getByText(LEGEND, { exact: true });
    if (isMobile) await legend.tap();
    else await legend.click();
    await expectClosed(page);

    // Calm/zero readings stay real points, including their clipped circles.
    const calm = snapshot.datasets[0].points[3];
    await pointInput(page, isMobile, { x: calm.x, y: calm.y - 2 });
    await expectSample(page, 3, "Calm — direction unavailable");
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} selects strip arrows, dismisses away, and realigns on rolling history and resize`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const canvas = chartCanvas(page);
    await canvas.scrollIntoViewIfNeeded();
    let point = (await chartSnapshot(page)).strip.points[2];
    await pointInput(page, isMobile, { x: point.x, y: point.y });
    await expectSample(page, 2, "Wind from 270° (W)");
    state.history = state.history.slice(1);
    await refreshHistory(page, state);
    await expect.poll(async () => (await chartSnapshot(page)).strip.points.length).toBe(6);
    await expectSample(page, 1, "Wind from 270° (W)");
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width + 100, height: viewport.height });
    await expect.poll(async () => {
      const current = await chartSnapshot(page);
      return current.strip.points.every((p, i) => Math.abs(p.x - current.datasets[0].points[i].x) < 0.1);
    }).toBe(true);
    // Clear any browser-generated scroll/resize dismissal, then test the new geometry.
    await canvas.scrollIntoViewIfNeeded();
    point = (await chartSnapshot(page)).strip.points[1];
    await pointInput(page, isMobile, { x: point.x, y: point.y });
    await expectSample(page, 1, "Wind from 270° (W)");
    await pointInput(page, isMobile, { x: point.x, y: point.y - 26 });
    await expectClosed(page);
    await refreshHistory(page, state);
    await expectClosed(page);
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} supports keyboard samples, Escape, and mouse departure without persistent details`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const canvas = chartCanvas(page);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute("tabindex", "0");
    await canvas.focus();
    await canvas.press("ArrowLeft");
    await expectSample(page, 6, "Wind from 180° (S)");
    await canvas.press("ArrowLeft");
    await expectSample(page, 5, "Direction unavailable");
    await canvas.press("ArrowRight");
    await expectSample(page, 6, "Wind from 180° (S)");
    await canvas.press("Escape");
    await expectClosed(page);

    if (!isMobile) {
      const point = (await chartSnapshot(page)).datasets[0].points[2];
      await canvas.hover({ position: { x: point.x, y: point.y } });
      await expectSample(page, 2, "Wind from 270° (W)");
      await canvas.hover({ position: { x: point.x, y: 12 } });
      await expectClosed(page);
      await canvas.hover({ position: { x: point.x, y: point.y } });
      await expectSample(page, 2, "Wind from 270° (W)");
      await page.getByText(LEGEND, { exact: true }).hover();
      await expectClosed(page);
    }
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} never reopens a dismissed popup when history polls or rolls forward`, async ({ page, isMobile }) => {
    const state = await isolateWeather(page);
    await page.goto(pathname);
    await chartCanvas(page).scrollIntoViewIfNeeded();
    const point = (await chartSnapshot(page)).datasets[0].points[2];
    await pointInput(page, isMobile, { x: point.x, y: point.y });
    await expectSample(page, 2, "Wind from 270° (W)");
    await page.keyboard.press("Escape");
    await expectClosed(page);

    state.history = [...state.history.slice(1), {
      id: 8, unique_id: "direction-test-new",
      received_time: new Date().toISOString(),
      direction: "315", wind_speed: "15", gust_speed: "20",
    }];
    await refreshHistory(page, state);
    await expect.poll(async () => (await chartSnapshot(page)).datasets[0].values.at(-1)).toBe(15);
    await expectClosed(page);
    state.history = state.history.filter(({ direction }) => direction !== "270");
    await refreshHistory(page, state);
    await expect.poll(async () => (await chartSnapshot(page)).datasets[0].points.length).toBe(state.history.length);
    await expectClosed(page);

    const latest = (await chartSnapshot(page)).datasets[0].points.at(-1);
    await pointInput(page, isMobile, { x: latest.x, y: latest.y });
    await expectSample(page, state.history.length - 1, "Wind from 315° (NW)");
    expect(state.forbiddenRequests).toEqual([]);
  });

  test(`${pathname} does not select a sample while a touch gesture scrolls across markers`, async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, "Touch scrolling is covered on the phone projects");
    const state = await isolateWeather(page);
    await page.goto(pathname);
    const canvas = chartCanvas(page);
    await canvas.scrollIntoViewIfNeeded();
    const point = (await chartSnapshot(page)).strip.points[2];
    if (browserName === "chromium") {
      // Actual native touchscreen input covers compatibility-click suppression.
      const bounds = await canvas.boundingBox();
      const session = await page.context().newCDPSession(page);
      const x = bounds.x + point.x;
      const y = bounds.y + point.y;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart", touchPoints: [{ x, y }],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x, y: y - 60 }],
      });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await session.detach();
    } else {
      // WebKit has no CDP gesture API. Exercise the same DOM pointer lifecycle
      // and a subsequent compatibility click without preventing native scrolling.
      const prevented = await canvas.evaluate((element, position) => {
        const box = element.getBoundingClientRect();
        const options = { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 1, isPrimary: true,
          clientX: box.left + position.x, clientY: box.top + position.y };
        const down = new PointerEvent("pointerdown", options);
        element.dispatchEvent(down);
        const move = new PointerEvent("pointermove", { ...options, clientY: options.clientY - 60 });
        element.dispatchEvent(move);
        element.dispatchEvent(new PointerEvent("pointerup", { ...options, clientY: options.clientY - 60 }));
        element.dispatchEvent(new MouseEvent("click", options));
        return down.defaultPrevented || move.defaultPrevented;
      }, point);
      expect(prevented).toBe(false);
    }
    await expectClosed(page);
    // A genuine tap after a completed scroll must still open normally.
    await canvas.scrollIntoViewIfNeeded();
    const currentPoint = (await chartSnapshot(page)).strip.points[2];
    await canvas.tap({ position: { x: currentPoint.x, y: currentPoint.y } });
    await expectSample(page, 2, "Wind from 270° (W)");
    expect(state.forbiddenRequests).toEqual([]);
  });
}
