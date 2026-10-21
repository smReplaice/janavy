import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const email = `diag5+${Date.now()}@janavy.test`;
await page.goto("http://localhost:3000/login");
await page.locator("#email").fill(email);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/, { timeout: 60000 });
const code = execSync(`node --env-file=.env scripts/janavi/get-login-code.mjs ${email} 30000`).toString().trim();console.log("code:", code);
const codeInput = page.locator("#code");
await codeInput.waitFor({ state: "visible", timeout: 30000 });
const emailInput = page.locator("#email");
if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
await codeInput.fill(code);
await page.getByRole("button", { name: "Verify" }).click();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const j = await (await page.request.get("/api/auth/session")).json().catch(() => null);
  if (j?.user?.email) { globalThis.sessionUser = j.user; break; }
}
const sessionUser = globalThis.sessionUser;
const teams = await (await page.request.get("/api/teams")).json().catch(() => null);
const team = Array.isArray(teams) ? teams[0] : teams?.[0] ?? teams;
console.log("teamId:", team?.id, "| teams is array:", Array.isArray(teams), "| count:", teams?.length);
// tus upload
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>", "utf-8");
const b64 = (x) => Buffer.from(x, "utf8").toString("base64");
const tusRes = await ctx.request.post("http://localhost:3000/api/file/tus", {
  headers: { "Tus-Resumable": "1.0.0", "Upload-Length": String(pdf.length), "Upload-Metadata": ["fileName", b64("diag.pdf"), "contentType", b64("application/pdf"), "numPages", b64("1"), "teamId", b64(team.id), "ownerId", b64(sessionUser.id), "relativePath", b64("")].join(",") },
});
console.log("tus create:", tusRes.status(), tusRes.headers()["location"]?.slice(0, 60));
const loc = tusRes.headers()["location"];
const patchRes = await ctx.request.fetch(loc, { method: "PATCH", headers: { "Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" }, data: pdf });
console.log("tus patch:", patchRes.status());
const idPart = loc.split("/api/file/tus/")[1];
const key = idPart.includes("/") ? idPart : Buffer.from(idPart, "base64url").toString("utf8");
console.log("storage key:", key);
const docRes = await page.request.post(`/api/teams/${team.id}/documents`, { data: { name: "diag.pdf", url: key, storageType: "S3_PATH", numPages: 1, type: "pdf", contentType: "application/pdf", fileSize: pdf.length } });
const doc = await docRes.json().catch(() => ({}));
console.log("doc create:", docRes.status(), "id:", doc.id, "teamId:", doc.teamId, "name:", doc.name);
const linkRes = await page.request.post("/api/links", { data: { linkType: "DOCUMENT_LINK", targetId: doc.id, teamId: team.id, domain: null, slug: null } });
console.log("link create:", linkRes.status(), (await linkRes.text()).slice(0, 200));
await browser.close();
