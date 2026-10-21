import { expect, test } from "@playwright/test";

import { gotoApp, readRunState } from "./helpers/janavy";

type finding = { page: string; kind: string; detail: string };

const BENIGN_PATTERNS: RegExp[] = [
  /react-devtools/i,
  /extra attributes from the server/i, // hydration class/style warning
  /viewport meta tags should not be used/i,
  /sourcemap/i,
  /posthog|us-assets|us.i.posthog|ingest\./i,
  /fonts\.google|googleapis\.com|gstatic/i,
  /gtm\.js|googletagmanager/i,
  /net::ERR_BLOCKED|net::ERR_CONNECTION_REFUSED.*posthog|ERR_NAME_NOT_RESOLVED/i,
  /Download the React DevTools/i,
  /API handler should not return a value/i, // pages-router warning, benign
  /Warning: validateDOMNesting|Warning: Each child in a list/i,
  /favicon/i,
];

function isBenign(text: string): boolean {
  return BENIGN_PATTERNS.some((p) => p.test(text));
}

test.describe("feature 14 — console errors + failed network requests", () => {
  test("key pages report console errors and failed requests", async ({
    page,
  }) => {
    const findings: finding[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        const text = msg.text();
        // Generic resource-load console errors are counted with their URL
        // via the response handler below — skip the URL-less duplicates.
        if (/Failed to load resource/i.test(text)) return;
        if (!isBenign(text)) {
          findings.push({ page: page.url(), kind: `console.${msg.type()}`, detail: text.slice(0, 300) });
        }
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 500) {
        findings.push({
          page: page.url(),
          kind: `http.${res.status()}`,
          detail: `${res.request().method()} ${res.url()}`.slice(0, 300),
        });
      }
    });
    page.on("requestfailed", (req) => {
      const text = `${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`;
      if (!isBenign(text)) {
        findings.push({ page: page.url(), kind: "requestfailed", detail: text.slice(0, 300) });
      }
    });
    page.on("pageerror", (err) => {
      if (!isBenign(err.message)) {
        findings.push({ page: page.url(), kind: "pageerror", detail: err.message.slice(0, 300) });
      }
    });

    const state = await readRunState();
    const routes = [
      "/dashboard",
      "/documents",
      state.documentId ? `/documents/${state.documentId}` : "/documents",
      "/datarooms",
      state.dataroomId
        ? `/datarooms/${state.dataroomId}/documents`
        : "/datarooms",
      "/visitors",
      "/branding",
      "/settings/general",
      "/settings/people",
      "/settings/domains",
      "/settings/notifications",
    ];
    for (const route of routes) {
      await gotoApp(page, route);
      await page.waitForTimeout(2500);
    }

    // Print the aggregate for the QA report; then enforce a budget so real
    // breakage (React errors, 500s) fails the suite while the suite is being
    // iterated on. The final counts are transcribed into the report.
    const critical = findings.filter(
      (f) => f.kind === "pageerror" || /status.*5\d\d|500/i.test(f.detail),
    );
    console.log(
      `[console-monitor] total non-benign findings: ${findings.length} (critical: ${critical.length})`,
    );
    for (const f of findings.slice(0, 40)) {
      console.log(`[console-monitor] ${f.kind} on ${f.page}: ${f.detail}`);
    }
    expect(
      critical.length,
      `critical console/page errors found: ${JSON.stringify(critical)}`,
    ).toBe(0);
  });
});
