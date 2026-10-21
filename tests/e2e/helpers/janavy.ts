/**
 * JANAVY E2E helpers.
 *
 * Everything here drives the REAL product flows: the UI for human journeys,
 * the real HTTP APIs (tus upload, /api/links, /api/teams) for setup steps,
 * and the real OTP stores (Redis for login codes, Postgres for link OTPs)
 * as the QA "mailbox".
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

const execFileAsync = promisify(execFile);

let ipCounter = 1;

/**
 * Fresh browser context with a unique client IP.
 *
 * The app enforces a real per-IP signin rate limit (10 / 20 min,
 * pages/api/auth/[...nextauth].ts). QA tests legitimately simulate many
 * distinct users from one machine, so every test context sends a unique
 * X-Forwarded-For from the TEST-NET-2 documentation range. The limiter
 * itself stays fully active — each simulated client gets its own bucket.
 */
export async function newQaContext(
  browser: Browser,
  opts: { storageState?: string } = {},
): Promise<BrowserContext> {
  // Randomized per context (and per run) across the three documentation
  // TEST-NET ranges so repeated suite runs never land on an already-throttled
  // simulated client (the app allows 10 signins / 20 min per IP).
  const nets = ["192.0.2", "198.51.100", "203.0.113"];
  const net = nets[Math.floor(Math.random() * nets.length)];
  const ip = `${net}.${Math.floor(Math.random() * 253) + 1}`;
  return browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": ip },
    // Explicitly EMPTY storage unless provided: browser.newContext() would
    // otherwise inherit the project's storageState.
    storageState: opts.storageState ?? { cookies: [], origins: [] },
  });
}
export const ROOT = path.resolve(__dirname, "..", "..", "..");
export const AUTH_DIR = path.join(ROOT, "tests", "e2e", ".auth");
export const SESSION_FILE = path.join(AUTH_DIR, "session.json");

export function qaEmail(prefix = ""): string {
  const tag = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  return `qa+${prefix ? `${prefix}-` : ""}${tag}@janavy.test`;
}

/* ----------------------------- OTP readers -------------------------------- */

/** Read the login code from Redis (janavi:dev:login_code:email:<email>:*). */
export async function readLoginCode(email: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "node",
    [
      "--env-file=.env",
      "scripts/janavi/get-login-code.mjs",
      email,
      "60000",
    ],
    { cwd: ROOT, timeout: 70_000 },
  );
  return stdout.trim();
}

/** Read the link-access OTP from Postgres (VerificationToken). */
export async function readLinkOTP(
  linkId: string,
  email: string,
): Promise<string> {
  const { stdout } = await execFileAsync(
    "node",
    [
      "--env-file=.env",
      "scripts/janavi/get-link-otp.mjs",
      linkId,
      email,
      "60000",
    ],
    { cwd: ROOT, timeout: 70_000 },
  );
  return stdout.trim();
}

/* ------------------------------ auth flows -------------------------------- */

/** Enter the email on /login or /register and submit (sends the code). */
export async function requestLoginCode(
  page: Page,
  email: string,
  opts: { register?: boolean } = {},
): Promise<void> {
  await page.goto(opts.register ? "/register" : "/login");
  // Both /login and /register use id="email" on the email input.
  await page.locator("#email").fill(email);
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/signin/email") && res.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page
    .getByRole("button", { name: "Continue with Email" })
    .first()
    .click();
  const res = await responsePromise;
  if (!res.ok()) throw new Error(`signin POST failed: ${res.status()}`);

  if (opts.register) {
    // /register shows a toast and stays put — the verification page is the
    // next stop in the real user journey.
    await page.goto("/auth/email");
  } else {
    await page.waitForURL(/\/auth\/email/, { timeout: 30_000 });
  }
}

/** Fill the code on /auth/email and submit; lands on the signed-in app. */
export async function completeEmailVerification(
  page: Page,
  email: string,
): Promise<void> {
  // Wait for the form to settle (the locked-email variant renders after the
  // sessionStorage effect runs), then fill whatever is editable.
  const codeInput = page.locator("#code");
  await codeInput.waitFor({ state: "visible" });
  const emailInput = page.locator("#email");
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
  }
  const code = await readLoginCode(email);
  await codeInput.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

