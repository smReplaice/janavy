import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RECIPIENT = "pranjalt@replaice.co"; // approved test recipient (owner address in Beacon threads)
const browser = await chromium.launch();
const errors = [];

// ---------- desktop login → OTP ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errors.push("[login] " + m.text().slice(0, 110)); });
page.on("requestfailed", r => errors.push("[login] REQFAIL " + r.url().slice(0, 90)));

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
// carousel present + auto-advances
const slide1 = await page.getByRole("group", { name: "1 of 5" }).isVisible();
await page.screenshot({ path: "docs/testing/screenshots/login-desktop-carousel.png" });
await page.waitForTimeout(5600);
const activeAfter5s = await page.locator("[role='group'][aria-hidden='false'], [role='group']:not([aria-hidden='true'])").filter({ hasText: "Prevent Data Leaks" }).isVisible().catch(() => false);
const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
console.log("CHECK slide1:", slide1, "| autoAdvance(→slide2):", activeAfter5s, "| noVerticalScroll:", noScroll);
console.log("CHECK logo:", await page.locator('img[alt="Janavy"]').first().isVisible());

await page.locator("#email").fill(RECIPIENT);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/\/auth\/email/, { timeout: 60000 });
await page.locator("#code").waitFor({ state: "visible", timeout: 30000 });
console.log("CHECK otp heading:", await page.getByText("Verify your email").isVisible());
console.log("CHECK otp subline:", await page.getByText("We've sent a verification code to").isVisible());
console.log("CHECK resend:", await page.getByText("Resend Code").isVisible());
console.log("CHECK backToLogin:", await page.getByText("Back to Login").isVisible());
const otpNoScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
console.log("CHECK otp noVerticalScroll:", otpNoScroll);
await page.screenshot({ path: "docs/testing/screenshots/otp-desktop.png" });

// ---------- Beacon dispatch verification ----------
const before = JSON.parse(execSync(
  `curl -s --max-time 10 "https://beacon.replaice.co/api/v1/threads?page_size=50" -H "X-BEACON-TOKEN: $(grep ^BEACON_API_TOKEN .env | cut -d= -f2)"`
).toString());
let otpThread = null;
for (let i = 0; i < 10 && !otpThread; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const list = JSON.parse(execSync(
    `curl -s --max-time 10 "https://beacon.replaice.co/api/v1/threads?page_size=50" -H "X-BEACON-TOKEN: $(grep ^BEACON_API_TOKEN .env | cut -d= -f2)"`
  ).toString());
  const rows = (list?.data?.data ?? []);
  otpThread = rows.find(r => r.to?.includes(RECIPIENT) && r.subject?.includes("verification code"));
}
console.log("BEACON otpThread:", otpThread
  ? JSON.stringify({ to: otpThread.to, from: otpThread.from, subject: otpThread.subject, ses: otpThread.thread_id ? "DISPATCHED" : "NO-SES-ID", at: otpThread.created_at })
  : "NOT FOUND in Beacon thread list");

// ---------- complete login via Redis-read code ----------
let code = "NOTFOUND";
for (let i = 0; i < 20; i++) {
  try {
    code = execSync(`node --env-file=.env scripts/janavi/get-login-code.mjs ${RECIPIENT} 3000`, { timeout: 8000 }).toString().trim();
    if (code && code !== "NOTFOUND") break;
  } catch {}
  await new Promise(r => setTimeout(r, 2000));
}
console.log("redis code:", code === "NOTFOUND" ? "NOTFOUND" : "OK(" + code.length + " chars)");
await page.locator("#code").fill(code);
const verifyResPromise = page.waitForResponse(r => r.url().includes("/api/auth/verify-code"), { timeout: 30000 }).catch(() => null);
await page.getByRole("button", { name: "Verify" }).click();
const vr = await verifyResPromise;
if (vr) console.log("VERIFY response:", vr.status(), (await vr.text().catch(() => "")).slice(0, 120));
let landed = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const s = await (await page.request.get("http://localhost:3000/api/auth/session")).json().catch(() => null);
  if (s?.user?.email === RECIPIENT) { landed = page.url(); break; }
}
console.log("LOGIN:", landed ? "AUTHENTICATED — landed on " + landed : "FAILED");
await page.screenshot({ path: "docs/testing/screenshots/after-login.png" });

// ---------- mobile ----------
const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const mpage = await mctx.newPage();
mpage.on("console", m => { if (m.type() === "error") errors.push("[mobile] " + m.text().slice(0, 110)); });
await mpage.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
const mNoHScroll = await mpage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
console.log("CHECK mobile noHorizontalScroll:", mNoHScroll);
await mpage.screenshot({ path: "docs/testing/screenshots/login-mobile.png" });

console.log("console errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
