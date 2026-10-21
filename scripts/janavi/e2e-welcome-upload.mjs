import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const email = `welcome-upload+${Date.now()}@janavy.test`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 110)); });
page.on("requestfailed", r => { const u = r.url(); if (!u.includes("posthog") && !u.includes("google")) errors.push("REQFAIL " + u.slice(0, 90)); });

// fresh signup through the real UI
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator("#email").fill(email);
await page.getByRole("button", { name: "Continue with Email" }).click();
await page.waitForURL(/auth\/email/, { timeout: 60000 });
const code = execSync(`node --env-file=.env scripts/janavi/get-login-code.mjs ${email} 60000`, { timeout: 70000 }).toString().trim();
await page.locator("#code").waitFor({ state: "visible", timeout: 30000 });
await page.locator("#code").fill(code);
await page.getByRole("button", { name: "Verify" }).click();
for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); const s = await (await page.request.get("http://localhost:3000/api/auth/session")).json().catch(() => null); if (s?.user?.email) break; }

// onboarding: select Agreement → SOW → upload
await page.goto("http://localhost:3000/welcome?type=select", { waitUntil: "networkidle" });
await page.getByText("What would you like to share securely?").waitFor({ timeout: 30000 });
await page.getByText("Agreement", { exact: true }).first().click();
await page.getByText("Statement of Work").first().waitFor({ timeout: 15000 });
await page.getByText("Statement of Work").first().click();
await page.waitForURL(/type=agreement&agreementType=SOW/, { timeout: 30000 }).catch(() => {});
console.log("STEP url:", page.url());

// upload a real PDF through the file input
const input = page.locator("input[type=file]").first();
await input.waitFor({ state: "attached", timeout: 30000 });
await input.setInputFiles("tests/e2e/fixtures/qa-3page.pdf");
// click the confirm/upload button (label varies — take the primary action)
const goBtn = page.getByRole("button", { name: /upload|continue|get started/i }).first();
await goBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
await goBtn.click().catch(() => {});
await page.screenshot({ path: "docs/testing/screenshots/welcome-agreement-upload.png", fullPage: false });

// wait for progression out of the upload screen
await page.waitForURL(u => !u.toString().includes("type=agreement"), { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log("AFTER url:", page.url());
const stillOnUpload = await page.getByText("Upload your agreement", { exact: false }).isVisible().catch(() => false);
console.log("STILL on upload screen:", stillOnUpload);
const bodyHead = await page.evaluate(() => document.body.innerText.slice(0, 220));
console.log("BODY:", JSON.stringify(bodyHead));
console.log("console errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
