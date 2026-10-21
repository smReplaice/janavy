import path from "path";

import { expect, test } from "@playwright/test";

import {
  ROOT,
  getDocument,
  getPrimaryTeamId,
  getSessionUser,
  readRunState,
  updateRunState,
} from "./helpers/janavy";

const FIXTURES = path.join(ROOT, "tests", "e2e", "fixtures");

test.describe("feature 9 — versioning", () => {
  test("upload version 2; document switches to v2", async ({
    page,
    request,
  }) => {
    const teamId = await getPrimaryTeamId(request);
    const user = await getSessionUser(page);
    const state = await readRunState();
    const documentId = state.documentId!;
    expect(documentId).toBeTruthy();

    // Upload v2 through the real APIs the dashboard uses
    // (tus → POST /versions).
    const buffer = await import("fs/promises").then((fs) =>
      fs.readFile(path.join(FIXTURES, "qa-v2.pdf")),
    );
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    // tus metadata is comma-separated "key base64value" pairs.
    const metadata = (
      [
        ["fileName", b64("qa-v2.pdf")],
        ["contentType", b64("application/pdf")],
        ["numPages", b64("2")],
        ["teamId", b64(teamId)],
        ["ownerId", b64(user.id)],
      ] as Array<[string, string]>
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(",");
    // Version numbers increment across reruns; wait for a NEW version, not a
    // hardcoded "v2".
    const beforeDoc = await getDocument(request, teamId, documentId);
    const beforeMaxVersion = Math.max(
      0,
      ...(beforeDoc?.versions?.map((v: any) => v.versionNumber) ?? [0]),
    );

    const baseURL = "http://localhost:3000";
    const createRes = await request.post(`${baseURL}/api/file/tus`, {
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(buffer.byteLength),
        "Upload-Metadata": metadata,
      },
    });
    expect(createRes.status()).toBe(201);
    const location = createRes.headers()["location"]!;
    const patchRes = await request.fetch(location, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
      },
      data: buffer,
    });
    expect(patchRes.status()).toBe(204);
    const idPart = location.split("/api/file/tus/")[1];
    const key = idPart.includes("/")
      ? idPart
      : Buffer.from(idPart, "base64url").toString("utf8");

    const versionRes = await request.post(
      `/api/teams/${teamId}/documents/${documentId}/versions`,
      {
        data: {
          url: key,
          storageType: "S3_PATH",
          numPages: 2,
          type: "pdf",
          contentType: "application/pdf",
          fileSize: buffer.byteLength,
        },
      },
    );
    expect(versionRes.ok()).toBeTruthy();

    // Wait until the NEW version is the processed primary (inline conversion).
    const deadline = Date.now() + 180_000;
    const found: {
      v?: { id?: string; versionNumber: number; isPrimary: boolean; hasPages: boolean };
    } = {};
    while (Date.now() < deadline) {
      const doc = await getDocument(request, teamId, documentId);
      const primary = doc?.versions?.[0] as {
        id?: string;
        versionNumber: number;
        isPrimary: boolean;
        hasPages: boolean;
      } | undefined;
      if (
        primary &&
        primary.versionNumber > beforeMaxVersion &&
        primary.isPrimary &&
        primary.hasPages
      ) {
        found.v = primary;
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    const newVersion = found.v;
    expect(newVersion, "new version exists").toBeTruthy();
    expect(newVersion!.isPrimary).toBeTruthy();
    expect(newVersion!.hasPages).toBeTruthy();
    await updateRunState({ version2Id: newVersion!.id });

    // The dashboard preview now renders the v2 page set (2 pages).
    await page.goto(`/documents/${documentId}`);
    const previewButton = page.locator("button:has(svg.lucide-eye)").first();
    await expect(previewButton).toBeVisible({ timeout: 60_000 });
    await previewButton.click();
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(
      modal.locator("img[alt='Page 1']").first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
