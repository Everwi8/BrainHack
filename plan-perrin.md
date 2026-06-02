# Perrin's Section Plan — AI Chatbot + Triage

**Owner:** Perrin · BrainySG (DSTA BrainHack 2026)
**Scope:** AI chatbot (Brainy), photo interpretation, triage logic, auto task-card generation.

---

## Decisions (locked)

- **LLM provider:** Keep OpenRouter / Nemotron (`nvidia/nemotron-3-super-120b-a12b:free`) — already wired in `backend/lib/llm.go`, lowest friction, matches current `.env`. (Plan doc mentions gpt-oss-120b, but we build against what works.)
- **Vision model:** ✅ Confirmed `nvidia/nemotron-nano-12b-v2-vl:free` — free, vision-capable, same NVIDIA family/endpoint as the text model (zero extra config), built for document/OCR + multi-image understanding. Configurable via `LLM_VISION_MODEL` env var (defaults to this).
- **Two models, not one:** Text stays on the 120B; photos go to the 12B VL. Rationale: the 120B gives better reasoning + SG-local knowledge for chat, and per-model free-tier limits (~20 rpm / 200 day) mean **separate models = separate quota buckets** = double headroom for the demo. Collapsing to the single VL model is a one-line env change (`LLM_MODEL=...-vl:free`) if we ever want it, at the cost of weaker text answers and a shared rate bucket.
- **Photo → answer pipeline:** ✅ **Hybrid (built).** The VL model emits a structured `PhotoObservation` (crisis_type, severity, observations, hazards, people_present) — facts only, explicitly told not to invent names/dates — and the 120B text model turns that into Brainy's user-facing answer with full session history + persona. 2 calls/photo (both models light up on the OpenRouter dashboard). Findings are stored in history, so text follow-ups recall the assessment. Falls back to a single direct-vision prose call if JSON extraction can't be parsed. Motivation: the direct-vision path hallucinated specifics (e.g. invented "TG Junction / online since 1978 / 120m roof height" on a fire photo); structured extraction fixes this and the `PhotoObservation` type feeds straight into Phase 3 (triage) / Phase 4 (task cards).

---

## Current State

### Done ✅
- `backend/lib/llm.go` — OpenAI-compatible client, Brainy system prompt, in-memory session history (system prompt + last 20 turns), basic error handling.
- `backend/handler/chat.go` + `POST /api/chat` (registered in `main.go`) — functional.
- Frontend: `Chat.jsx`, `ChatInput.jsx`, `BrainyMascot.jsx`, `BrainyPanel.jsx`, shelter rich cards, quick-action chips, intro message.
- **Phase 1 (chat robustness):** retry w/ exponential backoff on 429/5xx/network (shared `postCompletion` transport), `ChatJSON` structured-output helper (+ `stripJSONFences`).
- **Phase 2 (photo interpretation):** `VisionLLM` (base64 data-URL → VL model), `POST /api/chat/photo` handler (multipart, 8 MB cap, content-sniff validation), session-history trace so text follow-ups keep photo context. Frontend: camera→preview→send→render wired in `ChatInput.jsx`/`Chat.jsx`; `api.postForm` added. `test-chat.html` updated to exercise the photo path. **Verified end-to-end** against live OpenRouter (flood photo → correct severity/advice; follow-up text recalled the photo).

### Key constraint — RESOLVED ✅
Sanjey's data layer is now **live** (was empty stubs). It landed with a different
shape than the plan assumed: instead of granular `/api/data/*` endpoints, his
ingestion (`ingestion/nea.go`, `pub.go`, `lta.go`) aggregates every signal into
the **crises table** (`GET /api/crises` / `lib.DB.GetCrises`), and severity uses
`low/medium/high/critical` (not our `low/warning/critical`).

Our parts are wired to it:
- `lib/triage_live.go` — `CrisisDataProvider` adapts crisis rows back into the
  per-signal readings the triage rules expect (severity→metric mapping, value
  parsing, source split for flood vs. weather). Carries the real `crisis_id`.
- `main.go` calls `lib.SelectDataProvider()` — auto-uses live data when
  `SUPABASE_URL` is set, else `MockProvider` (offline/demo). Override with
  `TRIAGE_PROVIDER=live|mock`. Live fetch errors fall back to mock so chat/triage
  never break.
