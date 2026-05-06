import puppeteer, { type ElementHandle } from "puppeteer-core";
import { mkdirSync, existsSync, rmSync } from "node:fs";

// Visual verification of the deal-detail restyle. Captures:
//   - Mode 1 (running) screenshot at desktop width
//   - Mode 2 (complete) screenshot at desktop width
//   - Mode 2 at mobile width (390x844)
//   - Verdict card close-up
//   - Audit log expanded
//   - Tab switch (Redline tab) close-up

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DEAL_PATH = "/deals/deal_anthropic_2026q1_expansion";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = "/tmp/kiln-restyle";

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  // ---- Desktop run ----
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1100 });

  await page.goto(`${APP_URL}${DEAL_PATH}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  // Click "Run review"
  const runHandle = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) => b.textContent?.trim().match(/^Run review/i));
  });
  if (!runHandle) throw new Error("Run review button not found");
  await (runHandle as ElementHandle<HTMLButtonElement>).click();
  console.log("→ clicked Run review");

  // Mode 1 — wait until at least one agent card is "Running" or "Complete",
  // then snap. This proves the timeline is the dominant surface.
  await page.waitForFunction(
    () => {
      const labels = Array.from(document.querySelectorAll("span"))
        .map((s) => s.textContent?.trim())
        .filter(Boolean) as string[];
      return labels.includes("Running") || labels.includes("Complete");
    },
    { timeout: 30_000 },
  );
  await sleep(800); // let the substep tape tick a few rows
  await page.screenshot({ path: `${OUT_DIR}/mode1-desktop.png`, fullPage: false });
  console.log("→ Mode 1 screenshot");

  // Mode 2 — wait for synthesis (the trigger to flip layouts).
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("h2,div"))
        .map((d) => d.textContent ?? "")
        .some((t) => t.startsWith("Verdict")),
    { timeout: 180_000, polling: 500 },
  );
  console.log("→ Mode 2 (verdict card visible)");

  // Let the verdict tiles + tabs settle.
  await sleep(500);
  await page.screenshot({ path: `${OUT_DIR}/mode2-desktop.png`, fullPage: true });
  console.log("→ Mode 2 desktop screenshot");

  // Click the Redline tab
  const redlineTab = await page.evaluateHandle(() => {
    const tabs = Array.from(
      document.querySelectorAll("[data-slot='tabs-trigger']"),
    );
    return tabs.find((t) => t.textContent?.trim() === "Redline");
  });
  if (redlineTab) {
    await (redlineTab as ElementHandle<HTMLElement>).click();
    await sleep(300);
    console.log("→ clicked Redline tab");
  }

  // Click "View audit log"
  const auditButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) => b.textContent?.trim().includes("View audit log"));
  });
  if (auditButton) {
    await (auditButton as ElementHandle<HTMLButtonElement>).click();
    await sleep(500);
    console.log("→ expanded audit log");
  }

  // Click "View reasoning trace" to verify expand still works
  const traceButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) =>
      b.textContent?.trim().includes("View reasoning trace"),
    );
  });
  if (traceButton) {
    await (traceButton as ElementHandle<HTMLButtonElement>).click();
    await sleep(400);
    console.log("→ expanded reasoning trace");
  }

  await page.screenshot({
    path: `${OUT_DIR}/mode2-desktop-everything-open.png`,
    fullPage: true,
  });

  // Verdict card close-up
  const verdict = await page.$("section[aria-label='Deal verdict']");
  if (verdict) {
    await verdict.screenshot({ path: `${OUT_DIR}/verdict-card.png` });
    console.log("→ verdict card close-up");
  }

  await page.close();

  // ---- Mobile run ----
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true });
  await mobile.goto(`${APP_URL}${DEAL_PATH}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  const mobileRun = await mobile.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) => b.textContent?.trim().match(/^Run review/i));
  });
  if (mobileRun) {
    await (mobileRun as ElementHandle<HTMLButtonElement>).click();
    await mobile.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("h2,div"))
          .map((d) => d.textContent ?? "")
          .some((t) => t.startsWith("Verdict")),
      { timeout: 180_000, polling: 500 },
    );
    await sleep(600);
    await mobile.screenshot({
      path: `${OUT_DIR}/mode2-mobile.png`,
      fullPage: true,
    });
    console.log("→ Mode 2 mobile screenshot");
  }

  await browser.close();
  console.log("\n=== Output ===");
  console.log(`Screenshots in ${OUT_DIR}/`);
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
