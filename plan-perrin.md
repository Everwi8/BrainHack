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

### Key constraint ⚠️
Sanjey's data layer is **empty stubs**:
- `handler/crises.go`, `handler/tasks.go` — empty function bodies.
- `ingestion/nea.go`, `pub.go`, `lta.go`, `moh.go` — package decl only.
- `cache/cache.go` — package decl only.

→ Triage and task-card generation **must run against mock data**, designed behind a small interface so they swap to real endpoints later.

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
- [~] Update `test-chat.html` to exercise photo + triage paths. → photo path done; triage path pending Phase 3.
- [x] Document the new endpoints in the API contract section of `plan.md`. → `/api/chat/photo` already in the contract table.

---

## Suggested build order
Phase 1 → Phase 2 (photo, self-contained & demos well) → Phase 3 → Phase 4 → Phase 5.

## Coordination notes
- Confirm `/api/chat/photo` contract is acceptable to the team (already listed in API contract table).
- Triage/task-gen output shapes must match Sanjey's `tasks` schema and crisis-type/severity/status enums (still TBD in "Shared / Cross-Cutting").
- Voice (`/api/transcribe`) is James's; it forwards transcribed text into `POST /api/chat`, so no extra work on our side beyond keeping `/api/chat` stable.