import { readFile } from "fs/promises";
import path from "path";

import { expect, test } from "@playwright/test";

import { ROOT, gotoApp } from "./helpers/janavy";

test.describe("feature 12 — security policies / audit logs (NOT IMPLEMENTED)", () => {
  test("feature flags are false by design", async () => {
    const source = await readFile(
      path.join(ROOT, "config", "features.ts"),
      "utf8",
    );
    expect(source).toContain("auditLogs: false");
    expect(source).toContain("documentRedaction: false");
    expect(source).toContain("documentConversions: false");
  });

  test("no broken UI references to removed security surfaces", async ({
    request,
    page,
  }) => {
    // Removed settings pages 404 instead of half-rendering.
    for (const route of ["/settings/security", "/settings/billing"]) {
      const res = await request.get(route);
      expect(res.status(), route).toBe(404);
    }

    // The settings header nav does not link them.
    await gotoApp(page, "/settings/general");
    const navText = await page.locator("header, nav").first().innerText();
    expect(navText).not.toContain("Security");
    expect(navText).not.toContain("Billing");

    // Redaction UI stays hidden on the document page.
    const state = await (
      await import("./helpers/janavy")
    ).readRunState();
    if (state.documentId) {
      await page.goto(`/documents/${state.documentId}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.toLowerCase()).not.toContain("redact");
    }
  });
});
