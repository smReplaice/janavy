import path from "path";

import { expect, test } from "@playwright/test";

import { ROOT, getPrimaryTeamId, gotoApp } from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

test.describe("feature 10 — branding + settings", () => {
  test("/branding loads and saves a brand color", async ({ page, request }) => {
    const teamId = await getPrimaryTeamId(request);
    await gotoApp(page, "/branding");
    await expect(page).toHaveURL(/\/branding/, { timeout: 30_000 });

    // The brand color input (react-colorful HexColorInput, labeled
    // "Brand Color", prefixed — accepts hex without the #).
    const target = page
      .locator("div.space-y-3", {
        has: page.getByText("Brand Color", { exact: true }),
      })
      .locator("input")
      .first();
    await target.waitFor({ state: "visible", timeout: 30_000 });
    await target.click();
    await target.fill("");
    await target.pressSequentially("2f6fed", { delay: 20 });
    await page.waitForTimeout(600); // debounce

    await page.getByRole("button", { name: /save changes/i }).click();

    // The saved brand comes back from the branding API.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/teams/${teamId}/branding`);
          if (!res.ok()) return null;
          const brand = (await res.json()) as { brandColor?: string };
          return brand.brandColor ?? null;
        },
        { timeout: 20_000 },
      )
      .toContain("2f6fed");

    await page.screenshot({
      path: path.join(SHOT_DIR, "branding.png"),
      fullPage: true,
    });
  });

  test("settings pages load (general, people, domains, notifications)", async ({
    page,
  }) => {
    for (const route of [
      "/settings/general",
      "/settings/people",
      "/settings/domains",
      "/settings/notifications",
    ]) {
      const res = await page.request.get(route);
      expect(res.status(), `${route} should load`).toBeLessThan(400);
    }
    // Spot-check one renders real content.
    await page.goto("/settings/general");
    await expect(page.getByText(/manage your account|settings/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "settings-general.png"),
    });
  });

  test("removed settings pages are gone (billing, security)", async ({
    request,
  }) => {
    for (const route of ["/settings/billing", "/settings/security"]) {
      const res = await request.get(route);
      expect(res.status(), `${route} must be gone`).toBe(404);
    }
  });

  test("link settings screenshot on the document page", async ({ page }) => {
    // The link settings sheet on the core document.
    const state = await (await import("./helpers/janavy")).readRunState();
    if (state.sharingLinkId) {
      await page.goto(`/documents/${state.documentId}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({
        path: path.join(SHOT_DIR, "link-settings.png"),
        fullPage: true,
      });
    }
  });
});
