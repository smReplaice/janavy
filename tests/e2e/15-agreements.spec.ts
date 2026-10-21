import path from "path";

import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  createLink,
  getDocument,
  getPrimaryTeamId,
  getSessionUser,
  newQaContext,
  qaEmail,
  readLinkOTP,
  signinViaEmail,
  uploadDocumentViaApi,
} from "./helpers/janavy";

/**
 * Feature 15 — Agreements.
 *
 * Agreement = an ordinary document categorized with agreement metadata
 * (agreementType + sharing-status lifecycle). Verified end-to-end with the
 * real infrastructure: onboarding UI (fresh QA signup), tus upload + document
 * API, confidential link defaults, recipient email+OTP gate, status
 * transitions, archive revocation and the server-side download block.
 * No mocks.
 */

const AGREEMENT_OPTION_LABELS = [
  "Non-Disclosure Agreement (NDA)",
  "Master Services Agreement (MSA)",
  "Statement of Work (SOW)",
  "Service Level Agreement (SLA)",
  "Partnership Agreement",
  "Vendor / Supplier Agreement",
  "Employment Agreement",
  "Other Agreement",
];

test.describe("feature 15 — agreements (categorization, confidential defaults, sharing statuses)", () => {
  // Dedicated QA user (fresh signup) so the onboarding surfaces are pristine
  // for the /welcome assertions; its session is then reused for the API flows.
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let teamId: string;
  let ownerId: string;

  let agreementDocId: string;
  let agreementLinkId: string;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await newQaContext(browser);
    ownerPage = await ownerContext.newPage();
    const email = qaEmail("agree");
    await signinViaEmail(ownerPage, email, { register: true });
    teamId = await getPrimaryTeamId(ownerPage.request);
    const user = await getSessionUser(ownerPage);
    ownerId = user.id;
  });

  test.afterAll(async () => {
    await ownerContext.close().catch(() => {});
  });

  test("onboarding: 'What would you like to share securely?' with the Agreement option (Pitchdeck replaced)", async () => {
    await ownerPage.goto("/welcome?type=select");

    await expect(
      ownerPage.getByRole("heading", {
        name: "What would you like to share securely?",
      }),
    ).toBeVisible();

    // Agreement replaced Pitchdeck; the other options stay intact.
    await expect(
      ownerPage.getByRole("button", { name: /^Agreement$/ }),
    ).toBeVisible();
    await expect(ownerPage.getByText("Pitchdeck")).toHaveCount(0);
    await expect(
      ownerPage.getByRole("button", { name: "Sales document" }),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: "Notion Page" }),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: "Another document" }),
    ).toBeVisible();
  });

  test("onboarding: Agreement shows the 8 agreement types + Skip categorisation, then proceeds to upload", async () => {
    await ownerPage.goto("/welcome?type=select");
    await ownerPage.getByRole("button", { name: /^Agreement$/ }).click();

    // Secondary step: all 8 types plus the skip option.
    for (const label of AGREEMENT_OPTION_LABELS) {
      await expect(
        ownerPage.getByRole("button", { name: label }),
      ).toBeVisible();
    }
    await expect(
      ownerPage.getByRole("button", { name: "Skip categorisation" }),
    ).toBeVisible();

    // Selecting a type proceeds to the existing upload step, carrying the
    // choice in the onboarding query state (same mechanism as the other
    // categories' ?type= routing).
    await ownerPage
      .getByRole("button", { name: "Non-Disclosure Agreement (NDA)" })
      .click();
    await ownerPage.waitForURL(/\/welcome\?type=agreement&agreementType=NDA/);
    await expect(
      ownerPage.getByRole("heading", { name: /upload your agreement/i }),
    ).toBeVisible();

    // Skipping categorisation also proceeds to the upload step (no type).
    await ownerPage.goto("/welcome?type=select");
    await ownerPage.getByRole("button", { name: /^Agreement$/ }).click();
    await ownerPage.getByRole("button", { name: "Skip categorisation" }).click();
    await ownerPage.waitForURL(/\/welcome\?type=agreement$/);
    await expect(
      ownerPage.getByRole("heading", { name: /upload your agreement/i }),
    ).toBeVisible();
  });

  test("API: upload a PDF with agreementType NDA → document shows NDA + status DRAFT", async () => {
    const doc = await uploadDocumentViaApi(ownerPage.request, {
      filePath: path.join(__dirname, "fixtures", "qa-3page.pdf"),
      name: `qa-agreement-nda-${Date.now()}.pdf`,
      contentType: "application/pdf",
      teamId,
      ownerId,
      numPages: 3,
      type: "pdf",
      agreementType: "NDA",
    });
    expect(doc.id).toBeTruthy();
    agreementDocId = doc.id;

    const fetched = await getDocument(ownerPage.request, teamId, doc.id);
    expect(fetched?.agreementType).toBe("NDA");
    expect(fetched?.agreementStatus).toBe("DRAFT");

    // Same GET route: agreement category filter + name/agreementType search.
    const byFilter = await ownerPage.request.get(
      `/api/teams/${teamId}/documents?agreementType=NDA`,
    );
    expect(byFilter.ok()).toBeTruthy();
    const filterBody = (await byFilter.json()) as { documents: { id: string }[] };
    expect(
      filterBody.documents.map((d) => d.id)).toContain(doc.id);

    const bySearch = await ownerPage.request.get(
      `/api/teams/${teamId}/documents?query=nda`,
    );
    expect(bySearch.ok()).toBeTruthy();
    const searchBody = (await bySearch.json()) as { documents: { id: string }[] };
    expect(searchBody.documents.map((d) => d.id)).toContain(doc.id);

    // PATCH update follows the same document-settings API + validation style.
    const patched = await ownerPage.request.fetch(
      `/api/teams/${teamId}/documents/${doc.id}`,
      {
        method: "PATCH",
        data: {
          agreementType: "MSA",
          agreementMeta: { partiesInvolved: ["Acme", "Globex"] },
        },
      },
    );
    expect(patched.ok()).toBeTruthy();
    const patchedBody = (await patched.json()) as {
      agreementType: string;
      agreementMeta: { partiesInvolved: string[] };
    };
    expect(patchedBody.agreementType).toBe("MSA");
    expect(patchedBody.agreementMeta.partiesInvolved).toEqual(["Acme", "Globex"]);

    const invalid = await ownerPage.request.fetch(
      `/api/teams/${teamId}/documents/${doc.id}`,
      {
        method: "PATCH",
        data: { agreementType: "NOT_A_REAL_TYPE" },
      },
    );
    expect(invalid.status()).toBe(400);

    // Restore NDA for the sharing-lifecycle tests below.
    const restore = await ownerPage.request.fetch(
      `/api/teams/${teamId}/documents/${doc.id}`,
      { method: "PATCH", data: { agreementType: "NDA" } },
    );
    expect(restore.ok()).toBeTruthy();
  });

  test("link creation without explicit security → Confidential defaults applied", async () => {
    const link = await createLink(ownerPage.request, {
      teamId,
      documentId: agreementDocId,
    });
    expect(link.id).toBeTruthy();
    agreementLinkId = link.id;

    const linksRes = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${agreementDocId}/links`,
    );
    expect(linksRes.ok()).toBeTruthy();
    const links = (await linksRes.json()) as {
      id: string;
      emailProtected: boolean;
      emailAuthenticated: boolean;
      allowDownload: boolean;
      enableWatermark: boolean;
      watermarkConfig: { text: string; isTiled: boolean } | null;
    }[];
    const mine = links.find((l) => l.id === link.id);
    expect(mine).toBeTruthy();
    expect(mine!.emailProtected).toBe(true);
    expect(mine!.emailAuthenticated).toBe(true);
    expect(mine!.allowDownload).toBe(false);
    expect(mine!.enableWatermark).toBe(true);
    expect(mine!.watermarkConfig).toBeTruthy();
    expect(mine!.watermarkConfig!.text).toContain("CONFIDENTIAL");
    expect(mine!.watermarkConfig!.text).toContain("{{email}}");
    expect(mine!.watermarkConfig!.isTiled).toBe(true);
  });

  /** Email + OTP recipient flow against a Confidential-default agreement link. */
  async function openAsRecipient(browser: Browser, linkId: string, tag: string) {
    const context = await newQaContext(browser);
    const page = await context.newPage();

    // Track the viewId the viewer receives (needed for the download probe).
    let viewId: string | undefined;
    page.on("response", async (res) => {
      if (
        res.url().includes("/api/views") &&
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

    // Email gate
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();

    // emailAuthenticated default → OTP step (code read from the real store).
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

    // The successful /api/views response carries the viewId.
    const deadline = Date.now() + 15_000;
    while (!viewId && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }
    expect(viewId, "viewId captured from /api/views").toBeTruthy();

    return { context, page, viewId: viewId! };
  }

  test("recipient views the agreement link → agreementStatus becomes VIEWED", async ({ browser }) => {
    const { context } = await openAsRecipient(
      browser,
      agreementLinkId,
      "agree-viewer",
    );

    await expect
      .poll(
        async () =>
          (await getDocument(ownerPage.request, teamId, agreementDocId))
            ?.agreementStatus,
        { timeout: 30_000 },
      )
      .toBe("VIEWED");

    await context.close();
  });

  test("archive the link → agreementStatus becomes REVOKED", async () => {
    const res = await ownerPage.request.put(
      `/api/links/${agreementLinkId}/archive`,
      { data: { teamId, isArchived: true } },
    );
    expect(res.ok()).toBeTruthy();

    await expect
      .poll(
        async () =>
          (await getDocument(ownerPage.request, teamId, agreementDocId))
            ?.agreementStatus,
        { timeout: 30_000 },
      )
      .toBe("REVOKED");
  });

  test("download blocked: POST /api/links/download for the agreement link → 403", async ({ browser }) => {
    // Fresh link (the previous one is archived); defaults apply again.
    const link = await createLink(ownerPage.request, {
      teamId,
      documentId: agreementDocId,
    });
    const { context, page, viewId } = await openAsRecipient(
      browser,
      link.id,
      "agree-download",
    );

    const status = await page.evaluate(
      ({ linkId, viewId }) =>
        fetch("/api/links/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId, viewId }),
        }).then((res) => res.status),
      { linkId: link.id, viewId },
    );
    // 403 = session valid but allowDownload is false (server-enforced).
    expect(status).toBe(403);

    await context.close();
  });
});
