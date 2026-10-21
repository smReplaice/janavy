import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  createLink,
  getPrimaryTeamId,
  getSessionUser,
  gotoApp,
  newQaContext,
  qaEmail,
  readLinkOTP,
  signinViaEmail,
  uploadDocumentViaApi,
  updateLink,
} from "./helpers/janavy";

const execFileAsync = promisify(execFile);

/**
 * Feature 16 — Native electronic signature (single signer, MVP).
 *
 * Owner configures signing on a link (methods + placed fields, persisted via
 * the EXISTING link APIs); recipient passes the email gate + the EXISTING OTP
 * verification, fills the signature field (TYPE method) in the protected
 * page-image viewer, accepts the consent and Signs & Completes. The server
 * embeds the signature into the PDF server-side (pdf-lib), stores it in
 * private S3, records SignatureRecord + audit events, notifies the owner via
 * Beacon, and the owner can fetch the audit certificate + signed PDF. The
 * recipient NEVER receives original or signed PDF bytes.
 * No mocks.
 */

const FIELD_CONFIG = {
  methods: ["DRAW", "TYPE", "UPLOAD"],
  fields: [
    {
      fieldId: "qa_sig_1",
      type: "SIGNATURE",
      pageNumber: 1,
      x: 0.1,
      y: 0.7,
      width: 0.35,
      height: 0.1,
      required: true,
    },
    {
      fieldId: "qa_company_1",
      type: "COMPANY",
      pageNumber: 1,
      x: 0.55,
      y: 0.72,
      width: 0.3,
      height: 0.06,
      required: true,
    },
  ],
};

/** 1x1 transparent PNG data URL for API-level signing probes. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SIGN_PAYLOAD = (linkId: string, viewId: string, company: string) => ({
  linkId,
  viewId,
  consent: true,
  method: "TYPE",
  fields: [
    { fieldId: "qa_sig_1", dataUrl: TINY_PNG },
    { fieldId: "qa_company_1", value: company },
  ],
});

async function countBeaconLines(marker: string): Promise<number> {
  try {
    // -F: fixed-string match — the marker contains regex character classes
    // ("[beacon]") that would otherwise never match the literal log text.
    const { stdout } = await execFileAsync("grep", [
      "-c",
      "-F",
      marker,
      "/tmp/janavy-dev.log",
    ]);
    return parseInt(stdout.trim() || "0", 10);
  } catch {
    // grep exits 1 when there are zero matches.
    return 0;
  }
}

/**
 * Shared fixture. Playwright may restart the worker after a failed test,
 * which resets module state — every test calls this first and it rebuilds the
 * owner + document + signing link via the real APIs when needed.
 */
let ownerContext: BrowserContext | null = null;
let ownerPage: Page;
let teamId: string;
let documentId: string;
let linkId: string;

async function ensureFixture(browser: Browser) {
  if (linkId && ownerContext) return;

  ownerContext = await newQaContext(browser);
  ownerPage = await ownerContext.newPage();
  const email = qaEmail("sign");
  await signinViaEmail(ownerPage, email, { register: true });
  teamId = await getPrimaryTeamId(ownerPage.request);
  const user = await getSessionUser(ownerPage);

  const doc = await uploadDocumentViaApi(ownerPage.request, {
    filePath: path.join(__dirname, "fixtures", "qa-3page.pdf"),
    name: `qa-signature-${Date.now()}.pdf`,
    contentType: "application/pdf",
    teamId,
    ownerId: user.id,
    numPages: 3,
    type: "pdf",
  });
  documentId = doc.id;

  const link = await createLink(ownerPage.request, {
    teamId,
    documentId,
    emailProtected: true,
  });
  linkId = link.id;

  await updateLink(ownerPage.request, {
    teamId,
    linkId,
    requireSignature: true,
    signatureFieldConfiguration: FIELD_CONFIG,
    signatureConsentRequired: true,
  });
}

