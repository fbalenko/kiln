import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// End-to-end verification of the artifacts panel:
//   1. Open the Anthropic deal page
//   2. Click "Run review" → wait for the synthesis card → wait for the panel
//   3. Click each of the 5 download buttons
//   4. Verify each file appears in the configured download dir with the
//      expected MIME-driven extension and a non-zero size

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DEAL_PATH = "/deals/deal_anthropic_2026q1_expansion";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DOWNLOAD_DIR = "/tmp/kiln-artifacts-ui";

const EXPECTED = [
  { type: "one-pager",      label: "Approval one-pager", suffix: "approval-one-pager.pdf" },
  { type: "order-form",     label: "Order form",         suffix: "order-form.pdf" },
  { type: "redlined-msa",   label: "Redlined MSA",       suffix: "redlined-msa.docx" },
  { type: "ae-email",       label: "AE email",           suffix: "ae-email.eml" },
  { type: "customer-email", label: "Customer email",     suffix: "customer-email.eml" },
];

async function main() {
  // Fresh download dir each run so we can detect new files.
  if (existsSync(DOWNLOAD_DIR)) {
    const rimraf = (await import("node:fs")).rmSync;
    rimraf(DOWNLOAD_DIR, { recursive: true, force: true });
  }
  mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const client = await page.target().createCDPSession();
  await client.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });

  const url = `${APP_URL}${DEAL_PATH}`;
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

  // Click "Run review"
  await page.waitForSelector("button");
  const runButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((b) => b.textContent?.trim().match(/^Run review/i));
  });
  if (!runButton) throw new Error("Run review button not found");
  await (runButton as puppeteer.ElementHandle<HTMLButtonElement>).click();
  console.log("→ clicked Run review");

  // Wait for the synthesis card → triggers ArtifactsPanel mount.
  // Cached replays pace to the original tape (~60–90s), so allow headroom.
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("div")).some((d) =>
        d.textContent?.includes("Executive synthesis"),
      ),
    { timeout: 180_000, polling: 500 },
  );
  console.log("→ synthesis rendered");

  await page.waitForSelector("[data-artifact-tile]", { timeout: 10_000 });
  // Small settle so the buttons are fully interactive before the first click.
  await sleep(300);
  console.log("→ artifacts panel mounted");

  // Click each download button in order
  const results: { label: string; ok: boolean; bytes: number; file?: string }[] = [];
  for (const target of EXPECTED) {
    const before = listDir(DOWNLOAD_DIR);
    const handle = await page.$(
      `button[data-artifact-tile="${target.type}"]`,
    );
    if (!handle) {
      results.push({ label: target.label, ok: false, bytes: 0 });
      continue;
    }
    await (handle as puppeteer.ElementHandle<HTMLButtonElement>).click();

    // Brief pause so the download actually starts before we begin polling
    // — and so the next click doesn't land before this download settles.
    await sleep(200);

    // Poll for a new, non-temp file in the download dir (Chrome lays down
    // .crdownload first, then renames)
    const newFile = await waitForNewFile(before, DOWNLOAD_DIR, target.suffix);
    if (!newFile) {
      results.push({ label: target.label, ok: false, bytes: 0 });
      continue;
    }
    const stat = statSync(join(DOWNLOAD_DIR, newFile));
    results.push({
      label: target.label,
      ok: stat.size > 100,
      bytes: stat.size,
      file: newFile,
    });
    console.log(`  ✓ ${target.label}: ${newFile} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  // Capture a screenshot of the full panel for visual sanity-check. The
  // outer container is the grid's parent — walk up two levels from any tile.
  const tile = await page.$("[data-artifact-tile]");
  if (tile) {
    const panel = await tile.evaluateHandle(
      (el) => (el as HTMLElement).parentElement?.parentElement ?? null,
    );
    if (panel) {
      await (panel as puppeteer.ElementHandle<Element>).screenshot({
        path: join(DOWNLOAD_DIR, "panel.png"),
      });
      console.log("→ panel screenshot saved");
    }
  }

  await browser.close();

  console.log("\n=== Results ===");
  for (const r of results) {
    const status = r.ok ? "OK " : "FAIL";
    console.log(`${status}  ${r.label.padEnd(22)} ${r.file ?? "(no file)"} ${r.bytes}b`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
}

function listDir(dir: string): Set<string> {
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir));
}

async function waitForNewFile(
  before: Set<string>,
  dir: string,
  expectedSuffix: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  const fs = require("node:fs") as typeof import("node:fs");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!fs.existsSync(dir)) {
      await sleep(80);
      continue;
    }
    const now = fs.readdirSync(dir);
    for (const f of now) {
      if (before.has(f)) continue;
      if (f.endsWith(".crdownload")) continue;
      if (f.endsWith(expectedSuffix)) return f;
    }
    await sleep(80);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
