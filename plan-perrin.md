# Perrin's Section Plan — AI Chatbot + Triage

**Owner:** Perrin · BrainySG (DSTA BrainHack 2026)
**Scope:** AI chatbot (Brainy), photo interpretation, triage logic, auto task-card generation.

---

## Decisions (locked)

- **LLM provider:** Keep OpenRouter / Nemotron (`nvidia/nemotron-3-super-120b-a12b:free`) — already wired in `backend/lib/llm.go`, lowest friction, matches current `.env`. (Plan doc mentions gpt-oss-120b, but we build against what works.)
- **Vision model:** For the photo endpoint, pick a vision-capable OpenRouter model separately (Nemotron text model can't see images). To confirm at build time.

---

## Current State

### Done ✅
- `backend/lib/llm.go` — OpenAI-compatible client, Brainy system prompt, in-memory session history (system prompt + last 20 turns), basic error handling.
- `backend/handler/chat.go` + `POST /api/chat` (registered in `main.go`) — functional.
- Frontend: `Chat.jsx`, `ChatInput.jsx`, `BrainyMascot.jsx`, `BrainyPanel.jsx`, shelter rich cards, quick-action chips, intro message.

### Key constraint ⚠️
Sanjey's data layer is **empty stubs**:
- `handler/crises.go`, `handler/tasks.go` — empty function bodies.
- `ingestion/nea.go`, `pub.go`, `lta.go`, `moh.go` — package decl only.
- `cache/cache.go` — package decl only.

→ Triage and task-card generation **must run against mock data**, designed behind a small interface so they swap to real endpoints later.

---

## Phase 1 — Chat Robustness (quick win, unblocks later phases)

- [ ] Add **retry logic** to `llm.go` (3 attempts, exponential backoff) for transient HTTP/5xx failures.
- [ ] Add a **structured JSON output helper** in `llm.go` — sends a request expecting JSON and parses into a target struct. Reused by triage + task generation.
- [ ] Confirm OpenRouter free-tier rate limits are tolerable for demo.

## Phase 2 — Photo Interpretation

- [ ] `POST /api/chat/photo` handler — accept multipart image upload (+ optional `session_id`, caption).
- [ ] Send image to a vision-capable OpenRouter model via `llm.go` (base64 data URL in `image_url` content part).
- [ ] Return situation description + recommended actions; append to session history so follow-up text chat has context.
- [ ] Frontend (`ChatInput.jsx` / `Chat.jsx`): camera/file-picker button → preview before send → upload with loading indicator → render AI response.
- [ ] Test fixtures: sample flood/fire/haze photos.

## Phase 3 — Triage Logic (against mock data)

- [ ] New `backend/lib/triage.go`.
- [ ] Define a `DataProvider` interface (weather, floods, haze, dengue, transport) with a **mock implementation** now; real impl wraps Sanjey's endpoints later.
- [ ] Threshold rules:
  - [ ] water level > X% → flood warning
  - [ ] PSI > 100 → haze advisory
  - [ ] dengue cases > X in cluster → health alert
- [ ] Cascade rules:
  - [ ] heavy rain + high water → flood risk
  - [ ] flood at location + nearby MRT → transport disruption
  - [ ] high PSI + dengue cluster → compound health risk
- [ ] Feed triage findings into Brainy's prompt context for richer chat answers.

## Phase 4 — Auto Task-Card Generation

- [ ] LLM produces structured task-card JSON from triage output via the Phase 1 JSON helper.
- [ ] Fields: `title`, `description`, `priority`, `volunteers_needed`, `crisis_id`.
- [ ] POST generated tasks to `/api/tasks` (Sanjey's endpoint) — with a graceful fallback/log since that handler is currently a stub.

## Phase 5 — Polish

- [ ] Keep chat history in-memory for MVP (revisit DB only if needed).
- [ ] Update `test-chat.html` to exercise photo + triage paths.
- [ ] Document the new endpoints in the API contract section of `plan.md`.

---

## Suggested build order
Phase 1 → Phase 2 (photo, self-contained & demos well) → Phase 3 → Phase 4 → Phase 5.

## Coordination notes
- Confirm `/api/chat/photo` contract is acceptable to the team (already listed in API contract table).
- Triage/task-gen output shapes must match Sanjey's `tasks` schema and crisis-type/severity/status enums (still TBD in "Shared / Cross-Cutting").
- Voice (`/api/transcribe`) is James's; it forwards transcribed text into `POST /api/chat`, so no extra work on our side beyond keeping `/api/chat` stable.