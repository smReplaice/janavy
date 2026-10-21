import { expect, test } from "@playwright/test";

import {
  getDocuments,
  getPrimaryTeamId,
  newQaContext,
  qaEmail,
  signinViaEmail,
} from "./helpers/janavy";

test.describe("feature 13 — cross-tenant isolation", () => {
  test("team B cannot access team A's documents by id", async ({
    request,
    browser,
  }) => {
    // Team A = the setup user's team and its core document.
    const teamA = await getPrimaryTeamId(request);
    const state = await (
      await import("./helpers/janavy")
    ).readRunState();
    const documentA = state.documentId!;
    expect(documentA).toBeTruthy();

    // Team B = a second QA user's team.
    const contextB = await newQaContext(browser);
    const pageB = await contextB.newPage();
    const emailB = qaEmail("tenantb");
    await signinViaEmail(pageB, emailB, { register: true });
    const teamB = await getPrimaryTeamId(pageB.request);
    expect(teamA).not.toBe(teamB);

    // Team B listing team A's documents → rejected.
    const listRes = await pageB.request.get(`/api/teams/${teamA}/documents`);
    expect([401, 403, 404]).toContain(listRes.status());

    // Team B requesting team A's document by id → rejected.
    const docRes = await pageB.request.get(
      `/api/teams/${teamA}/documents/${documentA}`,
    );
    expect([401, 403, 404]).toContain(docRes.status());

    // Team B cannot read team A's document stats either.
    const statsRes = await pageB.request.get(
      `/api/teams/${teamA}/documents/${documentA}/stats`,
    );
    expect([401, 403, 404]).toContain(statsRes.status());

    // Sanity: team B's own document list works (the failures above are
    // authorization, not auth).
    const ownRes = await pageB.request.get(`/api/teams/${teamB}/documents`);
    expect(ownRes.ok()).toBeTruthy();
    const ownBody = (await ownRes.json()) as
      | { id: string }[]
      | { documents?: { id: string }[] };
    const ownDocs = Array.isArray(ownBody) ? ownBody : (ownBody.documents ?? []);
    expect(
      ownDocs.some((d) => d.id === documentA),
      "team A document must not leak into team B's list",
    ).toBeFalsy();

    await contextB.close();
  });
});
