import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import { mkdirSync, existsSync, rmSync } from "node:fs";

// Capture "before" screenshots of every visitor-facing surface in the current
// state of the redesign-v2 branch. Saved to /tmp/redesign-before/. The post-
// implementation harness writes /tmp/redesign-comparison/ for diffing.
//
// Surfaces:
//   - Dashboard (/) at desktop 1280 and mobile 390
//   - Pipeline (/pipeline) at desktop 1280 and mobile 390
//   - Deal detail (/deals/<hero>) — idle at 1280 + 390
//   - Deal detail — Mode 1 (running) at 1280
//   - Deal detail — Mode 2 (complete) at 1280 + 390 + tabs cycled

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const HERO_DEAL = "/deals/deal_anthropic_2026q1_expansion";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = "/tmp/redesign-before";

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  // ----- Desktop -----
  const desk = await browser.newPage();
  await desk.setViewport({ width: 1280, height: 1100 });

  await capture(desk, "/", "01-dashboard-desktop.png");
  await capture(desk, "/pipeline", "02-pipeline-desktop.png");
  await capture(desk, HERO_DEAL, "03-deal-idle-desktop.png");

  // Run review → Mode 1 timeline
  await runReview(desk);
  await waitForMode1(desk);
  await sleep(800);
  await desk.screenshot({
    path: `${OUT_DIR}/04-mode1-running-desktop.png`,
    fullPage: false,
  });
  console.log("→ Mode 1 (running) desktop");

  // Mode 2 — verdict appears
  await waitForMode2(desk);
  await sleep(500);
  await desk.screenshot({
    path: `${OUT_DIR}/05-mode2-complete-desktop.png`,
    fullPage: true,
  });
  console.log("→ Mode 2 (complete) desktop fullpage");

  // Cycle through tabs and screenshot each
  for (const tab of ["pricing", "asc606", "redline", "approval", "comms"]) {
    await clickTab(desk, tab);
    await sleep(250);
    await desk.screenshot({
      path: `${OUT_DIR}/06-tab-${tab}-desktop.png`,
      fullPage: false,
    });
    console.log(`→ tab ${tab}`);
  }

  // Verdict close-up
  const verdict = await desk.$("section[aria-label='Deal verdict']");
  if (verdict) {
    await verdict.screenshot({ path: `${OUT_DIR}/07-verdict-card.png` });
    console.log("→ verdict card close-up");
  }

  // Artifacts panel close-up
  const artifacts = await desk.evaluateHandle(() => {
    const els = Array.from(document.querySelectorAll("div"));
    return els.find((d) =>
      d.textContent?.includes("Deal-desk artifacts"),
    );
  });
  if (artifacts) {
    const el = artifacts as ElementHandle<HTMLElement>;
    if (await el.evaluate((n) => !!n)) {
      await el.screenshot({ path: `${OUT_DIR}/08-artifacts-panel.png` });
      console.log("→ artifacts panel close-up");
    }
  }

  await desk.close();

  // ----- Mobile -----
  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844, isMobile: true });

  await capture(mob, "/", "10-dashboard-mobile.png", true);
  await capture(mob, "/pipeline", "11-pipeline-mobile.png", true);
  await capture(mob, HERO_DEAL, "12-deal-idle-mobile.png", true);

  await runReview(mob);
  await waitForMode2(mob);
  await sleep(600);
  await mob.screenshot({
    path: `${OUT_DIR}/13-mode2-complete-mobile.png`,
    fullPage: true,
  });
  console.log("→ Mode 2 mobile fullpage");

  await mob.close();
  await browser.close();
  console.log(`\nScreenshots saved to ${OUT_DIR}/`);
}

async function capture(
  page: Page,
  path: string,
  filename: string,
  fullPage = false,
) {
  await page.goto(`${APP_URL}${path}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });
  await sleep(300);
  await page.screenshot({ path: `${OUT_DIR}/${filename}`, fullPage });
  console.log(`→ ${filename}`);
}

async function runReview(page: Page) {
  const handle = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) => b.textContent?.trim().match(/^Run review/i));
  });
  if (!handle) throw new Error("Run review button not found");
  await (handle as ElementHandle<HTMLButtonElement>).click();
}

async function waitForMode1(page: Page) {
  await page.waitForFunction(
    () => {
      const labels = Array.from(document.querySelectorAll("span"))
        .map((s) => s.textContent?.trim())
        .filter(Boolean) as string[];
      return labels.includes("Running") || labels.includes("Complete");
    },
    { timeout: 30_000 },
  );
}

async function waitForMode2(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("h2,div"))
        .map((d) => d.textContent ?? "")
        .some((t) => t.startsWith("Verdict")),
    { timeout: 180_000, polling: 500 },
  );
}

async function clickTab(page: Page, value: string) {
  const handle = await page.evaluateHandle((v) => {
    const tabs = Array.from(
      document.querySelectorAll("[data-slot='tabs-trigger']"),
    );
    return tabs.find(
      (t) => (t.getAttribute("data-value") ?? "").toLowerCase() === v ||
            t.textContent?.trim().toLowerCase().startsWith(v),
    );
  }, value);
  if (!handle) return;
  const el = handle as ElementHandle<HTMLElement>;
  if (await el.evaluate((n) => !!n)) await el.click();
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
