// Verifies the homepage renders and the activity feed is interactive:
//   1. /  HTTP 200
//   2. No "Event handlers cannot be passed" error in browser console
//   3. The activity-feed section renders rows
//   4. Clicking a row navigates to the deal page

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";

const BASE = process.env.KILN_BASE_URL ?? "http://localhost:3000";

function findChrome() {
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    try {
      execSync(`test -x "${p}"`);
      return p;
    } catch {}
  }
  throw new Error("Chrome not found");
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
});

const errors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console] ${msg.text()}`);
});

await page.setViewport({ width: 1280, height: 900 });
const res = await page.goto(`${BASE}/?fresh=${Date.now()}`, {
  waitUntil: "networkidle2",
  timeout: 30000,
});
const status = res?.status() ?? 0;
console.log(`[1] / status=${status} ${status === 200 ? "PASS" : "FAIL"}`);

const eventHandlerErrors = errors.filter((e) =>
  /Event handlers cannot be passed/i.test(e),
);
console.log(
  `[2] no "event handlers" error in console — ${eventHandlerErrors.length === 0 ? "PASS" : "FAIL"} (saw ${errors.length} total errors)`,
);
if (eventHandlerErrors.length > 0) {
  for (const e of eventHandlerErrors) console.log("    →", e.slice(0, 200));
}

const activityRows = await page.$$('section[aria-label="Recent activity"] li');
console.log(
  `[3] activity feed renders rows (got ${activityRows.length}) — ${activityRows.length > 0 ? "PASS" : "FAIL"}`,
);

if (activityRows.length > 0) {
  const firstHref = await page.evaluate(() => {
    const link = document.querySelector(
      'section[aria-label="Recent activity"] li a',
    );
    return link?.getAttribute("href") ?? null;
  });
  console.log(`[4a] first row links to ${firstHref}`);
  // Click and confirm navigation
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }),
    page.click('section[aria-label="Recent activity"] li a'),
  ]);
  const landed = page.url();
  const navigated = landed.includes("/deals/");
  console.log(
    `[4b] click navigates to /deals/* (${landed.replace(BASE, "")}) — ${navigated ? "PASS" : "FAIL"}`,
  );
}

await browser.close();

const allOk =
  status === 200 && eventHandlerErrors.length === 0 && activityRows.length > 0;
process.exit(allOk ? 0 : 1);
