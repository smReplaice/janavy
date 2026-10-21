import { execFile } from "child_process";
import { promisify } from "util";
import { expect, test } from "@playwright/test";

import {
  completeEmailVerification,
  newQaContext,
  qaEmail,
  requestLoginCode,
  signinViaEmail,
} from "./helpers/janavy";

test.describe("feature 1 — auth", () => {
  test("unauthenticated /dashboard redirects to /login", async ({ browser }) => {
    // A context with NO stored session (the spec project's storageState is
    // deliberately blanked here).
    const context = await newQaContext(browser);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    expect(page.url()).toContain("/login");
    await expect(page.getByText("Welcome to JANAVY")).toBeVisible();
    await context.close();
  });

  test("signup via /register creates account and lands in the app", async ({
    browser,
  }) => {
    const context = await newQaContext(browser);
    const page = await context.newPage();
    const email = qaEmail("signup");

    await signinViaEmail(page, email, { register: true });

    // New users are redirected to the onboarding by the middleware.
    expect(
      /\/(welcome|dashboard)/.test(new URL(page.url()).pathname),
    ).toBeTruthy();

    // Session exists and a team was auto-created.
    const sessionRes = await page.request.get("/api/auth/session");
    expect(sessionRes.ok()).toBeTruthy();
    const session = (await sessionRes.json()) as {
      user?: { email?: string };
    };
    expect(session.user?.email).toBe(email);

    const teamsRes = await page.request.get("/api/teams");
    expect(teamsRes.ok()).toBeTruthy();
    const teams = (await teamsRes.json()) as { id: string; name: string }[];
    expect(teams.length).toBeGreaterThanOrEqual(1);

    await context.close();
  });

  test("login via code for existing user; logout; login again", async ({
    browser,
  }) => {
    // The setup user's session (storageState of this project's page).
    const { readRunState } = await import("./helpers/janavy");
    const state = await readRunState();
    const email = state.primaryEmail;

    const context = await newQaContext(browser, {
      storageState: "tests/e2e/.auth/user.json",
    });
    const page = await context.newPage();
    // Brand-new users are bounced /dashboard → /welcome for their first 10
    // seconds (middleware rule); retry until the window has passed.
    for (let i = 0; i < 12; i++) {
      await page.goto("/dashboard");
      if (!page.url().includes("/welcome")) break;
      await page.waitForTimeout(1500);
    }
    expect(page.url()).not.toContain("/welcome");

    // The sidebar footer user menu (avatar + email + chevron button).
    const userMenu = page.getByRole("button", { name: /@janavy\.test/ }).first();
    await expect(userMenu).toBeVisible({ timeout: 30_000 });

    // Log out via the sidebar user menu.
    await userMenu.click();
    const logoutItem = page
      .getByText("Log out", { exact: true })
      .or(page.getByRole("menuitem", { name: /log out/i }))
      .first();
    await logoutItem.waitFor({ state: "visible", timeout: 15_000 });
    const signoutDone = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/signout") &&
        res.request().method() === "POST",
      { timeout: 30_000 },
    );
    await logoutItem.click();
    await signoutDone;
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    // Wait for the session cookie to actually clear before continuing.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const r = await fetch("/api/auth/session", { cache: "no-store" });
            const j = (await r.json().catch(() => ({}))) as {
              user?: unknown;
            };
            return j.user ?? null;
          }),
        { timeout: 20_000 },
      )
      .toBeNull();

    // /dashboard now requires login again.
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    // Log back in with a fresh code (polls until the session is live).
    await signinViaEmail(page, email);

    await context.close();
  });

  test("wrong login code is rejected", async ({ browser }) => {
    const context = await newQaContext(browser);
    const page = await context.newPage();
    const email = qaEmail("badcode");

    await requestLoginCode(page, email, { register: true });
    await page.locator("#email").fill(email);
    await page.locator("#code").fill("XXXXXXXXXX");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(
      page.getByText(/expired or has already been used|expired or is invalid/i),
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test("dev-server log shows the login email send marker", async () => {
    // The [Login Email Sent] marker is written by lib/auth/auth-options.ts
    // whenever a code is dispatched; the signup/login tests above triggered
    // it moments ago. Assert it exists in the dev log.
    // Read the dev log directly — no child process needed.
    const { readFile } = await import("fs/promises");
    const log = await readFile("/tmp/janavy-dev.log", "utf8").catch(
      () => "",
    );
    expect(log.includes("[Login Email Sent]")).toBe(true);
  });
});
