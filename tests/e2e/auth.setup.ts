import { mkdir } from "fs/promises";
import path from "path";

import { test as setup, expect } from "@playwright/test";

import {
  AUTH_DIR,
  newQaContext,
  qaEmail,
  readRunState,
  signinViaEmail,
  updateRunState,
} from "./helpers/janavy";

/**
 * Signs up a fresh JANAVY QA user through the real /register UI (email code
 * read from Redis), waits until a team exists, and stores the session for
 * every downstream spec (storageState) plus the run state (email).
 */
setup("authenticate", async ({ browser }) => {
  // Reuse the primary QA user across invocations so run-state written by
  // earlier specs (e.g. the uploaded core document) stays valid when later
  // specs are run standalone. A fresh signup only happens on the first run.
  const prior = await readRunState();
  const email = prior.primaryEmail || qaEmail("primary");
  const isFirstRun = !prior.primaryEmail;

  const context = await newQaContext(browser);
  const page = await context.newPage();

  await signinViaEmail(page, email, { register: isFirstRun });

  // Session live + team auto-created (GET /api/teams).
  const teamsRes = await page.request.get("/api/teams");
  expect(teamsRes.ok()).toBeTruthy();
  const teams = (await teamsRes.json()) as { id: string }[];
  expect(teams.length).toBeGreaterThanOrEqual(1);

  await mkdir(AUTH_DIR, { recursive: true });
  await context.storageState({ path: path.join(AUTH_DIR, "user.json") });
  await updateRunState({ primaryEmail: email });
  await context.close();
});
