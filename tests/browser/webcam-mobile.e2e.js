import { expect, test } from "@playwright/test";

const YARD_PLAYER_URL =
  "https://api.wetmet.net/widgets/stream/frame.php?uid=7795ed8bc355d24aee9b77b82884944a";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("webcamDirection", "yard");
  });

  await page.route("https://api.wetmet.net/**", (route) =>
    route.fulfill({
      body: "<!doctype html><html><body>Isolated Yard player</body></html>",
      contentType: "text/html",
      status: 200,
    })
  );
});

test("the Yard player is a responsive 16:9 embed with recovery controls", async ({
  page,
}, testInfo) => {
  await page.goto("/webcams");

  const iframe = page.getByTitle("CSC Yard webcam");
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("allow", /autoplay.*fullscreen/);
  await expect(iframe).toHaveAttribute("allowfullscreen", "");
  await expect(
    page.getByRole("button", { name: "Reload Yard camera" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Yard camera directly" })
  ).toHaveAttribute("href", YARD_PLAYER_URL);

  const box = await iframe.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(viewport.width);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.03);

  if (testInfo.project.name === "mobile-chromium") {
    expect(box.width).toBeGreaterThanOrEqual(viewport.width * 0.8);
  }
});
