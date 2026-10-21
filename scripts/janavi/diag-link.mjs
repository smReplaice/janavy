import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("http://localhost:3000/login");
await page.locator("#email").fill(`diag+${Date.now()}@janavy.test`);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/);
const email = await page.locator("#email").inputValue().catch(() => null);
const { execSync } = await import("node:child_process");
const code = execSync(`node --env-file=.env -e "
const Redis = require('ioredis').default;
const r = new Redis(process.env.REDIS_URL, { keyPrefix: 'janavi:dev:' });
const email = process.argv[1];
(async () => {
  const keys = await r.keys('*login*');
  for (const k of keys.slice(0, 20)) { console.log('KEY:', k); }
  await r.disconnect();
})();
" ${email ?? ""}`).toString();
console.log(code);
await browser.close();
