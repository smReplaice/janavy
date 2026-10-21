import { execFile } from "child_process";
import { promisify } from "util";

import { expect, test } from "@playwright/test";

import {
  createLink,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  readRunState,
  updateLink,
} from "./helpers/janavy";

const execA = promisify(execFile);

async function beaconSendCount(): Promise<number> {
  // No shell: invoke grep directly (grep exits 1 on zero matches, which we
  // report as a count of 0).
  try {
    const res = await execA("grep", [
      "-c",
      "\\[beacon\\] request",
      "/tmp/janavi-dev.log",
    ]);
    return Number(res.stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

test.describe("feature 11 — Beacon notification emails", () => {
  test("viewing a link with enableNotification dispatches the owner email via Beacon", async ({
    request,
    browser,
  }) => {
    const teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    const documentId = state.documentId!;

    const link = await createLink(request, { teamId, documentId });
    await updateLink(request, {
      teamId,
      linkId: link.id,
      emailProtected: true,
      enableNotification: true,
    });

    const before = await beaconSendCount();

    // Recipient views the document (real browser flow).
    const context = await newQaContext(browser);
    const page = await context.newPage();
    const recipient = qaEmail("notify");
    await page.goto(`/view/${link.id}`);
    await page.getByLabel(/email address/i).fill(recipient);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    await context.close();

    // The "document viewed" notification job runs in the background; assert
    // the Beacon send count increased (send attempted + accepted 200/Queued).
    // We do NOT claim inbox delivery.
    await expect
      .poll(() => beaconSendCount(), { timeout: 30_000, intervals: [2000] })
      .toBeGreaterThan(before);
  });
});
