---
name: run-frontend-e2e
description: Launch and drive the BrainySG frontend in a headless browser (Playwright + Chromium) to verify the core flow — demo login, Map, click a crisis marker, Crisis Detail with LLM triage findings + AI tasks, and the Tasks page. Use when asked to run/screenshot the app or confirm the crisis flow works.
---

# Run & verify the BrainySG frontend (headless browser)

Drives the real app as a user would: logs in, opens the map, clicks a crisis
marker, and confirms the Crisis Detail page renders Brainy's LLM triage analysis
(situation-assessment findings + AI-generated volunteer tasks). Also checks the
Tasks page loads without the `/api/crises/undefined` regression.

## Prerequisites

1. **Backend running on :8080** with a working `LLM_API_KEY` (OpenAI). The crisis
   detail page calls `GET /api/crises/:id/triage`, which uses the LLM to generate
   tasks. Verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/health` → `200`.
2. **Demo data** (so the seeded crises exist). Switch if needed:
   `curl -s -X POST http://localhost:8080/api/admin/data-source -H 'Content-Type: application/json' -d '{"mode":"demo"}'`
3. **Playwright + Chromium** (already a devDependency). If missing:
   `cd frontend && npm i -D playwright && npx playwright install chromium`

## Steps

```bash
cd frontend

# 1. Start the dev server (Vite). It binds 5173, or the next free port.
#    Check the log for the actual URL.
npm run dev > /tmp/vite.log 2>&1 &
sleep 4 && grep -m1 "Local:" /tmp/vite.log     # e.g. http://localhost:5173/

# 2. Drive it. The driver MUST run from frontend/ so Node resolves
#    playwright from frontend/node_modules. Copy it in, run, remove.
cp ../.claude/skills/run-frontend-e2e/driver.mjs ./_e2e.mjs
# If Vite chose a port other than 5173, pass it: BASE_URL=http://localhost:5174
node _e2e.mjs
rm -f ./_e2e.mjs
```

## What to check

- The driver prints `logged in`, the marker count, the `/crises/:id` URL it
  navigated to, and `detail has 'Suggested volunteer tasks': true` /
  `'AI generated': true`.
- **Look at the screenshots** in `/tmp/shots/` (read them):
  - `1-map.png` — crisis markers on the map
  - `2-crisis-detail.png` — header severity badge, Brainy's Brief, **Situation
    assessment** findings (incl. cascade), **Suggested volunteer tasks** (capped at 6)
  - `3-tasks.png` — Tasks page (empty state is fine; must NOT show "Crisis not found")

## Gotchas (learned the hard way)

- **Login:** the email/password form goes to a *role-selection* screen, not into
  the app. Use a one-click demo **preset** button — `button[title*="volunteer1@brainhack.sg"]`
  — which self-registers and navigates to `/home`.
- **Driver location:** running it from `/tmp` or the skill dir fails with
  `ERR_MODULE_NOT_FOUND: playwright` — Node resolves bare imports from the file's
  own directory upward, and playwright is only in `frontend/node_modules`.
- **Don't `pkill -f vite`** to stop a server — it kills *every* Vite instance,
  including ones the user is running. Kill by PID instead.
- **Geolocation:** the map calls `navigator.geolocation`; the driver grants it +
  sets SG centre so it doesn't stall in headless mode.