/**
 * Full signup-or-login through the real UI. Returns once a session cookie
 * is established (new users land on /welcome via middleware; logins from
 * /register land back on /register signed-in).
 */
export async function signinViaEmail(
  page: Page,
  email: string,
  opts: { register?: boolean } = {},
): Promise<void> {
  await requestLoginCode(page, email, opts);
  await completeEmailVerification(page, email);

  // The verify page pushes the NextAuth email callback URL; wait until the
  // session is live (poll the session endpoint from the page context).
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = await page.request.get("/api/auth/session");
    if (res.ok()) {
      const body = (await res.json().catch(() => ({}))) as {
        user?: { email?: string };
      };
      if (body.user?.email?.toLowerCase() === email.toLowerCase()) return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`sign-in did not produce a session for ${email}`);
}

/* -------------------------------- API ------------------------------------- */

export async function getPrimaryTeamId(
  request: APIRequestContext,
): Promise<string> {
  const res = await request.get("/api/teams");
  if (!res.ok()) throw new Error(`/api/teams failed: ${res.status()}`);
  const teams = (await res.json()) as { id: string }[];
  if (!teams.length) throw new Error("no teams for session");
  return teams[0].id;
}

export async function getDocuments(
  request: APIRequestContext,
  teamId: string,
): Promise<
  {
    id: string;
    name: string;
    agreementType?: string | null;
    links: { id: string }[];
    versions: {
      id?: string;
      versionNumber: number;
      hasPages: boolean;
      isPrimary: boolean;
    }[];
  }[]
> {
  const res = await request.get(`/api/teams/${teamId}/documents`);
  if (!res.ok()) throw new Error(`list documents failed: ${res.status()}`);
  const body = (await res.json()) as
    | { documents?: any[] }
    | any[];
  return Array.isArray(body) ? body : (body.documents ?? []);
}

/** Single document with versions (the list endpoint has no versions). */
export async function getDocument(
  request: APIRequestContext,
  teamId: string,
  documentId: string,
): Promise<{
  id: string;
  name: string;
  agreementType?: string | null;
  agreementStatus?: string | null;
  versions: {
    id: string;
    versionNumber: number;
    hasPages: boolean;
    isPrimary: boolean;
  }[];
} | null> {
  const res = await request.get(`/api/teams/${teamId}/documents/${documentId}`);
  if (!res.ok()) return null;
  return (await res.json()) as any;
}

/**
 * Wait until a document's primary version has page images (conversion done).
 * The document GET returns ONLY the primary version; tolerate the version
 * being briefly absent while a new upload demotes/recreates primaries.
 */
export async function waitForDocumentProcessed(
  request: APIRequestContext,
  teamId: string,
  documentId: string,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await getDocument(request, teamId, documentId);
    const primary = doc?.versions?.[0];
    if (primary?.hasPages) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`document ${documentId} not processed within ${timeoutMs}ms`);
}

/* --------------------------- tus upload via API ---------------------------- */

/**
 * Upload a file through the real tus endpoint (/api/file/tus) using the
 * session cookies, then register it via the real document-creation API.
 * Returns the created document (same path the dashboard upload UI takes).
 */