/** Recipient: email gate + EXISTING OTP → viewer + signature layer. */
async function openSignerView(
  browser: Browser,
  tag: string,
): Promise<{ context: BrowserContext; page: Page; viewId: string; recipient: string }> {
  const context = await newQaContext(browser);
  const page = await context.newPage();

  let viewId: string | undefined;
  page.on("response", async (res) => {
    if (
      res.url().endsWith("/api/views") &&
      res.request().method() === "POST" &&
      res.ok()
    ) {
      const body = (await res.json().catch(() => null)) as {
        viewId?: string;
      } | null;
      if (body?.viewId) viewId = body.viewId;
    }
  });

  const recipient = qaEmail(tag);
  await page.goto(`/view/${linkId}`);
  await page.getByLabel(/email address/i).fill(recipient);
  await page.getByRole("button", { name: /continue/i }).click();

  // EXISTING OTP machinery (emailAuthenticated is forced on server-side).
  await expect(
    page.getByText(/verify your email/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  const otp = await readLinkOTP(linkId, recipient);
  expect(otp).toMatch(/^\d{6}$/);
  await page.locator("[data-slot='input-otp'], input").first().click();
  await page.keyboard.type(otp, { delay: 30 });
  await page.getByRole("button", { name: /continue|verify/i }).click();

  await expect(page.locator("img[alt='Page 1']").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.locator("[data-signature-field='qa_sig_1']"),
  ).toBeVisible({ timeout: 30_000 });

  const deadline = Date.now() + 15_000;
  while (!viewId && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }
  expect(viewId, "viewId captured from /api/views").toBeTruthy();
  return { context, page, viewId: viewId!, recipient };
}

/** API-level sign through the recipient's own session (fast path). */
async function signViaApi(
  browser: Browser,
  tag: string,
  company: string,
): Promise<{ status: number; recipient: string }> {
  const { context, page, viewId, recipient } = await openSignerView(
    browser,
    tag,
  );
  const status = await page.evaluate(
    (payload) =>
      fetch("/api/views/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => res.status),
    SIGN_PAYLOAD(linkId, viewId, company),
  );
  await context.close();
  return { status, recipient };
}

/** Wait for a recipient's COMPLETED record via the owner API. */
async function waitForCompletedRecord(recipient: string): Promise<any> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/signatures`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { signatures: any[] };
    const record = body.signatures.find(
      (r: any) => r.viewerEmail === recipient.toLowerCase(),
    );
    if (record?.status === "COMPLETED") return record;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no COMPLETED record for ${recipient}`);
}

test.describe("feature 16 — native electronic signature (single-signer MVP)", () => {
  test.afterAll(async () => {
    await ownerContext?.close().catch(() => {});
  });

  test("owner link sheet shows the Require Electronic Signature toggle; API enables signing with placed fields", async ({
    browser,
  }) => {
    await ensureFixture(browser);

    // UI check: the toggle renders in the link sheet (create flow), directly
    // below the NDA agreement section, with the exact tooltip.
    await gotoApp(ownerPage, `/documents/${documentId}`);
    // The links list re-renders when SWR settles (empty state → rows), which
    // can detach the button mid-click; the button is "Create link to share"
    // before any link exists and "Create Link" afterwards. Retry until the
    // sheet actually shows the toggle.
    const openLinkSheet = ownerPage.getByRole("button", {
      name: /^create link/i,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await openLinkSheet.first().click({ timeout: 15_000 });
        const visible = await ownerPage
          .getByText("Require Electronic Signature")
          .first()
          .isVisible({ timeout: 10_000 })
          .catch(() => false);
        if (visible) break;
      } catch {
        // retry
      }
      await ownerPage.waitForTimeout(1_000);
    }
    await expect(
      ownerPage.getByText("Require Electronic Signature").first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await ownerPage
        .getByText("Require Electronic Signature")
        .first()
        .isVisible(),
    ).toBeTruthy();

    // Enabling reveals the signing configuration: methods + locked email
    // verification + consent toggle + the field-configuration entry point.
    await ownerPage
      .getByRole("heading", {
        name: "Require Electronic Signature",
        exact: true,
      })
      .click();
    await expect(ownerPage.getByText("Signing Method:").first()).toBeVisible();
    await expect(ownerPage.getByText("Draw signature")).toBeVisible();
    await expect(ownerPage.getByText("Type signature")).toBeVisible();
    await expect(ownerPage.getByText("Upload signature")).toBeVisible();
    await expect(
      ownerPage.getByText("Require Email Verification").first(),
    ).toBeVisible();
    await expect(
      ownerPage.getByText("Require Signing Consent").first(),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: /configure signature fields/i }),
    ).toBeVisible();
    await ownerPage.screenshot({
      path: path.join(
        __dirname,
        "..",
        "..",
        "docs",
        "testing",
        "screenshots",
        "signature-link-sheet.png",
      ),
    });
    await ownerPage.keyboard.press("Escape");

    // The saved link carries the config and forces email verification on.
    const linksRes = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/links`,
    );
    const links = (await linksRes.json()) as {
      id: string;
      requireSignature: boolean;
      emailProtected: boolean;
      emailAuthenticated: boolean;
      signatureConsentRequired: boolean;
      signatureFieldConfiguration: { fields: unknown[] } | null;
    }[];
    const mine = links.find((l) => l.id === linkId)!;
    expect(mine.requireSignature).toBe(true);
    expect(mine.emailProtected).toBe(true);
    expect(mine.emailAuthenticated).toBe(true); // forced on server-side
    expect(mine.signatureConsentRequired).toBe(true);
    expect(mine.signatureFieldConfiguration?.fields).toHaveLength(2);
  });

  test("recipient signs via TYPE method + consent → record COMPLETED with hash; owner notified", async ({
    browser,
  }) => {
    await ensureFixture(browser);
    const before = await countBeaconLines("[beacon] request");

    const { context, page, recipient } = await openSignerView(
      browser,
      "signer",
    );

    // Unsigned required field blocks submit (client-side): with the company
    // field empty and consent unchecked, Sign & Complete stays disabled.
    const submit = page.getByRole("button", { name: /sign & complete/i });
    await expect(submit).toBeDisabled();

    // Open the SIGNATURE field → capture modal → switch to the Type tab.
    await page.locator("[data-signature-field='qa_sig_1']").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByText(/adopt your signature/i)).toBeVisible();
    await modal.getByRole("button", { name: "Type", exact: true }).click();
    await modal.getByLabel(/your name/i).fill("Amara Okafor");
    await page.screenshot({
      path: path.join(
        __dirname,
        "..",
        "..",
        "docs",
        "testing",
        "screenshots",
        "signature-capture-modal.png",
      ),
    });
    await modal.getByRole("button", { name: /use this signature/i }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // Fill the required COMPANY text field.
    await page
      .locator("[data-signature-field='qa_company_1'] input")
      .fill("Globex Industries");

    // Consent checkbox (exact copy) enables submit.
    await page
      .getByText(
        "I agree to use an electronic signature and intend to sign this document electronically.",
      )
      .click();
    await expect(submit).toBeEnabled();

    await page.screenshot({
      path: path.join(
        __dirname,
        "..",
        "..",
        "docs",
        "testing",
        "screenshots",
        "signature-signer-view.png",
      ),
    });
    await submit.click();

    // Signed confirmation screen (Janavy branding).
    await expect(page.getByText("Document signed")).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({
      path: path.join(
        __dirname,
        "..",
        "..",
        "docs",
        "testing",
        "screenshots",
        "signature-confirmation.png",
      ),
    });
    await page.getByRole("button", { name: /continue viewing/i }).click();

    // After completion the signature layer is gone (protected viewer remains).
    await expect(
      page.locator("[data-signature-field='qa_sig_1']"),
    ).toHaveCount(0);
    await expect(page.locator("img[alt='Page 1']").first()).toBeVisible();
    await context.close();

    // SignatureRecord COMPLETED with hashes (owner API).
    const record = await waitForCompletedRecord(recipient);
    expect(record.status).toBe("COMPLETED");
    expect(record.method).toBe("TYPE");
    expect(record.signedAt).toBeTruthy();
    expect(record.signedFileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.originalFileHash).toMatch(/^[a-f0-9]{64}$/);

    // Owner notified + signer confirmation (Beacon marker in the dev log).
    await expect
      .poll(async () => countBeaconLines("[beacon] request"), {
        timeout: 30_000,
      })
      .toBeGreaterThan(before);
  });

  test("duplicate sign rejected (idempotent completion); repeat visit hides the layer", async ({
    browser,
  }) => {
    await ensureFixture(browser);

    // Same recipient, same session: first sign succeeds, second is rejected.
    const { context, page, viewId, recipient } = await openSignerView(
      browser,
      "signer-dup",
    );
    const signOnce = () =>
      page.evaluate(
        (payload) =>
          fetch("/api/views/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }).then((res) => res.status),
        SIGN_PAYLOAD(linkId, viewId, "Duplicate Co"),
      );
    expect(await signOnce()).toBe(200);
    expect(await signOnce()).toBe(409);

    // On a return visit (same recipient browser — the returning-signer path)
    // no signature layer renders anymore: the page loads straight into the
    // protected viewer with the signature config marked signed.
    const revisitPage = await context.newPage();
    let signedFlag: boolean | undefined;
    revisitPage.on("response", async (res) => {
      if (
        res.url().endsWith("/api/views") &&
        res.request().method() === "POST" &&
        res.ok()
      ) {
        const body = (await res.json().catch(() => null)) as {
          signature?: { signed?: boolean };
        } | null;
        if (body?.signature) signedFlag = body.signature.signed;
      }
    });
    await revisitPage.goto(`/view/${linkId}`);
    await expect(revisitPage.locator("img[alt='Page 1']").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      revisitPage.locator("[data-signature-field='qa_sig_1']"),
    ).toHaveCount(0);
    expect(signedFlag).toBe(true);
    await revisitPage.close();
    await context.close();
  });

  test("audit certificate endpoint returns a PDF; owner fetches the signed PDF", async ({
    browser,
  }) => {
    await ensureFixture(browser);

    // Produce a completed record through the recipient's own session.
    const { status, recipient } = await signViaApi(
      browser,
      "signer-cert",
      "Certificate Co",
    );
    expect(status).toBe(200);
    const record = await waitForCompletedRecord(recipient);

    const certificateRes = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/signatures/${record.id}/certificate`,
    );
    expect(certificateRes.ok()).toBeTruthy();
    expect(certificateRes.headers()["content-type"]).toContain(
      "application/pdf",
    );
    const certificateBuffer = await certificateRes.body();
    expect(certificateBuffer!.byteLength).toBeGreaterThan(1000);
    expect(certificateBuffer!.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const downloadRes = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/signatures/${record.id}/download`,
    );
    expect(downloadRes.ok()).toBeTruthy();
    const { downloadUrl } = (await downloadRes.json()) as {
      downloadUrl: string;
    };
    expect(downloadUrl).toBeTruthy();

    // The signed PDF is a real PDF stored in private S3.
    const signedFetch = await ownerPage.request.get(downloadUrl);
    expect(signedFetch.ok()).toBeTruthy();
    const signedBuffer = await signedFetch.body();
    expect(signedBuffer!.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(signedBuffer!.byteLength).toBeGreaterThan(1000);
  });

  test("download remains blocked for the recipient while the owner can fetch the signed copy", async ({
    browser,
  }) => {
    await ensureFixture(browser);

    const { context, page, viewId } = await openSignerView(
      browser,
      "signer-nodl",
    );
    const signStatus = await page.evaluate(
      (payload) =>
        fetch("/api/views/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((res) => res.status),
      SIGN_PAYLOAD(linkId, viewId, "No Download Co"),
    );
    expect(signStatus).toBe(200);

    // The recipient's own download attempt (original bytes) is blocked —
    // allowDownload was never enabled on the signing link.
    const downloadStatus = await page.evaluate(
      ({ linkId, viewId }) =>
        fetch("/api/links/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId, viewId }),
        }).then((res) => res.status),
      { linkId, viewId },
    );
    expect([403, 404]).toContain(downloadStatus);
    await context.close();

    // The owner's signature list shows this record completed as well.
    const res = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/signatures`,
    );
    const body = (await res.json()) as { signatures: any[] };
    expect(
      body.signatures.filter((r: any) => r.status === "COMPLETED").length,
    ).toBeGreaterThanOrEqual(1);
  });
});
