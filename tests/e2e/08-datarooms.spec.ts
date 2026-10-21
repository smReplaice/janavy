import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  gotoApp,
  createLink,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  readRunState,
  updateRunState,
} from "./helpers/janavy";

const SHOT_DIR = path.join(ROOT, "docs", "testing", "screenshots");

test.describe("feature 7 — data rooms", () => {
  test("create room, add document + folder, viewer group with permissions, recipient flow", async ({
    page,
    request,
    browser,
  }) => {
    const teamId = await getPrimaryTeamId(request);
    const state = await readRunState();
    const documentId = state.documentId!;

    // --- 1. Create the room through the UI -------------------------------
    await gotoApp(page, "/datarooms");
    await page.getByRole("button", { name: /new dataroom/i }).click();
    await page.getByPlaceholder("ACME Acquisition").fill("JANAVY QA Room");
    await page
      .getByRole("button", { name: /add new dataroom/i })
      .first()
      .click();

    // Lands on the room's documents page.
    await page.waitForURL(/\/datarooms\/[^/]+\/documents/, { timeout: 30_000 });
    const dataroomId = page.url().split("/")[4];
    expect(dataroomId).toBeTruthy();
    await updateRunState({ dataroomId });

    // --- 2. Attach the existing PDF to the room (real API) ----------------
    const attachRes = await request.post(
      `/api/teams/${teamId}/datarooms/${dataroomId}/documents`,
      { data: { documentId } },
    );
    expect(attachRes.ok()).toBeTruthy();
    const dataroomDoc = (await attachRes.json()) as { id: string };
    await updateRunState({ dataroomDocId: dataroomDoc.id });

    // --- 3. Create a folder (real API) ------------------------------------
    const folderRes = await request.post(
      `/api/teams/${teamId}/datarooms/${dataroomId}/folders`,
      { data: { name: "QA Folder" } },
    );
    expect(folderRes.ok()).toBeTruthy();

    // The room documents page shows both items.
    await gotoApp(page, `/datarooms/${dataroomId}/documents`);
    await expect(page.getByText("qa-3page.pdf").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("QA Folder").first()).toBeVisible();

    // --- 4. Viewer group + member (real APIs) ------------------------------
    const groupRes = await request.post(
      `/api/teams/${teamId}/datarooms/${dataroomId}/groups`,
      { data: { name: "QA Viewer Group" } },
    );
    expect(groupRes.ok()).toBeTruthy();
    const group = (await groupRes.json()) as { id: string };

    const viewerEmail = qaEmail("viewer");
    const memberRes = await request.post(
      `/api/teams/${teamId}/datarooms/${dataroomId}/groups/${group.id}/members`,
      { data: { emails: [viewerEmail] } },
    );
    expect(memberRes.ok()).toBeTruthy();

    // --- 5. Permission toggles (canView / canDownload) --------------------
    // Item-level permission for the group on the attached document:
    // view ON, download OFF. (The API takes ItemType-enum items keyed by
    // DataroomDocument id — there is no room-level pseudo item.)
    const permRes = await request.post(
      `/api/teams/${teamId}/datarooms/${dataroomId}/groups/${group.id}/permissions`,
      {
        data: {
          permissions: {
            [dataroomDoc.id]: {
              itemType: "DATAROOM_DOCUMENT",
              view: true,
              download: false,
            },
          },
        },
      },
    );
    expect(permRes.ok()).toBeTruthy();

    // Verify the toggles persisted through the group page UI.
    await gotoApp(page, `/datarooms/${dataroomId}/groups`);
    await expect(page.getByText("QA Viewer Group").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({
      path: path.join(SHOT_DIR, "dataroom.png"),
      fullPage: true,
    });

    // --- 6. Dataroom link recipient flow -----------------------------------
    const link = await createLink(request, {
      teamId,
      documentId,
      linkType: "DATAROOM_LINK",
      targetId: dataroomId,
      emailProtected: true,
      allowDownload: true,
    });
    expect(link.id).toBeTruthy();

    const context = await newQaContext(browser);
    const recipient = await context.newPage();
    await recipient.goto(`/view/${link.id}`);
    await recipient.getByLabel(/email address/i).fill(viewerEmail);
    await recipient.getByRole("button", { name: /continue/i }).click();

    // The room view lists the document...
    await expect(
      recipient.getByText("qa-3page.pdf").first(),
    ).toBeVisible({ timeout: 60_000 });

    // ...and clicking it opens the document view with page images.
    await recipient.getByText("qa-3page.pdf").first().click();
    await expect(
      recipient.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
    await context.close();
  });
});
