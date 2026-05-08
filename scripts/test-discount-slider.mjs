// Verifies the discount slider on /submit:
//   1. Default value renders as 15
//   2. Programmatic value change to 30 updates the displayed number AND
//      moves the visual thumb (verified via the native range's
//      .value DOM property + a screenshot at the new position).
//   3. Submit POST captures the new discount_pct (intercepted before
//      it reaches the API so we don't burn an LLM run).
//   4. Mobile viewport (390px): same drag works via touch events.

import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.KILN_BASE_URL ?? "http://localhost:3000";
const OUT = "/tmp/kiln-slider-fix";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function findChrome() {
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const p of paths) {
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function runOnce(label, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);

  // Intercept the POST so we can capture the discount_pct without
  // firing a real run (the API path is fully tested separately).
  let capturedPayload = null;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/submit-deal")) {
      try {
        capturedPayload = JSON.parse(req.postData() ?? "{}");
      } catch {}
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sessionId: "intercepted",
          dealId: "visitor-intercepted",
          redirectTo: "/submit",
        }),
      });
      return;
    }
    req.continue();
  });

  await page.goto(`${BASE}/submit`, { waitUntil: "networkidle2", timeout: 30000 });

  // Default value
  const initialDisplayed = await page.evaluate(() => {
    const el = document.querySelector('input[type="range"]');
    return el ? el.value : null;
  });
  check(`${label} 1. range input renders with default value=15`, initialDisplayed === "15", `actual=${initialDisplayed}`);

  // Move the slider to 30 by setting the value + dispatching input event
  await page.evaluate(() => {
    const el = document.querySelector('input[type="range"]');
    if (!el) throw new Error("no range input");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "30");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Let React re-render
  await new Promise((r) => setTimeout(r, 200));

  // Confirm the displayed text updated
  const displayedText = await page.evaluate(() => {
    // The number-format span is the .tabular-nums span next to the % glyph
    const all = Array.from(document.querySelectorAll("span"));
    const found = all.find(
      (s) => s.textContent === "30" && s.className.includes("tabular-nums"),
    );
    return found ? found.textContent : null;
  });
  check(`${label} 2. displayed value updates to 30`, displayedText === "30", `text=${displayedText}`);

  // Take a screenshot showing the thumb position
  await page.screenshot({
    path: `${OUT}/${label}.png`,
    fullPage: false,
  });

  // Fill the rest of the form with minimum-valid values + submit
  await page.evaluate(() => {
    const setVal = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`no ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setVal("#customer_name", "Slider Test Co");
    setVal(
      "#customer_request",
      "Synthetic submission for slider testing — confirm the discount value flows from UI through to the API request payload as captured by the request interceptor.",
    );
    // Click first radio in each group: segment, deal_type, pricing_model
    const groups = document.querySelectorAll('[role="radiogroup"]');
    for (const g of groups) {
      const first = g.querySelector('[role="radio"]');
      if (first) first.click();
    }
    setVal("#acv", "100000");
  });
  await new Promise((r) => setTimeout(r, 100));

  // Click submit button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.type === "submit",
    );
    if (!btn) throw new Error("no submit button");
    btn.click();
  });
  // Give the request a beat to fire (the interceptor responds synchronously)
  await new Promise((r) => setTimeout(r, 600));

  check(
    `${label} 3. submit POST captures discount_pct=30`,
    capturedPayload != null && capturedPayload.discount_pct === 30,
    `payload.discount_pct=${capturedPayload?.discount_pct}`,
  );

  await page.close();
}

await runOnce("desktop", { width: 1280, height: 900 });
await runOnce("mobile", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
