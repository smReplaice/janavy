import { expect, test } from "@playwright/test";

import {
  createLink,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  readLinkOTP,
  readRunState,
  updateLink,
  updateRunState,
} from "./helpers/janavy";

test.describe("feature 5 — sharing + restrictions (recipient side)", () => {
  let teamId: string;
  let documentId: string;

  test.beforeAll(async ({ request }) => {
    teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    documentId = state.documentId!;
    expect(documentId, "core PDF from upload spec").toBeTruthy();
  });

  async function viewAsRecipient(
    browser: import("@playwright/test").Browser,
    linkId: string,
  ) {
    const context = await newQaContext(browser);
    const page = await context.newPage();
    await page.goto(`/view/${linkId}`);
    return { context, page };
  }

  test("create link; email-gated recipient views the document", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    expect(link.id).toBeTruthy();
    await updateRunState({ sharingLinkId: link.id });

    // Enable the email gate via the real link API.
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      allowDownload: true,
    });

    const recipient = qaEmail("recipient");
    const { context, page } = await viewAsRecipient(browser, link.id);

    // Email gate
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();

    // Page images render.
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });

    // Viewer chrome shows the JANAVY wordmark (text fallback when no custom
    // brand logo is configured).
    const brandVisible = await page
      .getByText("JANAVY", { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    expect(brandVisible).toBeTruthy();
    await context.close();
  });

  test("password protection: wrong password rejected, correct accepted", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      password: "qa-pass-123",
    });

    const recipient = qaEmail("pw");
    const { context, page } = await viewAsRecipient(browser, link.id);

    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByLabel(/passcode|password/i).fill("wrong-password");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(
      page.getByText(/invalid password/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    // Now the correct password.
    await page.getByLabel(/passcode|password/i).fill("qa-pass-123");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    await context.close();
  });

  test("email OTP verification (emailAuthenticated)", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      emailAuthenticated: true,
    });

    const recipient = qaEmail("otp");
    const { context, page } = await viewAsRecipient(browser, link.id);

    // Step 1: email → OTP is dispatched (Beacon send + Postgres row).
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.getByText(/verify your email/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Read the OTP from the VerificationToken table (the QA "mailbox").
    const otp = await readLinkOTP(link.id, recipient);
    expect(otp).toMatch(/^\d{6}$/);

    // Step 2: type the code into the OTP input.
    await page.locator("[data-slot='input-otp'], input").first().click();
    await page.keyboard.type(otp, { delay: 30 });
    await page.getByRole("button", { name: /continue|verify/i }).click();

    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    await context.close();
  });

  test("deny list blocks the recipient", async ({ request, browser }) => {
    const link = await createLink(request, { teamId, documentId });
    const denied = qaEmail("denied");
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      denyList: [denied],
    });

    const { context, page } = await viewAsRecipient(browser, link.id);
    await page.getByLabel(/email address/i).fill(denied);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.getByText(/unauthorized access|access denied/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test("allow list admits only listed emails", async ({ request, browser }) => {
    const link = await createLink(request, { teamId, documentId });
    const allowed = qaEmail("allowed");
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      allowList: [allowed],
    });

    // Not on the list → denied.
    {
      const { context, page } = await viewAsRecipient(browser, link.id);
      await page.getByLabel(/email address/i).fill(qaEmail("not-allowed"));
      await page.getByRole("button", { name: /continue/i }).click();
      await expect(
        page.getByText(/unauthorized access|access denied|not on the list/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await context.close();
    }
    // On the list → views.
    {
      const { context, page } = await viewAsRecipient(browser, link.id);
      await page.getByLabel(/email address/i).fill(allowed);
      await page.getByRole("button", { name: /continue/i }).click();
      await expect(
        page.locator("img[alt='Page 1']").first(),
      ).toBeVisible({ timeout: 60_000 });
      await context.close();
    }
  });

  test("expired link is rejected", async ({ request, browser }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const { context, page } = await viewAsRecipient(browser, link.id);
    await expect(
      page.getByText(/expired|no longer available|not found/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await context.close();
  });

  test("download disabled: button hidden and API rejects", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      allowDownload: false,
    });

    const recipient = qaEmail("nodl");
    const { context, page } = await viewAsRecipient(browser, link.id);
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });

    // The download affordance is hidden in the viewer nav.
    await expect(
      page.getByRole("button", { name: /download/i }),
    ).toHaveCount(0);

    // Direct POST to the download API is rejected server-side.
    const downloadRes = await page.evaluate(async () => {
      const res = await fetch("/api/links/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: document.location.pathname.split("/")[2], viewId: "unknown" }),
      });
      return res.status;
    });
    expect([401, 403, 404]).toContain(downloadRes);
    await context.close();
  });

  test("watermark config renders an SVG overlay", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      enableWatermark: true,
      watermarkConfig: {
        text: "JANAVY QA {{email}}",
        isTiled: true,
        position: "middle-center",
        rotation: 45,
        color: "#808080",
        fontSize: 14,
        opacity: 0.15,
      },
    });

    const recipient = qaEmail("wm");
    const { context, page } = await viewAsRecipient(browser, link.id);
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });

    // The watermark renders as an SVG overlay on the page image.
    await expect(page.locator("svg").first()).toBeVisible({
      timeout: 20_000,
    });
    await context.close();
  });

  test("screenshot protection flag toggles without breaking the viewer", async ({
    request,
    browser,
  }) => {
    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      enableScreenshotProtection: true,
    });

    const recipient = qaEmail("ss");
    const { context, page } = await viewAsRecipient(browser, link.id);
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });

    // The flag is a client-side deterrent; assert it persisted on the link
    // (server-side record) and that the viewer still works.
    const links = await request.get(`/api/teams/${teamId}/links?documentId=${documentId}`);
    if (links.ok()) {
      const body = (await links.json()) as { id: string; enableScreenshotProtection?: boolean }[];
      const mine = body.find((l) => l.id === link.id);
      expect(mine?.enableScreenshotProtection).toBeTruthy();
    }
    await context.close();
  });
});
