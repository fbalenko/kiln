// Visual harness for the visitor flow. Captures a few screenshots
// for sanity-checking the layout at desktop and mobile widths. Does
// not click "submit" — that would trigger the LLM pipeline. Just
// verifies the form, the dashboard CTA placement, the pipeline CTA,
// and the sidebar nav addition.

import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.KILN_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = "/tmp/kiln-phase7c-visual";
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const c of candidates) {
    try {
      execSync(`test -x "${c}"`);
      return c;
    } catch {}
  }
  throw new Error("No Chrome / Chromium found");
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
});

async function shoot(label, viewport, url) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const res = await page.goto(`${BASE}${url}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  if (!res || !res.ok()) {
    console.log(`[visual] ${label} HTTP=${res?.status() ?? "n/a"}`);
  }
  await new Promise((r) => setTimeout(r, 700));
  const path = `${OUT_DIR}/${label}.png`;
  await page.screenshot({ path, fullPage: true });
  await page.close();
  console.log(`[visual] ${label} → ${path}`);
}

await shoot("01-dashboard-desktop", { width: 1280, height: 900 }, "/");
await shoot("02-pipeline-desktop", { width: 1280, height: 900 }, "/pipeline");
await shoot("03-submit-desktop", { width: 1280, height: 900 }, "/submit");
await shoot(
  "04-submit-mobile",
  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "/submit",
);
await shoot(
  "05-dashboard-mobile",
  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "/",
);

await browser.close();
console.log("[visual] done");
