// Headless-browser driver for the BrainySG frontend.
//
// Drives the core flow end to end: demo login -> Map -> click a crisis marker ->
// Crisis Detail (LLM triage findings + AI tasks) -> Tasks page. Writes
// screenshots to /tmp/shots and prints assertions.
//
// IMPORTANT: Playwright lives in frontend/node_modules, and Node resolves bare
// imports from the script's own directory upward — so this file must be RUN FROM
// the frontend/ directory. The SKILL.md copies it in, runs it, then removes it.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const shot = "/tmp/shots";
mkdirSync(shot, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  geolocation: { latitude: 1.3521, longitude: 103.8198 }, // SG centre; avoids geolocation stall
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text()); });
page.on("requestfailed", (r) => console.log("REQ FAIL:", r.url(), r.failure()?.errorText));
const log = (...a) => console.log("•", ...a);

// 1) Login via a one-click demo preset (self-registers + navigates to /home).
//    The manual email/password form goes to a role screen instead, so use a preset.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.click('button[title*="volunteer1@brainhack.sg"]');
await page.waitForURL(/\/home/, { timeout: 15000 });
log("logged in ->", page.url());

// 2) Map: wait for crisis markers (Leaflet divIcons), screenshot.
await page.goto(`${BASE}/map`, { waitUntil: "networkidle" });
await page.waitForSelector(".leaflet-marker-icon", { timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shot}/1-map.png` });
log("map markers =", await page.locator(".leaflet-marker-icon").count());

// 3) Click a crisis marker -> navigates to /crises/:id.
await page.locator(".leaflet-marker-icon").first().click();
await page.waitForURL(/\/crises\//, { timeout: 10000 });
log("navigated to", page.url());

// 4) Wait for the LLM-backed triage to render, then full-page screenshot.
await page.getByText("Situation assessment").waitFor({ timeout: 20000 });
await page.waitForFunction(
  () => !document.body.innerText.includes("Brainy is analysing"),
  { timeout: 90000 },
).catch(() => log("triage still loading after 90s"));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shot}/2-crisis-detail.png`, fullPage: true });
const body = await page.locator("body").innerText();
log("detail has 'Suggested volunteer tasks':", body.includes("Suggested volunteer tasks"));
log("detail has 'AI generated':", body.includes("AI generated"));

// 5) Tasks page (regression: must not request /api/crises/undefined).
await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shot}/3-tasks.png`, fullPage: true });
log("tasks rendered");

await browser.close();
console.log("DONE — screenshots in /tmp/shots");
