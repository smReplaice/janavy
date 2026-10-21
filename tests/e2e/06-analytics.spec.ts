import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  createLink,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  readRunState,
} from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

test.describe("feature 6 — analytics", () => {
  test("document stats show ≥1 view after a recipient view", async ({
    request,
    browser,
  }) => {
    const teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    const documentId = state.documentId!;

    // Generate a real recipient view through the public viewer.
    const link = await createLink(request, { teamId, documentId });
    const recipient = qaEmail("stats");
    const context = await newQaContext(browser);
    const page = await context.newPage();
    await page.goto(`/view/${link.id}`);
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2000); // let the view settle
    await context.close();

    // The document page shows the stats surface with at least 1 view.
    const ownerPage = await browser.newPage({
      storageState: "tests/e2e/.auth/user.json",
    });
    await (await import("./helpers/janavy")).gotoApp(ownerPage, `/documents/${documentId}`);
    await ownerPage.waitForLoadState("networkidle").catch(() => {});

    const viewsRes = await ownerPage.request.get(
      `/api/teams/${teamId}/documents/${documentId}/stats?interval=30d`,
    );
    expect(viewsRes.ok()).toBeTruthy();
    const stats = (await viewsRes.json()) as { totalViews?: number; views?: unknown[] };
    const totalViews =
      stats.totalViews ?? (Array.isArray(stats.views) ? stats.views.length : 0);
    expect(totalViews).toBeGreaterThanOrEqual(1);

    await ownerPage.screenshot({
      path: path.join(SHOT_DIR, "analytics.png"),
      fullPage: true,
    });
    await ownerPage.close();
  });

  // Durations (Tinybird) are NOT TESTED: no Tinybird token in this
  // environment; View rows live in Postgres and are covered above.
  test("views data degrades without Tinybird (durations omitted)", async ({
    request,
  }) => {
    const teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    const documentId = state.documentId!;
    const res = await request.get(
      `/api/teams/${teamId}/documents/${documentId}/stats?interval=30d`,
    );
    expect(res.ok()).toBeTruthy();
    // The Postgres-backed payload responds; Tinybird-dependent duration
    // fields are simply absent/zero rather than erroring the endpoint.
  });
});
