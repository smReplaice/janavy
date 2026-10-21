import { mkdir } from "fs/promises";
import path from "path";

import { expect, test } from "@playwright/test";

import { ROOT, gotoApp } from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

test.describe("feature 2 — dashboard + navigation", () => {
  test("dashboard renders with JANAVY branding and expected nav", async ({
    page,
  }) => {
    await gotoApp(page, "/dashboard");

    // Sidebar links
    await expect(
      page.getByRole("link", { name: "Dashboard", exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: "All Documents", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "All Datarooms", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Visitors", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Branding", exact: true }).first(),
    ).toBeVisible();

    // Removed features must NOT be linked anywhere in the sidebar.
    const sidebarText = await page
      .locator("[data-sidebar], aside, nav")
      .first()
      .innerText();
    expect(sidebarText).not.toContain("Workflows");
    expect(sidebarText.toLowerCase()).not.toContain("partners");
    expect(sidebarText).not.toContain("Billing");

    // JANAVY logo present in the sidebar header.
    await expect(
      page.locator('text=JANAVY').first(),
    ).toBeVisible();

    await mkdir(SHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SHOT_DIR, "dashboard.png"),
      fullPage: true,
    });
  });

  test("documents page loads with upload zone", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.locator("#upload-multi-files-zone")).toBeAttached({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "documents.png"),
      fullPage: true,
    });
  });

  test("removed feature routes 404", async ({ request }) => {
    for (const route of [
      "/workflows",
      "/settings/billing",
      "/settings/security",
      "/settings/upgrade",
    ]) {
      const res = await request.get(route);
      expect(res.status(), `${route} should 404 or redirect to an error`).toBe(
        404,
      );
    }
  });
});
