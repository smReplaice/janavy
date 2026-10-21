import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const email = `diag3+${Date.now()}@janavy.test`;
await page.goto("http://localhost:3000/login");
await page.locator("#email").fill(email);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/, { timeout: 60000 });
const codeOut = execSync(`node --env-file=.env -e "
const Redis = require('ioredis').default;
const r = new Redis(process.env.REDIS_URL, { keyPrefix: 'janavi:dev:' });
(async () => {
  const keys = await r.keys('login_code:email:' + process.argv[1] + ':*');
  console.log(keys[0]?.split(':').pop() ?? 'NOTFOUND');
  await r.disconnect();
})();" ${email}`).toString().trim();
console.log("code:", codeOut);
const codeInput = page.locator("#code");
await codeInput.waitFor({ state: "visible", timeout: 30000 });
const emailInput = page.locator("#email");
if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
await codeInput.fill(codeOut);
await page.getByRole("button", { name: "Verify" }).click();
// poll for session
let session = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const s = await page.request.get("/api/auth/session");
  const j = await s.json().catch(() => null);
  if (j?.user?.email) { session = j; break; }
}
console.log("session:", session?.user?.email ?? "NONE", "| page url:", page.url());
if (session) {
  const teamsRes = await page.request.get("/api/teams");
  const teams = await teamsRes.json().catch(() => null);
  console.log("teams status:", teamsRes.status(), "| body head:", JSON.stringify(teams)?.slice(0, 300));
}
await browser.close();