- `lib/taskgen.go` — `ForwardTasks` now writes real task rows via `lib.DB`
  (only for cards carrying a real `crisis_id`), gated behind `FORWARD_TASKS=1`
  (default log-only, so demo runs don't spam the shared DB).

---

## Phase 1 — Chat Robustness (quick win, unblocks later phases) ✅

- [x] Add **retry logic** to `llm.go` (3 attempts, exponential backoff) for transient HTTP/5xx failures. → shared `postCompletion`, retries 429/5xx/network at 500ms→1s→2s.
- [x] Add a **structured JSON output helper** in `llm.go` — sends a request expecting JSON and parses into a target struct. Reused by triage + task generation. → `ChatJSON` + `stripJSONFences`.
- [x] Confirm OpenRouter free-tier rate limits are tolerable for demo. → ~20 rpm / 200 day per model; retry logic absorbs occasional 429s. OK for demo.

## Phase 2 — Photo Interpretation ✅

- [x] `POST /api/chat/photo` handler — accept multipart image upload (+ optional `session_id`, caption). → `handler/photo.go`, 8 MB cap, sniffs real content-type.
- [x] Send image to a vision-capable OpenRouter model via `llm.go` (base64 data URL in `image_url` content part). → `VisionLLM`, model `nvidia/nemotron-nano-12b-v2-vl:free`.
- [x] Return situation description + recommended actions; append to session history so follow-up text chat has context. → text-only trace appended; verified follow-up recall.
- [x] Frontend (`ChatInput.jsx` / `Chat.jsx`): camera/file-picker button → preview before send → upload with loading indicator → render AI response. → `api.postForm` added.
- [ ] Test fixtures: sample flood/fire/haze photos. → still TODO (tested with a synthetic flood image, not committed).

## Phase 3 — Triage Logic (against mock data) ✅

- [x] New `backend/lib/triage.go` (+ `triage_mock.go`, `triage_test.go`).
- [x] Define a `DataProvider` interface (weather, floods, haze, dengue, transport) with a **mock implementation** now; real impl wraps Sanjey's endpoints later via `SetDataProvider`. → `MockProvider` ships demo-tuned SG readings.
- [x] Threshold rules (centralised consts):
  - [x] water level ≥ 75% → flood warning, ≥ 90% → critical
  - [x] PSI ≥ 100 → haze advisory, ≥ 200 → critical
  - [x] dengue cases ≥ 10 → cluster warning, ≥ 50 → critical
  - [x] transport status delayed → warning, disrupted → critical
- [x] Cascade rules:
  - [x] heavy rain + high water **in same area** → flash-flood risk (critical)
  - [x] flood within 1.5 km of an MRT station → transport disruption (warning)
  - [x] PSI ≥ 100 overlapping a dengue cluster → compound health risk (warning)
- [x] Feed triage findings into Brainy's prompt context — `currentTriageContext()` injects a live situational-awareness system message when a chat session starts (fails open: empty/skipped if triage errors).
- [x] `GET /api/triage` endpoint (`handler/triage.go`, registered in `main.go`) returns the sorted `TriageReport` — testable/demoable. Verified: mock data trips all four threshold types + all three cascades, sorted critical-first.
- [x] **Live in the UI:** the chat's "Situation" quick chip (`Chat.jsx → showSituation`) fetches `GET /api/triage` and renders the top 3 findings as `InlineCrisisCard`s — real triage data driving the chat (graceful fallback to a canned card if the backend is down).

## Phase 4 — Auto Task-Card Generation ✅

- [x] LLM produces structured task-card JSON from triage output via the Phase 1 `ChatJSON` helper. → `backend/lib/taskgen.go`, `GenerateTaskCards` / `GenerateTasksFromTriage`.
- [x] Fields: `title`, `description`, `priority`, `volunteers_needed`, `crisis_id` (+ `type`, `location` for the map/group chat).
- [x] POST generated tasks to `/api/tasks` — `ForwardTasks` best-effort POSTs to `TASKS_SINK_URL` (log-only while Sanjey's handler is a stub).
- [x] `GET /api/triage/tasks` endpoint runs triage → generates cards → forwards → returns them. **Verified live:** 6 distinct LLM-authored cards in ~15s.
- [x] Robustness: findings deduped by location + capped to 6; deterministic action-oriented fallback guarantees clean cards if the LLM call fails (verified — fallback also produces demo-ready cards).

### LLM gotcha (resolved) ⚠️
`nvidia/nemotron-3-super-120b` is a **reasoning model** — left unconstrained it streamed its entire chain-of-thought into the content field, which (a) made task-gen take minutes / hit the read timeout, and (b) when capped at `max_tokens`, consumed the budget thinking and truncated the JSON. Fixes in `llm.go`: disable reasoning at the API level (`reasoning: {enabled:false}` on every request) + `detailed thinking off` system directive on `ChatJSON` + `max_tokens` 2048 + robust `extractJSON` (handles fences/surrounding prose) + `LLM_TIMEOUT_SECONDS` env knob. Reasoning-off also sped up plain chat (~4s).

## Phase 5 — Polish

- [x] Keep chat history in-memory for MVP (revisit DB only if needed). → `sessionStore sync.Map` in `llm.go`, system prompt + last 20 turns per session.
- [x] Update `test-chat.html` to exercise photo + triage paths. → photo path done; added 🔎 Triage + 📋 Generate Tasks toolbar buttons that render findings/task cards.
- [x] Document the new endpoints in the API contract section of `plan.md`. → `/api/chat/photo` already in the contract table.

---

## Suggested build order
Phase 1 → Phase 2 (photo, self-contained & demos well) → Phase 3 → Phase 4 → Phase 5.

## Coordination notes
- Confirm `/api/chat/photo` contract is acceptable to the team (already listed in API contract table).
- Triage/task-gen output shapes must match Sanjey's `tasks` schema and crisis-type/severity/status enums (still TBD in "Shared / Cross-Cutting").
- Voice (`/api/transcribe`) is James's; it forwards transcribed text into `POST /api/chat`, so no extra work on our side beyond keeping `/api/chat` stable.