import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  gotoApp,
  getPrimaryTeamId,
  readRunState,
  updateRunState,
  waitForDocumentProcessed,
} from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

test.describe("feature 4 — document preview (dashboard viewer)", () => {
  test("open processed PDF in the dashboard preview; pages render", async ({
    page,
  }) => {
    const teamId = await getPrimaryTeamId(page.request);
    const state = await readRunState();
    let documentId = state.documentId;

    // Defensive: if the upload spec did not run, fail with a clear cause.
    expect(documentId, "core PDF document from upload spec").toBeTruthy();
    await waitForDocumentProcessed(page.request, teamId, documentId!, 180_000);

    await gotoApp(page, `/documents/${documentId}`);
    // The preview (eye) button appears once the version has page images.
    const previewButton = page
      .locator('button:has(svg.lucide-eye), button[aria-label*="review" i]')
      .first();
    await expect(previewButton).toBeVisible({ timeout: 60_000 });
    await previewButton.click();

    // The preview modal renders page images served from storage.
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(
      modal.locator("img").first(),
    ).toBeVisible({ timeout: 60_000 });

    await page.screenshot({
      path: path.join(SHOT_DIR, "viewer.png"),
    });
  });

  test("document page shows links table with JANAVY chrome", async ({
    page,
  }) => {
    const state = await readRunState();
    const documentId = state.documentId!;
    expect(documentId).toBeTruthy();

    await gotoApp(page, `/documents/${documentId}`);
    // Links section header / add-link button exist.
    await expect(
      page.getByText(/manage links|links/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(SHOT_DIR, "document-page.png"),
      fullPage: true,
    });
    await updateRunState({ documentId });
  });
});
