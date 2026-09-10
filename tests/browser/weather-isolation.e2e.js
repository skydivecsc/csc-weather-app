import { expect, test } from "@playwright/test";

const API_ORIGIN = "https://login.cscwx2.com";
const WIND_SOCKET_URL = "wss://api.skydivecsc.com/graphql";
const aloftMap = (value) => Object.fromEntries(
  Array.from({ length: 18 }, (_, index) => [`${(index + 1) * 1000}`, value]),
);

const weatherFrame = (now, overrides = {}) => ({
  id: "weather",
  type: "data",
  payload: { data: { weather: {
    receivedAt: new Date(now).toISOString(),
    metar: "KAAA 010000Z CLR 70 50 A3000",
    temperature: 70,
    presentWeather: null,
    skyCondition: [{ cloudCover: "CLR", altitude: null }],
    ...overrides,
  } } },
});

const windFrame = (now, speed = 10) => ({
  id: "wind",
  type: "data",
  payload: { data: { wind: {
    receivedAt: new Date(now).toISOString(),
    direction: 280,
    gustSpeed: 13,
    speed,
    variableDirection: null,
  } } },
});

const startIsolatedWeather = async (page, pathname = "/") => {
  const state = {
    now: Date.now(),
    sockets: [],
    forbiddenRequests: [],
    sendInitialWind: true,
  };
  await page.clock.install({ time: state.now });
  // Freeze the clock while the page is still blank. A future pause requested
  // after rendering can become a past timestamp during a slow WebKit RPC;
  // there are no application deadlines to expire before this navigation.
  await page.clock.pauseAt(state.now + 60000);
  state.now = await page.evaluate(() => Date.now());
  // Only the local Vite server reaches the network. All public API values and
  // the AWOS socket are synthetic; no request can collect real wind data.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.origin !== API_ORIGIN) return route.abort();
    let body;
    switch (url.pathname) {
      case "/api/weather/gusts":
        body = [{
          id: 1,
          unique_id: "isolated-weather-wind",
          received_time: new Date(state.now).toISOString(),
          direction: "270",
          wind_speed: "11",
          gust_speed: "14",
        }];
        break;
      case "/api/weather/aloft":
        body = {
          direction: aloftMap(270), speed: aloftMap(10),
          temp: aloftMap(20), validtime: "18",
        };
        break;
      case "/api/weather/astronomy":
        body = { results: {
          sunrise: new Date(state.now - 3600000).toISOString(),
          sunset: new Date(state.now + 1800000).toISOString(),
          civil_twilight_end: new Date(state.now + 3600000).toISOString(),
        } };
        break;
      case "/api/jumpruns/": body = { jumpruns: [] }; break;
      case "/api/loads/": body = []; break;
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
        "X-CSCWX-Server-Time": new Date(state.now).toISOString(),
      },
    });
  });
  await page.routeWebSocket(WIND_SOCKET_URL, (socket) => {
    const connection = {
      socket, subscribed: false, closed: false, weatherStarts: 0, windStarts: 0,
    };
    state.sockets.push(connection);
    socket.onClose(() => { connection.closed = true; });
    socket.onMessage((rawMessage) => {
      const message = JSON.parse(rawMessage.toString());
      if (message.type === "connection_init") {
        socket.send(JSON.stringify({ type: "connection_ack" }));
      } else if (message.type === "start" && message.id === "weather") {
        connection.weatherStarts += 1;
        socket.send(JSON.stringify(weatherFrame(state.now)));
      } else if (message.type === "start" && message.id === "wind") {
        connection.windStarts += 1;
        connection.subscribed = true;
        if (state.sendInitialWind) socket.send(JSON.stringify(windFrame(state.now)));
      }
    });
  });
  await page.goto(pathname);
  await page.clock.runFor(100);
  state.now = await page.evaluate(() => Date.now());
  const status = page.locator(pathname === "/loadingarea"
    ? ".loading-wind-status" : ".livecomponent");
  const sky = pathname === "/"
    ? page.locator(".sky-conditions")
    : page.getByRole("row").filter({ hasText: "Sky Condition:" });
  await expect(status).toContainText("LIVE");
  await expect(sky).toContainText("Clear Sky");
  // Count the one subscribed socket, not a discarded StrictMode attempt.
  state.sendInitialWind = false;
  const active = state.sockets.filter(({ subscribed, closed }) => subscribed && !closed);
  expect(active).toHaveLength(1);
  const connection = active[0];
  const connectionCount = state.sockets.length;

  const advance = async (milliseconds) => {
    state.now += milliseconds;
    await page.clock.runFor(milliseconds);
    state.now = await page.evaluate(() => Date.now());
  };
  const send = async (frame) => {
    connection.socket.send(JSON.stringify(frame));
    await advance(20);
  };
  const assertSameSocket = () => {
    expect(connection.closed).toBe(false);
    expect(state.sockets).toHaveLength(connectionCount);
    expect(state.forbiddenRequests).toEqual([]);
  };
  return { state, status, sky, connection, advance, send, assertSameSocket };
};

