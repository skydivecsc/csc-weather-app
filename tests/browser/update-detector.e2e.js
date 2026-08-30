import { expect, test } from "@playwright/test";

const REMOTE_BUILD_ID = "3333333333333333333333333333333333333333";
const REMOTE_APP_VERSION = "1.1.0";
const KIOSK_RELOAD_STORAGE_KEY = "cscwx:kiosk-reloaded-build";

const isolateUpdateChecks = async (
  page,
  getRemoteBuildId = () => REMOTE_BUILD_ID
) => {
  await page.routeWebSocket(
    "wss://api.skydivecsc.com/graphql",
    async (socket) => {
      await socket.close({ code: 1013, reason: "Browser test unavailable" });
    }
  );

  await page.route("**/version.json", (route) => {
    const buildId = getRemoteBuildId();

    if (!buildId) {
      return route.continue();
    }

    return route.fulfill({
      body: JSON.stringify({ version: REMOTE_APP_VERSION, buildId }),
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      status: 200,
    });
  });

  await page.route("https://login.cscwx2.com/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body = {};

    if (pathname.endsWith("/api/weather/gusts")) {
      body = [];
    } else if (pathname.endsWith("/api/jumpruns/")) {
      body = { jumpruns: [] };
    } else if (pathname.endsWith("/api/loads/")) {
      body = [];
    }

    return route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      status: 200,
    });
  });
};

test("an ordinary route presents an accessible update prompt", async ({
  page,
}) => {
  await isolateUpdateChecks(page);
  await page.goto("/");

  const prompt = page.getByRole("status");
  await expect(prompt).toContainText(
    "A newer CSC Weather version is available."
  );
  await expect(
    page.getByRole("button", { name: "Refresh now" })
  ).toBeVisible();
});

test("focus detects a release that appeared after startup", async ({ page }) => {
  let releaseAvailable = false;
  let versionRequests = 0;

  await isolateUpdateChecks(page, () => {
    versionRequests += 1;
    return releaseAvailable ? REMOTE_BUILD_ID : null;
  });
  await page.goto("/");
  await expect.poll(() => versionRequests).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  await expect(page.getByRole("status")).toHaveCount(0);

  releaseAvailable = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("status")).toContainText(
    "A newer CSC Weather version is available."
  );
});

test("the exact current build is visible on ordinary and kiosk routes", async ({
  page,
}) => {
  await isolateUpdateChecks(page, () => null);
  await page.goto("/");

  const manifest = await page.evaluate(() =>
    fetch("/version.json", { cache: "no-store" }).then((response) =>
      response.json()
    )
  );
  expect(manifest.version).toMatch(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  );
  expect(manifest.buildId).toMatch(/^[0-9a-f]{40}$/);

  for (const pathname of ["/", "/loadingarea"]) {
    if (page.url() !== new URL(pathname, page.url()).href) {
      await page.goto(pathname);
    }

    const versionLabel = page.locator(
      `[data-build-id="${manifest.buildId}"]`
    );
    await expect(versionLabel).toBeVisible();
    await expect(versionLabel).toHaveText(`Version ${manifest.version}`);
    await expect(versionLabel).toHaveAttribute(
      "data-app-version",
      manifest.version
    );
    await expect(versionLabel).toHaveAttribute(
      "title",
      `Version ${manifest.version}; exact build commit: ${manifest.buildId}`
    );
    await expect(page.getByText(/^Build [0-9a-f]{8}$/)).toHaveCount(0);
  }
});

test("the loading-area kiosk automatically reloads only once", async ({
  page,
}) => {
  await isolateUpdateChecks(page);
  let navigationCount = 0;

  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
    ) {
      navigationCount += 1;
    }
  });

  await page.goto("/loadingarea");

  await expect
    .poll(() =>
      page.evaluate((key) => sessionStorage.getItem(key), KIOSK_RELOAD_STORAGE_KEY)
    )
    .toBe(REMOTE_BUILD_ID);
  await expect.poll(() => navigationCount).toBe(2);

  await page.waitForTimeout(1000);
  expect(navigationCount).toBe(2);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "A newer CSC Weather version is available" })
  ).toBeVisible();
});
