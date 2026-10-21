import { expect, test } from "@playwright/test";

import {
  gotoApp,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  signinViaEmail,
} from "./helpers/janavy";

test.describe("feature 8 — team/user management", () => {
  test("invite modal exists and submits; roles listed; teammate added then removed", async ({
    page,
    browser,
  }) => {
    const teamId = await getPrimaryTeamId(page.request);
    const teammateEmail = qaEmail("teammate");

    // --- 1. Invite flow (team-level modal) --------------------------------
    await gotoApp(page, "/settings/people");
    await expect(
      page.getByRole("heading", { name: /team|people/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Invite$/i }).first().click();
    const inviteModal = page.locator("[role='dialog']");
    await expect(inviteModal).toBeVisible({ timeout: 15_000 });

    await inviteModal
      .locator('input[type="email"], input[placeholder*="@" i]')
      .first()
      .fill(teammateEmail);
    const invitePosted = page.waitForResponse(
      (res) =>
        res.url().includes("/invite") && res.request().method() === "POST",
      { timeout: 30_000 },
    );
    await inviteModal
      .getByRole("button", { name: /add member/i })
      .last()
      .click();
    // The invite POST can take a second (Beacon email included); wait for it
    // before listing invitations.
    await invitePosted;

    // The invitation is recorded for the team (email invitations themselves
    // are sent through Beacon; inbox delivery is out of scope here).
    const invitationsRes = await page.request.get(
      `/api/teams/${teamId}/invitations`,
    );
    expect(invitationsRes.ok()).toBeTruthy();
    const invitations = (await invitationsRes.json()) as { email: string }[];
    expect(invitations.some((i) => i.email === teammateEmail)).toBeTruthy();

    // --- 2. Roles list is surfaced on the people page ---------------------
    await gotoApp(page, "/settings/people");
    await expect(page.getByText("Admin").first()).toBeVisible({
      timeout: 30_000,
    });

    // --- 3. Teammate accepts via the real invitation accept route ----------
    const teammateContext = await newQaContext(browser);
    const teammate = await teammateContext.newPage();
    await signinViaEmail(teammate, teammateEmail, { register: true });
    await teammate.goto(`/api/teams/${teamId}/invitations/accept`);
    await teammate.waitForURL(/invitation=accepted|\/documents/, {
      timeout: 30_000,
    });

    // The owner now sees the teammate on the people page.
    await gotoApp(page, "/settings/people");
    await expect(
      page.getByText(teammateEmail).first(),
    ).toBeVisible({ timeout: 30_000 });

    // --- 4. Remove the teammate through the UI ----------------------------
    const row = page
      .locator("tr, li, div")
      .filter({ hasText: teammateEmail })
      .first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    const removeButton = row.getByRole("button", {
      name: /remove|delete/i,
    });
    if (await removeButton.isVisible().catch(() => false)) {
      await removeButton.click();
      // Confirm if a dialog appears.
      const confirm = page
        .getByRole("button", { name: /confirm|remove|delete/i })
        .last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
    } else {
      // Dropdown-menu variant.
      await row.getByRole("button").last().click();
      await page
        .getByRole("menuitem", { name: /remove|delete/i })
        .first()
        .click();
    }
    await expect
      .poll(
        async () =>
          page
            .getByText(teammateEmail)
            .first()
            .isVisible()
            .catch(() => false),
        { timeout: 20_000 },
      )
      .toBe(false);

    await teammateContext.close();
  });
});
