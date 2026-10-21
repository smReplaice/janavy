import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  gotoApp,
  createLink,
  getPrimaryTeamId,
  qaEmail,
  readRunState,
} from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

// Runs in the "mobile" project (iPhone X — 375 x 812).
test.describe("feature 15 — responsive (375x812)", () => {
  test("viewer renders at mobile width", async ({ page, request, browser }) => {
    const teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    const documentId = state.documentId!;
    expect(documentId).toBeTruthy();

    const link = await createLink(request, { teamId, documentId });
    const recipient = qaEmail("mobile");

    // A fresh recipient context at mobile viewport (the default context of
    // this project already is 375x812, but it carries the owner session —
    // use a clean one for the recipient).
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.201" },
    });
    const mobile = await context.newPage();
    await mobile.goto(`/view/${link.id}`);
    await mobile.getByLabel(/email address/i).fill(recipient);
    await mobile.getByRole("button", { name: /continue/i }).click();
    await expect(
      mobile.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    // No horizontal overflow.
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
    await mobile.screenshot({
      path: path.join(SHOT_DIR, "responsive-viewer.png"),
      fullPage: false,
    });
    await context.close();
  });

  test("dashboard renders at mobile width", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
    await page.screenshot({
      path: path.join(SHOT_DIR, "responsive-dashboard.png"),
      fullPage: false,
    });
  });
});
