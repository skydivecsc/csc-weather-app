import { expect, test } from "@playwright/test";

const API_ORIGIN = "https://login.cscwx2.com";
const WIND_SOCKET_URL = "wss://api.skydivecsc.com/graphql";
const aloftMap = (value) =>
  Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [
      `${(index + 1) * 1000}`,
      value,
    ])
  );

const routePublicApi = async (
  page,
  {
    historyAgeMs = 0,
    onGustRequest = () => {},
    onRequest = () => {},
  } = {}
) => {
  await page.route(`${API_ORIGIN}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const serverNow = Date.now();
    let body = {};

    onRequest(pathname);

    if (pathname.endsWith("/api/weather/gusts")) {
      onGustRequest();
      body = [
        {
          direction: "270",
          gust_speed: "14",
          id: 1,
          received_time: new Date(serverNow - historyAgeMs).toISOString(),
          unique_id: "browser-test-wind",
          wind_speed: "11",
        },
      ];
    } else if (pathname.endsWith("/api/weather/aloft")) {
      body = {
        direction: aloftMap(270),
        speed: aloftMap(10),
        temp: aloftMap(20),
        validtime: "18",
      };
    } else if (pathname.endsWith("/api/weather/astronomy")) {
      body = {
        results: {
          civil_twilight_end: new Date(serverNow + 3600000).toISOString(),
          sunrise: new Date(serverNow - 3600000).toISOString(),
          sunset: new Date(serverNow + 1800000).toISOString(),
        },
      };
    } else if (pathname.endsWith("/api/jumpruns/")) {
      body = { jumpruns: [] };
    } else if (pathname.endsWith("/api/loads/")) {
      body = [];
    }

    return route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-CSCWX-Server-Time",
        "Cache-Control": "no-store",
        "X-CSCWX-Server-Time": new Date(serverNow).toISOString(),
      },
      status: 200,
    });
  });
};

const blockWindSocket = (page, onConnection = () => {}) =>
  page.routeWebSocket(WIND_SOCKET_URL, async (socket) => {
    onConnection();
    await socket.close({ code: 1013, reason: "Browser test unavailable" });
  });

const routeWindSocket = (
  page,
  { onConnection = () => {}, shouldSendWind = () => true } = {}
) =>
  page.routeWebSocket(WIND_SOCKET_URL, (socket) => {
    onConnection();
    socket.onMessage((rawMessage) => {
      let message;

      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        return;
      }

      if (message.type === "connection_init") {
        socket.send(JSON.stringify({ type: "connection_ack" }));
        return;
      }

      if (
        message.type === "start" &&
        message.id === "wind" &&
        shouldSendWind()
      ) {
        socket.send(
          JSON.stringify({
            id: "wind",
            payload: {
              data: {
                wind: {
                  direction: 280,
                  gustSpeed: 13,
                  receivedAt: new Date().toISOString(),
                  speed: 10,
                  variableDirection: null,
                },
              },
            },
            type: "data",
          })
        );
      }
    });
  });

test("a blocked WebSocket uses fresh history, then visibly expires it", async ({
  page,
}) => {
  await routePublicApi(page, { historyAgeMs: 88000 });
  await blockWindSocket(page);
  await page.goto("/");

  const status = page.locator(".livecomponent");
  await expect(status).toContainText("BACKUP WIND");
  await expect(status).toContainText("WIND DATA STALE", { timeout: 5000 });
});

test("offline to online reconnects and restores live wind", async ({
  context,
  page,
}) => {
  let allowLiveWind = false;

  await routePublicApi(page);
  await routeWindSocket(page, {
    shouldSendWind: () => allowLiveWind,
  });
  await page.goto("/");

  const status = page.locator(".livecomponent");
  await expect(status).toContainText("BACKUP WIND");

  await context.setOffline(true);
  await expect(status).toContainText("OFFLINE");

  allowLiveWind = true;
  await context.setOffline(false);
  await expect(status).toContainText("LIVE");
});

test("returning to a visible tab refreshes every REST poller and the socket", async ({
  page,
}) => {
  let gustRequests = 0;
  let socketConnections = 0;
  const restRequests = new Map();

  await routePublicApi(page, {
    onGustRequest: () => {
      gustRequests += 1;
    },
    onRequest: (pathname) => {
      restRequests.set(pathname, (restRequests.get(pathname) || 0) + 1);
    },
  });
  await routeWindSocket(page, {
    onConnection: () => {
      socketConnections += 1;
    },
    shouldSendWind: () => false,
  });
  await page.goto("/");
  await expect.poll(() => gustRequests).toBeGreaterThan(0);
  await expect.poll(() => socketConnections).toBeGreaterThan(0);
  for (const pathname of [
    "/api/weather/gusts",
    "/api/weather/aloft",
    "/api/weather/astronomy",
    "/api/jumpruns/",
  ]) {
    await expect.poll(() => restRequests.get(pathname) || 0).toBeGreaterThan(0);
  }
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenGustRequests = gustRequests;
  const hiddenSocketConnections = socketConnections;
  const hiddenRestRequests = new Map(restRequests);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => gustRequests).toBeGreaterThan(hiddenGustRequests);
  for (const pathname of [
    "/api/weather/gusts",
    "/api/weather/aloft",
    "/api/weather/astronomy",
    "/api/jumpruns/",
  ]) {
    await expect
      .poll(() => restRequests.get(pathname) || 0)
      .toBeGreaterThan(hiddenRestRequests.get(pathname) || 0);
  }
  await expect
    .poll(() => socketConnections)
    .toBeGreaterThan(hiddenSocketConnections);
});

test("a persisted pageshow event performs BFCache-style recovery", async ({
  page,
}) => {
  let gustRequests = 0;
  let socketConnections = 0;

  await routePublicApi(page, {
    onGustRequest: () => {
      gustRequests += 1;
    },
  });
  await routeWindSocket(page, {
    onConnection: () => {
      socketConnections += 1;
    },
    shouldSendWind: () => false,
  });
  await page.goto("/");
  await expect.poll(() => gustRequests).toBeGreaterThan(0);
  await expect.poll(() => socketConnections).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  const beforeGustRequests = gustRequests;
  const beforeSocketConnections = socketConnections;

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });

  await expect.poll(() => gustRequests).toBeGreaterThan(beforeGustRequests);
  await expect
    .poll(() => socketConnections)
    .toBeGreaterThan(beforeSocketConnections);
});
