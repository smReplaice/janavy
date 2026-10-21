import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  gotoApp,
  settleForUpload,
  getDocuments,
  getPrimaryTeamId,
  updateRunState,
  waitForDocumentProcessed,
} from "./helpers/janavy";

const FIXTURES = path.join(ROOT, "tests", "e2e", "fixtures");

test.describe("feature 3 — document upload", () => {
  test("upload PDF via the documents page (core path)", async ({ page }) => {
    const teamId = await getPrimaryTeamId(page.request);
    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);

    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-3page.pdf"),
    ]);

    // The document appears in the list...
    const docLink = page.getByRole("link", { name: /qa-3page\.pdf/ }).first();
    await expect(docLink).toBeVisible({ timeout: 60_000 });

    // ...and the inline PDF→page-image conversion completes (self-hosted
    // in-process pipeline; TRIGGER_SECRET_KEY is not configured).
    const docs = await getDocuments(page.request, teamId);
    const doc = docs.find((d) => d.name === "qa-3page.pdf");
    expect(doc).toBeTruthy();
    await waitForDocumentProcessed(page.request, teamId, doc!.id, 180_000);
    await updateRunState({ documentId: doc!.id });
  });

  test("upload PNG image", async ({ page }) => {
    const teamId = await getPrimaryTeamId(page.request);
    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);
    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-image.png"),
    ]);
    await expect(
      page.getByRole("link", { name: /qa-image\.png/ }).first(),
    ).toBeVisible({ timeout: 60_000 });
    const docs = await getDocuments(page.request, teamId);
    expect(docs.some((d) => d.name === "qa-image.png")).toBeTruthy();
  });

  test("upload XLSX sheet (no conversion required)", async ({ page }) => {
    const teamId = await getPrimaryTeamId(page.request);
    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);
    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-sheet.xlsx"),
    ]);
    await expect(
      page.getByRole("link", { name: /qa-sheet\.xlsx/ }).first(),
    ).toBeVisible({ timeout: 60_000 });
    const docs = await getDocuments(page.request, teamId);
    expect(docs.some((d) => d.name === "qa-sheet.xlsx")).toBeTruthy();
  });

  // TXT is a docs-type document that requires conversion; with the
  // documentConversions flag off it must be rejected cleanly exactly like
  // DOCX/PPTX (reclassified from the original "should upload" expectation —
  // the honest behavior of this deployment).
  test("upload TXT document is rejected cleanly (documentConversions off)", async ({
    page,
  }) => {
    const teamId = await getPrimaryTeamId(page.request);
    const before = (await getDocuments(page.request, teamId)).length;
    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);
    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/teams/${teamId}/documents`) &&
        res.request().method() === "POST",
      { timeout: 90_000 },
    );
    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-notes.txt"),
    ]);
    const res = await createResponse;
    expect(res.status()).toBe(400);
    await page.waitForTimeout(1500);
    const after = (await getDocuments(page.request, teamId)).length;
    expect(after).toBe(before);
  });

  // NOT IMPLEMENTED by design: documentConversions flag is false. The upload
  // must fail cleanly (server rejects with a clear message; UI surfaces an
  // error; no half-created document).
  test("DOCX upload is rejected cleanly (documentConversions off)", async ({
    page,
  }) => {
    const teamId = await getPrimaryTeamId(page.request);
    const before = (await getDocuments(page.request, teamId)).length;

    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);
    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/teams/${teamId}/documents`) &&
        res.request().method() === "POST",
      { timeout: 90_000 },
    );
    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-document.docx"),
    ]);
    const res = await createResponse;
    expect(res.status()).toBe(400);
    // errorhandler replies with plain text (.end(err.message)) for 4xx
    const text = (await res.text().catch(() => "")).trim();
    expect(text).toContain("Office document conversion is not enabled");

    // No new document was created.
    await page.waitForTimeout(1500);
    const after = (await getDocuments(page.request, teamId)).length;
    expect(after).toBe(before);
  });

  test("PPTX upload is rejected cleanly (documentConversions off)", async ({
    page,
  }) => {
    const teamId = await getPrimaryTeamId(page.request);
    const before = (await getDocuments(page.request, teamId)).length;

    await gotoApp(page, "/documents");
    await page.locator("#upload-multi-files-zone").waitFor({ state: "attached" });
    await settleForUpload(page);
    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/teams/${teamId}/documents`) &&
        res.request().method() === "POST",
      { timeout: 90_000 },
    );
    await page.setInputFiles("#upload-multi-files-zone", [
      path.join(FIXTURES, "qa-slides.pptx"),
    ]);
    const res = await createResponse;
    expect(res.status()).toBe(400);
    const after = (await getDocuments(page.request, teamId)).length;
    expect(after).toBe(before);
  });
});