export async function uploadDocumentViaApi(
  request: APIRequestContext,
  opts: {
    filePath: string;
    name: string;
    contentType: string;
    teamId: string;
    ownerId: string;
    numPages?: number;
    type?: string; // supported file type, e.g. "pdf"
    agreementType?: string; // JANAVY agreement categorization (NDA, MSA, ...)
  },
): Promise<{ id: string; name: string; [key: string]: unknown }> {
  const buffer = await readFile(opts.filePath);
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  // tus metadata pairs are "key base64value" — a pair with an EMPTY value
  // (e.g. relativePath "") is malformed and rejected with 400, so empty
  // values are omitted exactly like the browser client does.
  const pairs: Array<[string, string]> = [
    ["fileName", b64(opts.name)],
    ["contentType", b64(opts.contentType)],
    ["numPages", b64(String(opts.numPages ?? 1))],
    ["teamId", b64(opts.teamId)],
    ["ownerId", b64(opts.ownerId)],
  ];
  const metadata = pairs.map(([k, v]) => `${k} ${v}`).join(",");

  const baseURL = (
    process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  const createRes = await request.post(`${baseURL}/api/file/tus`, {
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(buffer.byteLength),
      "Upload-Metadata": metadata,
    },
  });
  if (createRes.status() !== 201) {
    throw new Error(`tus creation failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const location = createRes.headers()["location"];
  if (!location) throw new Error("tus creation returned no Location header");

  const patchRes = await request.fetch(location, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
    },
    data: buffer,
  });
  if (patchRes.status() !== 204) {
    throw new Error(`tus upload failed: ${patchRes.status()} ${await patchRes.text()}`);
  }

  // Decode the storage key the same way the browser client does.
  const idPart = location.split("/api/file/tus/")[1];
  const key = idPart.includes("/")
    ? idPart
    : Buffer.from(idPart, "base64url").toString("utf8");

  const docRes = await request.post(`/api/teams/${opts.teamId}/documents`, {
    data: {
      name: opts.name,
      url: key,
      storageType: "S3_PATH",
      numPages: opts.numPages ?? 1,
      type: opts.type,
      contentType: opts.contentType,
      fileSize: buffer.byteLength,
      ...(opts.agreementType && { agreementType: opts.agreementType }),
    },
  });
  const body = (await docRes.json().catch(() => ({}))) as any;
  if (!docRes.ok()) {
    throw new Error(`document creation failed: ${docRes.status()} ${JSON.stringify(body)}`);
  }
  return body;
}

/* ------------------------------- links ------------------------------------ */

export async function createLink(
  request: APIRequestContext,
  opts: {
    teamId: string;
    documentId: string;
    linkType?: string;
    [key: string]: unknown;
  },
): Promise<{ id: string }> {
  const { teamId, documentId, linkType, ...rest } = opts;
  const res = await request.post("/api/links", {
    data: {
      linkType: linkType ?? "DOCUMENT_LINK",
      targetId: documentId,
      teamId,
      domain: null,
      slug: null,
      ...rest,
    },
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok()) {
    throw new Error(`link creation failed: ${res.status()} ${JSON.stringify(body)}`);
  }
  return body;
}

export async function updateLink(
  request: APIRequestContext,
  opts: { teamId: string; linkId: string; [key: string]: unknown },
): Promise<void> {
  const { teamId, linkId, ...rest } = opts;
  const res = await request.put(`/api/links/${linkId}`, {
    data: {
      teamId,
      ...rest,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `link update failed: ${res.status()} ${await res.text()}`,
    );
  }
}

/* ------------------------------ session info ------------------------------- */

export async function getSessionUser(
  page: Page,
): Promise<{ id: string; email: string; name?: string }> {
  const res = await page.request.get("/api/auth/session");
  const body = (await res.json()) as { user?: { id: string; email: string; name?: string } };
  if (!body.user) throw new Error("no session user");
  return body.user;
}

/* --------------------------- navigation helpers ----------------------------- */

/**
 * Navigate to an app route, retrying past the middleware's "brand-new users
 * bounce to /welcome for 10 seconds" rule.
 */
export async function gotoApp(page: Page, route: string): Promise<void> {
  for (let i = 0; i < 14; i++) {
    await page.goto(route);
    if (!page.url().includes("/welcome")) return;
    await page.waitForTimeout(1500);
  }
  if (page.url().includes("/welcome")) {
    throw new Error(`stuck on /welcome when navigating to ${route}`);
  }
}

/**
 * Let the page finish loading lazily-imported client machinery (the PDF
 * page-counter WASM chunk in dev) before driving the upload input —
 * otherwise the very first upload on a cold page can stall before any
 * network activity starts.
 */
export async function settleForUpload(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(4500);
}

/* --------------------------- shared run state ------------------------------ */

export type RunState = {
  primaryEmail: string;
  documentId?: string;
  version2Id?: string;
  sharingLinkId?: string;
  dataroomId?: string;
  dataroomDocId?: string;
  [key: string]: unknown;
};

export async function readRunState(): Promise<RunState> {
  try {
    return JSON.parse(await readFile(SESSION_FILE, "utf8")) as RunState;
  } catch {
    return { primaryEmail: "" };
  }
}

export async function updateRunState(patch: Partial<RunState>): Promise<void> {
  const current = await readRunState();
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(
    SESSION_FILE,
    JSON.stringify({ ...current, ...patch }, null, 2),
    "utf8",
  );
}
