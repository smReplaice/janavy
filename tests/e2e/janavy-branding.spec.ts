import { expect, test } from "@playwright/test";

import { readRunState } from "./helpers/janavy";

/**
 * Janavy branding regression suite.
 *
 * Scans the RENDERED DOM (not source) of authenticated + unauthenticated
 * routes for incorrect branding, verifies logos actually load, checks
 * browser titles and legal link targets.
 *
 * Allowed occurrences (technical/legal, never user-facing copy):
 *  - the internal localStorage key "papermark.email" (not visible text)
 *  - source-file attribution and licenses (not rendered)
 */

const UNAUTH_ROUTES = ["/login", "/register", "/auth/email"];
const AUTH_ROUTES = [
  "/dashboard",
  "/documents",
  "/datarooms",
  "/settings/general",
  "/branding",
];

// Word-boundary matchers: "JANAVY" must not trip the JANAVI check.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: "Papermark (any case)", re: /\bpapermark\b/i },
  { label: "JANAVI", re: /\bjanavi\b/i },
  { label: "papermark.com link", re: /papermark\.com/i },
];

async function scanPage(page: import("@playwright/test").Page, route: string) {
  const text = await page.evaluate(() => document.body.innerText);
  for (const { label, re } of FORBIDDEN) {
    const hit = text.match(re);
    expect(
      hit,
      `${route}: forbidden branding "${label}" visible in UI (matched "${hit?.[0] ?? ""}")`,
    ).toBeNull();
  }
}

async function checkImages(route: string, page: import("@playwright/test").Page) {
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.src),
  );
  expect(broken, `${route}: broken images`).toEqual([]);
}

// Dev-server cold compiles make first-visit timing flaky; one retry absorbs it.
test.describe.configure({ retries: 1 });

test.describe("feature 16 — Janavy branding regression", () => {
  test("unauthenticated routes are fully Janavy-branded", async ({ browser }) => {
    // Explicit anonymous context: the project fixture carries the signed-in
    // storageState, which middleware would redirect off /login.
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const route of UNAUTH_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await scanPage(page, route);
      await checkImages(route, page);
    }
    await context.close();
  });

  test("login page: title, logo lockup, legal URLs", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveTitle(/janavy/i);
    // JV symbol + wordmark lockup above the email field
    await expect(page.locator('img[src*="jv-symbol-transparent"]').first()).toBeVisible();
    await expect(
      page.locator('img[src*="janavy-wordmark-transparent"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="https://janavy.com/terms"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="https://janavy.com/privacy"]').first(),
    ).toBeVisible();
    await context.close();
  });

  test("carousel renders with capability slides", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByText("Secure Document Sharing").first(),
    ).toBeVisible();
    // autoplay advances within ~5s
    await expect(page.getByText("Prevent Data Leaks").first()).toBeVisible({
      timeout: 12_000,
    });
    await context.close();
  });

  test("authenticated routes are fully Janavy-branded", async ({ page }) => {
    const state = await readRunState();
    expect(state.primaryEmail, "run setup first").toBeTruthy();
    for (const route of AUTH_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await scanPage(page, route);
      await checkImages(route, page);
    }
  });

  test("welcome onboarding uses Janavy positioning copy", async ({ page }) => {
    await page.goto("/welcome");
    await scanPage(page, "/welcome");
    await expect(page.getByText("Welcome to").first()).toBeVisible();
  });

  test("verification email template is Janavy-branded (source check)", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile("components/emails/verification-link.tsx", "utf8");
    expect(src).toContain("Welcome to Janavy");
    expect(src).toContain("janavy.com/privacy");
    expect(src).toContain("janavy.com/terms");
    expect(src).not.toMatch(/Papermark/);
  });

  test("document viewer shows Janavy chrome", async ({ page }) => {
    const state = await readRunState();
    const linkId = state.sharingLinkId;
    test.skip(!linkId, "no sharingLinkId in run state");
    await page.goto(`/view/${linkId}`);
    await scanPage(page, "/view");
  });
});