for (const pathname of ["/", "/loadingarea"]) {
  test(`${pathname} keeps fresh wind live through unknown cloud reports and same-socket recovery`, async ({ page }) => {
    const fixture = await startIsolatedWeather(page, pathname);
    const { state, status, sky, advance, send, assertSameSocket } = fixture;
    const firstWindTime = state.now;

    // Reproduce the observed upstream payload, then keep advancing wind for
    // longer than the 15-second deadline that would expose reconnect churn.
    for (const speed of [12, 13, 14, 15]) {
      await advance(5000);
      await send(weatherFrame(state.now, {
        skyCondition: [{ cloudCover: null, altitude: null }],
      }));
      await expect(sky).toContainText("Unknown");
      await expect(sky).not.toContainText("Clear Sky");
      await send(windFrame(state.now, speed));
      await expect(status).toContainText("LIVE");
      await expect(status).not.toContainText("BACKUP");
      assertSameSocket();
    }
    expect(state.now - firstWindTime).toBeGreaterThan(15000);
    await advance(1000);
    await send(weatherFrame(state.now));
    await expect(sky).toContainText("Clear Sky");
    await expect(sky).not.toContainText("Unknown");
    await expect(status).toContainText("LIVE");
    assertSameSocket();
  });
}

for (const [description, frame] of [
  ["GraphQL error", { id: "weather", type: "error", payload: [{ message: "Weather report missing" }] }],
  ["subscription completion", { id: "weather", type: "complete" }],
  ["GraphQL data errors", { id: "weather", type: "data", payload: {
    errors: [{ message: "Weather report missing" }], data: { weather: null },
  } }],
]) {
  test(`a weather-only ${description} does not drop live wind`, async ({ page }) => {
    const { state, status, sky, connection, advance, send, assertSameSocket } = await startIsolatedWeather(page, "/loadingarea");
    const weatherStarts = connection.weatherStarts;
    const windStarts = connection.windStarts;
    const terminal = frame.type === "error" || frame.type === "complete";
    await advance(1000);
    await send(frame);
    // Multiple terminal notifications must coalesce into one weather-only
    // retry, never restart the wind subscription or the shared transport.
    if (terminal) await send(frame);
    await expect(sky).toContainText("Unknown");
    await expect(sky).not.toContainText("Clear Sky");
    for (const speed of [12, 13, 14, 15]) {
      await advance(5000);
      await send(windFrame(state.now, speed));
      await expect(status).toContainText("LIVE");
      await expect(sky).toContainText(terminal ? "Clear Sky" : "Unknown");
      expect(connection.weatherStarts).toBe(weatherStarts + (terminal ? 1 : 0));
      expect(connection.windStarts).toBe(windStarts);
      assertSameSocket();
    }
    if (!terminal) {
      await send(weatherFrame(state.now));
      await expect(sky).toContainText("Clear Sky");
      expect(connection.weatherStarts).toBe(weatherStarts);
      assertSameSocket();
    }
  });
}

test("weather-only traffic cannot extend the live wind freshness deadline", async ({ page }) => {
  const { state, status, connection, advance, send } = await startIsolatedWeather(page, "/detailed");
  // Send healthy weather but deliberately no newer wind samples. The shared
  // socket must still expire and the UI must use labeled, unsafe-for-decisions
  // REST backup instead of allowing weather to keep wind marked live.
  for (let index = 0; index < 3; index += 1) {
    await advance(4500);
    await send(weatherFrame(state.now));
    await expect(status).toContainText("LIVE");
  }
  await advance(2500);
  await expect(status).toContainText("BACKUP WIND");
  await expect(status).not.toContainText("LIVE");
  await expect(page.getByText("WIND DATA INCOMPLETE — DO NOT USE FOR GO/NO-GO")).toBeVisible();
  await expect.poll(() => connection.closed).toBe(true);
  expect(state.forbiddenRequests).toEqual([]);
});
