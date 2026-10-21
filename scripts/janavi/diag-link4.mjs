import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const email = `diag4+${Date.now()}@janavy.test`;
await page.goto("http://localhost:3000/login");
await page.locator("#email").fill(email);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/, { timeout: 60000 });
const readCode = (em) => execSync(`node --env-file=.env -e "
const Redis = require('ioredis').default;
const r = new Redis(process.env.REDIS_URL, { keyPrefix: 'janavi:dev:' });
(async () => {
  for (let i = 0; i < 15; i++) {
    const keys = await r.keys('login_code:email:' + process.argv[1] + ':*');
    if (keys.length) { console.log(keys[0].split(':').pop()); await r.disconnect(); return; }
    await new Promise(res => setTimeout(res, 2000));
  }
  console.log('NOTFOUND'); await r.disconnect();
})();" ${em}`).toString().trim();
const code = readCode(email);
console.log("code:", code === "NOTFOUND" ? "NOTFOUND" : "OK");
const codeInput = page.locator("#code");
await codeInput.waitFor({ state: "visible", timeout: 30000 });
const emailInput = page.locator("#email");
if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
await codeInput.fill(code);
await page.getByRole("button", { name: "Verify" }).click();
let session = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const j = await (await page.request.get("/api/auth/session")).json().catch(() => null);
  if (j?.user?.email) { session = j; break; }
}
console.log("session:", session?.user?.email ?? "NONE");
const teams = await (await page.request.get("/api/teams")).json().catch(() => null);
const team = Array.isArray(teams) ? teams[0] : teams;
console.log("team id:", team?.id, "| type:", Array.isArray(teams) ? "array" : typeof teams);
if (team?.id) {
  // minimal PDF
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF", "utf-8");
  const createRes = await page.request.post(`/api/teams/${team.id}/documents`, {
    multipart: { file: { name: "diag.pdf", mimeType: "application/pdf", buffer: pdf } },
  });
  console.log("doc create (multipart):", createRes.status(), (await createRes.text()).slice(0, 200));
}
await browser.close();
