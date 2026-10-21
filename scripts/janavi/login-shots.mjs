import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const errors = [];
for (const [name, vp] of [["desktop", {width:1440,height:900}], ["tablet", {width:834,height:1112}], ["mobile", {width:375,height:812}]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(`[${name}] ${m.text().slice(0,120)}`); });
  page.on("requestfailed", r => errors.push(`[${name}] REQFAIL ${r.url().slice(0,100)}`));
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: `docs/testing/screenshots/login-${name}.png`, fullPage: false });
  if (name === "desktop") {
    const checks = {
      title: await page.title(),
      welcome: await page.getByText("Welcome to Janavy").isVisible(),
      headline: await page.getByText("Share with Confidence.").isVisible(),
      feature1: await page.getByText("Prevent Data Leaks").isVisible(),
      built: await page.getByText("BUILT FOR CONFIDENTIAL INFORMATION").isVisible(),
      terms: await page.locator('a[href="https://janavy.com/terms"]').isVisible(),
      privacy: await page.locator('a[href="https://janavy.com/privacy"]').isVisible(),
      doc: await page.getByText("Strategic Partnership Agreement").isVisible(),
      noPapermark: !(await page.getByText("Papermark").count()),
      noMunnix: !(await page.getByText("Münnix").count()),
      noGoogle: !(await page.getByText("Continue with Google").count()),
    };
    console.log(JSON.stringify(checks, null, 1));
  }
  await ctx.close();
}
console.log("console/request errors:", errors.length ? errors.slice(0,8) : "none");
await browser.close();
