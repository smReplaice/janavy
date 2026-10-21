import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const email = `diag2+${Date.now()}@janavy.test`;
await page.goto("http://localhost:3000/login");
await page.locator("#email").fill(email);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/);
const codeOut = execSync(`node --env-file=.env -e "
const Redis = require('ioredis').default;
const r = new Redis(process.env.REDIS_URL, { keyPrefix: 'janavi:dev:' });
(async () => {
  const keys = await r.keys('login_code:email:' + process.argv[1] + ':*');
  console.log(keys[0]?.split(':').pop() ?? 'NOTFOUND');
  await r.disconnect();
})();" ${email}`).toString().trim();
await page.locator("#code").fill(codeOut);
await page.getByRole("button", { name: "Verify" }).click();
await page.waitForURL(/welcome|dashboard/, { timeout: 60000 }).catch(() => {});
// session
const s = await page.request.get("/api/auth/session");
const session = await s.json();
console.log("session user:", session?.user?.email, "createdAt:", session?.user?.createdAt);
const teams = await (await page.request.get("/api/teams")).json();
console.log("teams:", JSON.stringify(teams).slice(0, 220));
await browser.close();
