# BrainySG — MVP Project Plan

**Team:** came4food · DSTA BrainHack 2026 · Fast Response Track
**Stack:** React + Vite + TailwindCSS (frontend) · Go + Gin (backend) · Supabase (PostgreSQL) · OpenAI gpt-4.1-mini (chat + vision) + gpt-5.4-mini (triage / task-card JSON) · Whisper (STT)

---

## Project Context

### Problem Statement

Build a web application that gathers information from different sources to help Singapore respond faster and smarter during disasters or health emergencies.

When crises like floods, haze, dengue outbreaks, or MRT disruptions happen in Singapore, information is fragmented across 5+ government agencies (NEA, LTA, PUB, MOH, SCDF). Citizens piece together what's happening from separate apps (MyENV, SGSecure, OneService), social media, and word of mouth. No existing platform unifies cross-agency data with AI triage and volunteer coordination in one place. The result: delayed response, confused citizens, and uncoordinated volunteer efforts.

### What BrainySG Is

BrainySG is a Progressive Web App (PWA) that acts as Singapore's AI crisis-response platform. It has an AI chatbot mascot called "Brainy" (styled as a cute retro radio character) that serves as the user's crisis co-pilot.

The platform does four things:

1. **Unified Data Layer** — Pulls real-time data from NEA (weather, haze, dengue), LTA (transport disruptions), PUB (flood sensors), MOH (hospital beds), and OneMap into one system.
2. **AI Triage** — Uses an LLM (OpenAI gpt-4.1-mini) to detect threshold breaches, predict cascading events (e.g. heavy rain → flood → MRT disruption), and auto-generate actionable task cards.
3. **Live Crisis Map** — OneMap-based map showing active crises as red dots, shelters with capacity, and hospitals with bed availability.
4. **Volunteer Coordination** — AI matches volunteers to tasks by skill, distance, and availability. Volunteers join crisis-specific group chats with real-time updates from Brainy and coordinators.

### Target Users

- **Primary (5.9M):** General public — residents, commuters, visitors who need fast location-specific guidance during crises.
- **Secondary (~50K):** Community volunteers — RC/CC members, SCDF CERT teams who need coordination tools.
- **Tertiary (~900K):** Caregivers of elderly/vulnerable who need shelter locations, health advisories, and remote monitoring.

### Tech Stack

- **Frontend:** React 18+ with Vite, TailwindCSS, React Router, PWA (service worker + manifest)
- **Backend:** Go with Gin framework, organized under `backend/` with `handler/`, `middleware/`, `lib/`, `ingestion/`, `cache/`
- **Database:** Supabase (PostgreSQL via PostgREST) — `lib/supabase.go`
- **AI:** OpenAI, routed by task — `gpt-4.1-mini` (multimodal) handles chatbot, photo interpretation, and the AI-written situation assessment (text + vision); the structured-output path (triage findings → task-card JSON, via `ChatJSON`) runs on the reasoning model `gpt-5.4-mini` at low effort via `LLM_JSON_MODEL`/`LLM_JSON_REASONING_EFFORT`. `LLM_BASE_URL=https://api.openai.com/v1`
- **Maps:** OneMap API (Singapore's national basemap, Leaflet)
- **Real-time:** gorilla/websocket (planned for volunteer group chat)
- **Speech-to-text:** OpenAI Whisper (`whisper-1`) — live via `POST /api/voice` (`lib.TranscribeAudio`)
- **Data Sources:** NEA, LTA DataMall, PUB MyWaters, MOH, data.gov.sg (all free/open APIs)
- **Notifications:** Notify SG (stub for MVP)

### Key Pages / Views

1. **Home Page** — Left panel: top 3 crises near you (crisis cards with status badges). Center: Brainy greeting + "View SG Map" button. Right panel: action buttons (snap photo, chat with Brainy, record voice memo) + quick topic grid (Floods, Hospital Beds, Shelters, Help, Find out more).
2. **Chat Page** — Conversational UI with Brainy. User sends text, photos, or voice. Brainy responds with situation analysis, shelter recommendations (inline map cards), safety instructions. Quick-action chips at bottom (Floods, Shelters, Help, Find out more).
3. **"I Need Help" Page** — 8-tile category grid (Medical Help, Shelter, Elderly/Vulnerable, Water Rising, Fire Nearby, Stuck/Transport, Supplies Needed, Need Info). Photo and voice input options. SOS-995 emergency button. GPS location auto-detected.
4. **Map Page** — Full OneMap view of Singapore. Red dot markers for active crises (color-coded by severity). Green markers for shelters. Blue markers for hospitals. Tap marker → crisis detail view.
5. **Crisis Detail Page** — AI-generated situation summary. Task cards with status tracking. Volunteer count. "I Want to Help" button. Link to group chat.
6. **Volunteer Group Chat Page** — Tabbed by crisis. Real-time messages from Brainy (auto-updates on data changes), coordinators, and volunteers. Voice input. Task assignment and status updates appear inline.

### Design Language

- Warm, approachable aesthetic — cream/beige backgrounds, soft shadows, rounded corners
- BrainySG brand colors: dark green for headers/logo, coral/red for alerts and active status, yellow/amber for warnings, green for resolved status
- Brainy mascot: cute retro radio character with a face, appears in chat and on home page
- Cards-based UI with clear status badges (Active = red, Warning = yellow, Resolved = green)
- Chat bubbles: user messages on right (amber/yellow), Brainy messages on left (white/light)
- Navigation: top horizontal nav bar with Home, Map, Tasks, Feed, Chat tabs
- Notification bell and user avatar in top-right corner

### Architecture Notes

- Frontend and backend are separate projects in the same repo (`/frontend` and `/backend`)
- Frontend dev server runs on Vite, proxies API calls to Go backend
- All government data is polled by the backend at 5-minute intervals and cached (`cache/cache.go` with stale-on-error fallback)
- If a government API fails, backend serves last-known-good cached data (graceful degradation)
- Triage logic is rule-based cascade chains (not ML) — hardcoded relationships fed into the LLM (gpt-4.1-mini) prompts as context
- Hospital bed data is annual/static from MOH — displayed as "last reported" or simulated for demo
- Auth is JWT for MVP (no Singpass integration yet)
- PWA installable on any device — no app store required

---

## API Contract (Agree Before Coding)

> Sanjey defines these. Everyone else codes against them with mock data until endpoints are live.

| Endpoint | Method | Owner | Consumer |
|---|---|---|---|
| `/api/crises` | GET | Sanjey | Aiya, Jerald | *(only approved crises returned)* |
| `/api/crises` | POST | Sanjey | all | *(file a citizen report — auth required; coordinator's auto-approved, others pending)* |
| `/api/crises/:id` | GET | Sanjey | Jerald, Perrin |
| `/api/crises/:id/triage` | GET | Perrin | Jerald | *(live — per-crisis findings + task cards, backs map-click flow)* |
| `/api/crises/mine` | GET | Sanjey | residents/volunteers | *(caller's own reports, any status — feed "pending" container)* |
| `/api/crises/:id` | PATCH | Sanjey | reporter/coordinator | *(edit a report; owner only while pending, coordinator any)* |
| `/api/crises/pending` | GET | Sanjey | coordinators | *(review queue — coordinator-only)* |
| `/api/crises/:id/approve` | POST | Sanjey | coordinators | *(coordinator-only; publishes report to feed/map)* |
| `/api/crises/:id/reject` | POST | Sanjey | coordinators | *(coordinator-only)* |
| `/api/crises/:id/resolve` | POST | Sanjey | coordinators | *(coordinator-only; status→resolved, leaves map, sinks to feed end)* |
| `/api/crises/nearby?lat=&lng=` | GET | Jerald | Aiya, Jerald |
| `/api/tasks` | GET/POST | Sanjey | Jerald, James |
| `/api/tasks/:id` | PATCH/DELETE | Sanjey | James |
| `/api/chat` | POST | Perrin | Perrin |
| `/api/chat/photo` | POST | Perrin | Perrin |
| `/api/chat/sessions` | GET/POST | Perrin | Perrin | *(live — per-user chat session list / create)* |
| `/api/chat/sessions/:id` | GET/DELETE | Perrin | Perrin | *(live — load / delete a stored session)* |
| `/api/triage` | GET | Perrin | Perrin, Jerald |
| `/api/triage/tasks` | GET | Perrin | Perrin, James |
| `/api/volunteers` | GET/POST | James | James, Jerald |
| `/api/volunteers/match` | POST | James | James |
| `/api/groupchat/:crisisId` | GET/POST | James | James |
| `/api/shelters?lat=&lng=` | GET | Jerald | Jerald, Perrin |
| `/api/hospitals` | GET | Sanjey | Jerald |
| `/api/voice` | POST | James | James | *(live — Whisper STT; was `/api/transcribe` in original contract)* |
| `/api/admin/data-source` | GET/POST | Perrin | demo control | *(switch triage between live and demo data at runtime)* |
| `/api/auth/login` | POST | Sanjey | All |
| `/api/data/weather` | GET | Sanjey | Perrin |
| `/api/data/floods` | GET | Sanjey | Perrin, Jerald |
| `/api/data/haze` | GET | Sanjey | Perrin |
| `/api/data/dengue` | GET | Sanjey | Perrin |
| `/api/data/transport` | GET | Sanjey | Perrin |
| `/api/feed` | GET | Sanjey | Aiya |
| `/api/geocode/reverse?lat=&lng=` | GET | Perrin | ReportCrisis | *(lat/lng → readable address via Nominatim, cached)* |

---

## Aiya — App Shell + Home Page

### Frontend

- [x] React + Vite project scaffolding (folder structure, aliases, env config)
- [ ] TailwindCSS setup and theme config (colors, fonts matching BrainySG brand)
- [ ] PWA manifest + service worker for installability
- [x] Global nav bar component (Home / Map / Tasks / Feed / Chat tabs)
- [x] React Router setup with route placeholders (note: `Volunteers.jsx` exists but has **no `/volunteers` route** wired in `App.jsx` yet; app starts at `/login`)
- [x] **Home Page — Left Panel**
  - [x] "Top 3 crises near you" crisis card list
  - [x] Each card: icon, crisis name, status badge (Active/Warning/Resolved), location, distance, "View Map" link
  - [x] "View more / Timeline" link
- [x] **Home Page — Center**
  - [x] Brainy mascot with greeting ("Good morning, John!")
  - [x] Situational summary message ("There are 2 situations today...")
  - [x] "View SG Map" button
- [x] **Home Page — Right Panel**
  - [x] Actions section: Snap a photo, Chat with Brainy, Record voice memos buttons
  - [x] Quick Topics grid: Floods, Hospital Beds, Shelters, Help, Find out more
- [x] **"I Need Help" Page**
  - [x] 8-tile category grid (Medical Help, Shelter, Elderly/Vulnerable, Water Rising, Fire Nearby, Stuck/Transport, Supplies Needed, Need Info)
  - [x] "Snap a photo" and "Record a voice note" secondary actions
  - [x] Free-text input field ("Anything else?")
  - [x] "SEND FOR HELP" button
  - [x] SOS-995 emergency button
  - [x] GPS active indicator with location display
- [x] Notification banner component (e.g. "Heavy Rain Warning — Expected in North areas next 2 hours")
- [ ] Loading states and error boundaries
- [x] Responsive layout (desktop + mobile) — `src/responsive.css` with mobile/tablet/desktop breakpoints for NavBar (hamburger menu), Home, Timeline, Chat, Map, Login, CrisisDetail (Help page not yet covered)
- [x] User avatar / profile icon in nav
- [x] **Feed / Timeline Page** (`/timeline` → `pages/Timeline.jsx`)
  - [x] Three-column layout (left panel, center feed, right sidebar)
  - [x] Left panel: "See what's happening in Singapore!" card + Report Crisis button + Brainy mascot
  - [x] Center feed: crisis event cards with tag badges (URGENT ALERT / LIVE / TRENDING / COMMUNITY), timestamp, title, location, body, comment/share counts, action button
  - [x] Right panel: "What's happening" trending box with 3 trending items + "Show more"
  - [x] Right panel: Emergency Help dark card (Police 999, Ambulance/SCDF 995, Haze Hotline)
  - [x] `Timeline.jsx` now reads live data from `GET /api/feed` (relative timestamps, severity→tag styling, "View Detail" → `/crises/:id`); `MOCK_FEED` kept only as an on-error fallback. Feed shows the same approved crises the map renders.

### Backend

- [ ] None — consumes Sanjey's endpoints

### Mock Data Needed

- [x] 3-5 sample crisis objects (fire, flood, haze) with location, status, distance
- [x] Sample user profile (hardcoded as "John" in Home page greeting)
- [x] Sample notification/alert banner data
- [x] 5 mock feed events for Timeline (Flash Flood, Haze Alert, Gas Leak, Power Outage, MRT Disruption)

---

## Sanjey — Data Pipeline + Backend Core

### Frontend

- [ ] None (optional: simple `/admin/status` debug page showing API ingestion health)

### Backend — Project Setup

- [x] Go project init (`go mod init`) with Gin framework
- [x] Project structure: `handler/`, `middleware/`, `lib/`, `ingestion/`, `cache/`
- [x] Environment config (`.env` + `godotenv` for API keys, DB connection, ports)
- [x] CORS middleware (`middleware/cors.go` — reads `CORS_ORIGIN` env, defaults to localhost:5173)
- [ ] Error handling middleware
- [ ] Request logging middleware (Gin logger or custom)
- [ ] API rate limiting middleware

### Backend — Database

- [x] DB connection — Supabase PostgREST client at `lib/supabase.go` (replaces pgx/GORM; full CRUD for crises, tasks, users)
- [x] Schema: `users` (auth login/register live; bcrypt + JWT in use)
- [x] Schema: `crises` (core table; ingestion goroutines populate it; severity uses `low/medium/high/critical`)
- [x] Schema: `tasks` (CRUD live; note: `priority` and `volunteers_needed` columns not yet confirmed in DB — gap #3 in `plan-perrin.md`)
- [ ] Schema: `volunteers` (id, user_id, skills, availability, lat, lng)
- [ ] Schema: `reports` (id, user_id, crisis_id, type, content, photo_url, lat, lng, created_at)
- [ ] Migration scripts
- [ ] Seed scripts with realistic sample data

### Backend — Auth

- [x] JWT-based auth middleware (`middleware/auth.go` — validates Bearer tokens, extracts userID/email into Gin context)
- [x] Login / register endpoints (`handler/auth.go` — bcrypt hashing, 72-hour JWT issuance)
- [x] Protect relevant routes (tasks CRUD routes require auth in `main.go`)

### Backend — Data Ingestion

- [x] NEA Weather API — `ingestion/nea.go` (2-hour forecasts + PSI; 5-min poll; upserts crisis rows on threshold breach)
- [x] NEA PSI / PM2.5 API — included in `ingestion/nea.go`
- [x] NEA Dengue clusters API — `GET /api/data/dengue` now fetches **live** from data.gov.sg (poll-download endpoint → signed GeoJSON URL → per-cluster centroid + case count, cached). On-demand fetch, so no dedicated ingestion goroutine is needed; does NOT depend on DB seeding.
- [x] PUB MyWaters API — `ingestion/pub.go` (water-level stations; creates flood crises when level > 2.5 m)
- [x] LTA DataMall API — `ingestion/lta.go` (train alerts; requires `LTA_API_KEY` env var; skips gracefully if key absent)
- [x] MOH data — `handler/hospitals.go` (hardcoded 2025 MOH bed counts for 10 public hospitals; `ingestion/moh.go` is a no-op by design — no real-time MOH API available)
- [x] 5-minute polling — all ingestion goroutines use a `time.Ticker` started in `main.go`
- [x] Graceful degradation — `cache/cache.go` `GetOrFetch` serves stale data on fetch error
- [x] Cross-check logic — cascade rules in `lib/triage.go` (rain + high water level → flash flood, flood near MRT → transport disruption, haze + dengue cluster → compound health risk)

### Backend — API Routes

- [x] `GET /api/crises` — fully implemented (`handler/crises.go`; cached, proximity filter, Haversine distance)
- [x] `GET /api/crises/:id` — fully implemented (`handler/crises.go`)
- [ ] `GET /api/crises/nearby?lat=&lng=&radius=` — not yet built (list endpoint does proximity filtering but no dedicated nearby route)
- [x] `GET /api/tasks` — fully implemented with CRUD + auth (`handler/tasks.go`)
- [x] `POST /api/tasks` — fully implemented (coordinator auth required)
- [x] `PATCH /api/tasks/:id` — fully implemented; `DELETE /api/tasks/:id` also registered
- [x] `GET /api/hospitals` — fully implemented; 10 public hospitals with 2025 MOH bed counts (`handler/hospitals.go`)
- [x] `GET /api/data/weather` — fully implemented (`handler/data.go`; served from ingestion cache)
- [x] `GET /api/data/floods` — fully implemented (`handler/data.go`)
- [x] `GET /api/data/haze` — fully implemented, includes PSI advisory level logic (`handler/data.go`)
- [x] `GET /api/data/dengue` — fully implemented with **live** data.gov.sg fetch (`handler/data.go`; poll-download → GeoJSON → cluster centroids, cached). Returns empty list (HTTP 200, not 503) on fetch failure since dengue is non-critical-path.
- [x] `GET /api/data/transport` — fully implemented (`handler/data.go`)
- [x] **`GET /api/feed`** — fully implemented (`handler/feed.go`; derives feed items from crises table, pins URGENT_ALERT by severity, supports `?limit=&offset=` pagination); frontend not yet wired to it

---

## Perrin — AI Chatbot + Triage

### Frontend

- [x] **Chat Conversation Page**
  - [x] Message bubble layout (user messages right-aligned, Brainy left-aligned)
  - [x] Brainy avatar next to AI messages
  - [x] Timestamps on messages
  - [x] Auto-scroll to latest message
  - [x] Text chat wired to real `POST /api/chat` (was mock-only) with graceful fallback to canned responses if the backend is unreachable
- [x] **Chat Input Bar**
  - [x] Text field with send button
  - [x] Camera icon button for photo capture
  - [x] Microphone icon (triggers James's voice flow, or links to it)
- [x] **Photo Capture Flow**
  - [x] Camera button → device camera / file picker
  - [x] Photo preview before sending
  - [x] Upload with loading indicator
  - [x] AI response with situation analysis
  - [x] Inline crisis card rendered when photo shows an actionable crisis (`res.crisis_card` → `InlineCrisisCard`)
- [x] **Inline Rich Cards in Chat**
  - [x] Shelter card (name, distance, "View Map" link) — like the Pasir Ris Community Club card
  - [x] Hospital card (name, bed availability) — `InlineHospitalCard.jsx` (bed fraction + availability bar)
  - [x] Crisis summary card — `InlineCrisisCard.jsx` (shaped like a triage `TriageFinding`; severity-coloured, type icon)
- [x] **Quick-Action Chips**
  - [x] Persistent bottom bar: Floods, Shelters, Help, Find out more
  - [x] Tapping a chip sends it as a message
- [x] Brainy intro message on first open ("I'm Brainy! Your personal emergency buddy...")

### Backend

- [x] **LLM API Integration**
  - [x] API client wrapper at `backend/lib/llm.go` (OpenAI chat-completions; model `gpt-4.1-mini` via `LLM_MODEL`/`LLM_BASE_URL`, defaults baked in)
  - [x] **Dual-model routing** — chat / vision / situation-prose use `LLM_MODEL` (`gpt-4.1-mini`); the structured-output path (`ChatJSON`, used by triage + task cards) uses `LLM_JSON_MODEL` (`gpt-5.4-mini`, reasoning, low effort). `buildTextRequest` emits `max_completion_tokens` + `reasoning_effort` for GPT-5/o-series models, `max_tokens` otherwise; blank `LLM_JSON_MODEL` reuses the chat model (no behaviour change)
  - [x] System prompt design for crisis chatbot persona (Brainy)
  - [x] Conversation context management — now **persisted per-user in Supabase** (`chat_sessions` JSONB), auth-gated; LLM layer is stateless
  - [x] `POST /api/chat` handler wired up (`backend/handler/chat.go`)
  - [x] Error handling for API failures
  - [x] Structured JSON output parsing for task cards (`ChatJSON` helper in `llm.go`)
  - [x] Retry logic for transient API failures (3 attempts, exponential backoff on 429/5xx/network)
- [x] **Triage Logic** (`backend/lib/triage.go`, `triage_live.go`, `datasource.go`, `geo.go`)
  - [x] Threshold rules: water level ≥ 2.5 m → flood warning (≥ 3.5 m critical) — **now keys on real PUB metres** (data.gov.sg reports absolute metres, not capacity %; the old 75/90 % thresholds were dropped, matching ingestion's high-water mark)
  - [x] Threshold rules: PSI ≥ 100 → haze advisory (≥ 200 critical) — real per-region PSI from the live feed
  - [x] Threshold rules: dengue cases ≥ 10 in cluster → health alert (≥ 50 critical) — real case counts from the live dengue feed
  - [x] Cascade rules: heavy rain + high water (same area) → flash-flood risk
  - [x] Cascade rules: flood within 1.5 km of MRT → transport disruption
  - [x] Cascade rules: high PSI + dengue cluster → compound health risk
  - [x] Feed triage findings into Brainy's prompt context (live situational-awareness system message on session start)
  - [x] **Live data only** — `LiveDataProvider` (`triage_live.go`) reads the real cross-agency feeds via shared fetchers in `lib/datasource.go` (NEA weather + PSI, PUB water level, NEA dengue, LTA train alerts), cached 60 s per triage burst. **MockProvider removed** (`triage_mock.go` deleted; geo helpers moved to `geo.go`). Installed unconditionally by `SelectDataProvider` at startup; on a feed error that signal is absent for the run (no mock fallback).
  - [x] `lib/datasource.go` is the single fetch+parse layer shared by Sanjey's `/api/data/*` handlers and triage (handlers refactored to thin cache-and-serve wrappers; API JSON shapes unchanged)
  - [x] `GET /api/triage` endpoint exposes the sorted report
- [x] **Auto Task Card Generation** (`backend/lib/taskgen.go`)
  - [x] AI generates structured task card JSON from triage output (via `ChatJSON`); deterministic fallback if the LLM call fails
  - [x] `ForwardTasks` best-effort POSTs to `TASKS_SINK_URL`; log-only unless `FORWARD_TASKS=1`
  - [x] Task fields: title, description, priority, volunteers_needed, crisis_id (+ type, location)
  - [x] `GET /api/triage/tasks` endpoint exposes the generated cards
- [x] **Photo Interpretation** (`backend/handler/photo.go`, `backend/lib/llm.go`, `backend/lib/photo_triage.go`)
  - [x] Accept image upload via `POST /api/chat/photo` (multipart, 8 MB cap, content-type sniffed from bytes)
  - [x] `VisionTurn` sends image to `gpt-4.1-mini` (multimodal — same model as text path); returns `(reply string, obs *PhotoObservation, err error)`; `obs` is nil on prose-fallback path
  - [x] Hybrid pipeline: vision call extracts structured `PhotoObservation` → text call writes Brainy's reply using the facts; degrades to single-call prose if JSON parse fails
  - [x] Photo persisted to Supabase Storage (`UploadChatImage`, best-effort) so it survives reloads; `image_url` returned in the response
  - [x] Photo trace added to session history so text follow-ups keep photo context
  - [x] `ObservationToFinding` (`lib/photo_triage.go`) maps a `PhotoObservation` to a `TriageFinding`; skips low/none severity and none/other crisis types
  - [x] `POST /api/chat/photo` response includes `crisis_card` when observation is actionable (no extra LLM call)
- [x] **Chat Endpoints**
  - [x] `POST /api/chat` — send text message, return AI response (fully implemented, auth-required)
  - [x] `POST /api/chat/photo` — send image, return AI analysis + optional `crisis_card` + `image_url`
  - [x] `GET/POST /api/chat/sessions` — list / create a user's chat sessions (`handler/chat.go`)
  - [x] `GET/DELETE /api/chat/sessions/:id` — load / delete a stored session
- [x] Chat history storage — **persisted per-user in Supabase** `chat_sessions` (JSONB messages); sidebar UI lists past sessions and starts new chats. Run migration `db/migrations/002_chat_sessions.sql` by hand or `/api/chat` 500s.
- [x] **Per-crisis triage endpoint** — `GET /api/crises/:id/triage` (`handler/triage.go` `CrisisTriage` → `lib.TriageForCrisis`) returns `{crisis_id, generated_at, findings, tasks}` scoped to one crisis; backs the map-click → crisis-detail flow. Empty (not an error) when nothing links to the crisis.
- [x] **Demo data provider** — `lib/triage_demo.go` `DemoDataProvider` serves a fixed cross-agency scenario tuned to the seeded crises (`db/seeds/`), so `DATA_SOURCE=demo` fires a believable repeatable triage even when SG is calm. Toggle live↔demo at runtime via `GET/POST /api/admin/data-source` (`handler/admin.go`).
- [x] **AI-written situation assessment** — the rule engine's terse finding `Detail` is now expanded into a 2–4 sentence resident-facing paragraph by the LLM (`lib/triage_prose.go` `EnrichFindingsProse`, chat model with the Brainy persona), cached by finding identity (`GlobalCache`) so reloads don't re-hit the model, with fallback to the template on any error. Applied only on the per-crisis view (`CrisisTriage`), scoped to that crisis's findings — the global `/api/triage` list stays terse.

### Live Data Gaps (triage now runs on live feeds only — these fields can't be sourced and are flagged here per the "no mock data" decision)

- [ ] **Weather rainfall (mm)** — the NEA 2-hour-forecast feed gives only forecast *text*, no rainfall amount, so `WeatherReading.RainfallMM` is always 0. Heavy-rain detection (and the flash-flood cascade) therefore relies on forecast keywords ("heavy"/"thundery") only. Fix: add the data.gov.sg `rainfall` realtime API to `datasource.go` for true mm.
- [ ] **Haze PM2.5** — only PSI is fetched; `HazeReading.PM25` is unused/0. No rule needs it today, but it's not live.
- [x] **`crisis_id` linkage on findings** — the live `/api/data/*` feeds carry no crisis-row id, so it's re-derived: `linkCrisisIDs` (`triage_live.go`) matches each reading back to an active crisis row by type + proximity (flood/dengue within 2 km), national row (haze), or name (transport line), stamping its id. The id then rides reading → finding → task card, so `ForwardTasks` writes FK-valid rows again under `FORWARD_TASKS=1`. Best-effort: unmatched readings stay unlinked (card not DB-persisted). Cascade findings still carry no id by design (synthetic, no single crisis row).
- [ ] **Transport requires `LTA_API_KEY`** — without it `FetchTransport` returns an empty feed (no error), so transport findings silently never appear.
- [x] **Dengue** — fully live (real case counts + polygon centroids); no gap.

### Tests

- [x] `lib/triage_test.go` — stubbed live feeds trip all threshold + cascade rules (`TestRunTriageRules`, `TestTriageContextNonEmpty`)
- [x] `lib/triage_live_test.go` — `LiveDataProvider` feed→reading mapping via stubbed fetchers, full engine run, `crisis_id` re-linking (`TestLiveProviderLinksCrisisID`), `splitStations`, `attachFindingMeta`
- [x] `lib/taskgen_test.go` — fallback cards, sanitise, dedup, empty-findings
- [x] `lib/photo_triage_test.go` — 11-case `ObservationToFinding` table test (covers severity mapping, type filtering, hazard appending, source tagging)
- [x] `extractJSON` (6 cases) + `stripJSONFences` (5 cases) in `photo_triage_test.go`
- [x] All `go build ./...`, `go vet ./...`, `go test ./lib/...` green after the live-data refactor

### Mock Data

- [x] ~~Sample crisis data to inject into prompts~~ — **removed**; triage runs on live feeds only (mock provider deleted)
- [ ] Sample photos of flood/fire/haze scenarios committed as test fixtures (`backend/testdata/photos/`)

---

## Jerald — Map + Crisis Detail

### Frontend

- [x] **Map Page** (`pages/Map.jsx`, `components/map/MapView.jsx`)
  - [x] OneMap embed via Leaflet with OneMap tile layer
  - [x] Red dot markers for active crises — `CrisisMarker.jsx` (severity-coloured: critical=red, warning=amber, low=yellow)
  - [x] Green markers for shelters (with capacity label)
  - [x] Blue markers for hospitals (with bed count label)
  - [x] User location marker ("You are here") via browser Geolocation API
  - [x] Marker clustering — `MarkerClusterGroup`
  - [x] Map filter/overlay toggles (show/hide: crises, shelters, hospitals)
  - [x] Click marker → navigate to `/crises/:id`
- [x] **Crisis Detail Page** (`pages/CrisisDetail.jsx`)
  - [x] AI-generated situation summary (Brainy brief driven by triage findings)
  - [x] Crisis metadata (type, severity, location, last updated)
  - [x] Water level / sensor reading display (if flood)
  - [x] Task card list with status badges — note: uses `urgent / open / in_progress / done` (filter tabs All/Open/In Progress/Done), **not** the documented `pending / assigned / in_progress / resolved` enum
  - [x] **Volunteer-slot capacity** — each AI task card shows the remaining `volunteers_needed`; joining decrements it (backend `JoinTask`), leaving restores it (`LeaveTask`), and at 0 the card shows "Fully staffed" with a disabled action. Non-coordinators only — coordinators don't consume a slot. A full join returns `409 {full:true}`, surfaced distinctly from the one-task-per-crisis conflict (no "leave & switch" prompt)
  - [x] Volunteer count ("12 helpers") — demo heuristic: regex-parsed from `crisis.summary` text; mini-map "helpers nearby" markers are `mockHelpers`, not live volunteer data
  - [x] "I Want to Help" button → navigates to `/volunteers?crisis_id=…&task_id=…` — **dead link**: no `/volunteers` route in `App.jsx` yet (waiting on James's page)
  - [x] Link to group chat for this crisis — "Group Chat" button also navigates to `/volunteers?crisis_id=…` (same dead route)
- [x] **Map on Home Page**
  - [x] "View SG Map" button links to full map page

### Backend

- [ ] **Geospatial Queries**
  - [ ] `GET /api/crises/nearby?lat=&lng=&radius=` — not yet built (crises list does proximity filtering but no dedicated nearby route)
  - [x] `GET /api/shelters?lat=&lng=` — returns shelters sorted by Haversine distance (`handler/map.go`)
- [x] **Shelter Data** — 10 Singapore community centres hardcoded with lat/lng/capacity in `handler/map.go` (sufficient for demo)
- [ ] **Map Marker Endpoint** — `GET /api/map/markers` registered but returns `{"markers": []}` (stub); map page reads crises/shelters/hospitals via their own endpoints directly
- [x] **Crisis Detail Endpoint** — `GET /api/crises/:id` fully implemented (`handler/crises.go`)

### Mock Data Needed

- [x] 5-10 crisis markers — frontend `src/lib/mockData.js` **deleted**; crises now come live from Supabase (ingestion goroutines) + `db/seeds/demo_crises.sql` for demos
- [x] 10 shelter locations with coordinates and capacity (hardcoded in `handler/map.go`)
- [x] 10 public hospital locations with bed counts — `handler/hospitals.go` (2025 MOH data)

---

## James — Volunteer System + Group Chat + Voice

### Frontend

- [ ] **Volunteer Group Chat Page** (`pages/Volunteers.jsx` — currently just Navbar + heading)
  - [ ] Tab bar for chat rooms (Brainy general / Flash Flood / Fire — one per crisis)
  - [ ] Crisis header with summary (e.g. "Flash Flood - Pasir Ris Dr 3 · Water 76% · 12 helpers · 3 Open Tasks")
  - [ ] Message list with different message types:
    - [ ] Brainy auto-update messages (green dot, system-style)
    - [ ] Coordinator messages (blue dot, official-style)
    - [ ] Volunteer messages (standard chat bubble)
  - [ ] Message input bar with text field + send button
  - [ ] Voice record button (microphone icon)
  - [ ] Camera and attachment buttons
- [ ] **Voice Recording UI** (`components/volunteer/VoiceRecorder.jsx` — stub, returns null)
  - [ ] Tap mic → recording indicator (waveform or timer)
  - [ ] Stop → "Transcribing..." indicator
  - [ ] Transcribed text appears in chat input or sent directly
- [ ] **"I Want to Help" Registration Flow** (`components/volunteer/VolunteerForm.jsx` — stub, returns null)
  - [ ] Triggered from Jerald's crisis detail page
  - [ ] Skill input (checkboxes: has car, medical training, heavy lifting, etc.)
  - [ ] Availability toggle
  - [ ] Confirmation → added to crisis volunteer pool
- [ ] **Task Status Tracker** (`components/volunteer/TaskTracker.jsx` — stub, returns null)
  - [ ] Task card with status badge (Pending → Assigned → In Progress → Resolved)
  - [ ] Volunteer can update status on assigned tasks

### Backend

- [x] **Speech-to-Text**
  - [x] `POST /api/voice` route registered in `main.go` (**auth-required** via `middleware.RequireAuth()`); actual route is `/api/voice`, not `/api/transcribe` from the contract table
  - [x] Integration with OpenAI Whisper (`whisper-1`) — `handler/volunteers.go` `Voice` → `lib.TranscribeAudio` (`STT_BASE_URL`/`STT_MODEL`)
  - [x] Return transcribed text
  - [ ] Forward transcribed text to Perrin's `POST /api/chat` as standard message (frontend wiring)
- [x] **Volunteer System** (routes registered; handlers are no-ops)
  - [x] `POST /api/volunteers` — route registered, **auth-required** (`handler/volunteers.go` `RegisterVolunteer` stub)
  - [x] `GET /api/volunteers?crisis_id=` — route registered (`ListVolunteers` stub, public)
  - [ ] `POST /api/volunteers/match` — AI/logic-based matching (skill + distance + availability scoring)
  - [ ] `PATCH /api/volunteers/:id` — update availability
- [ ] **Group Chat**
  - [ ] gorilla/websocket setup for real-time messaging
  - [ ] Chat rooms per crisis (join/leave room by crisis_id)
  - [ ] `GET /api/groupchat/:crisisId` — message history
  - [ ] `POST /api/groupchat/:crisisId` — send message (also broadcast via websocket)
  - [ ] Brainy auto-update messages injected when crisis data changes
  - [ ] Coordinator role can post official messages
- [ ] **Task Assignment**
  - [ ] `PATCH /api/tasks/:id/assign` — assign volunteer to task
  - [ ] `PATCH /api/tasks/:id/status` — update task status
  - [ ] Notify group chat when task status changes
- [ ] **Notifications**
  - [ ] Stub for Notify SG push integration
  - [ ] In-app notification when new crisis triggers in user's area

### Mock Data Needed

- [ ] Sample volunteer profiles with various skills
- [ ] Sample group chat message history (mix of Brainy updates, coordinator, and volunteer messages)
- [ ] Sample audio files for testing transcription

---

## Shared / Cross-Cutting

- [ ] Crisis type enum — `flood, fire, haze, fallen_tree, road_accident, building_damage, medical, crowd, transport, dengue, cascade` consistent across `PhotoObservation`, `TriageFinding`, `InlineCrisisCard`, **but** `ingestion/lta.go` writes crises with `Type: "mrt"` (not `transport`) — reconcile before treating the enum as agreed
- [x] Severity enum — `low, warning, critical` (constants in `lib/triage.go`; used consistently across backend and frontend)
- [ ] Task status enum — **not agreed / inconsistent**: backend `handler/tasks.go` and the contract use `pending, assigned, in_progress, resolved`, but Jerald's `CrisisDetail.jsx` renders `urgent, open, in_progress, done`. Needs reconciling before tasks flow end-to-end.
- [ ] Agree on full API response JSON shapes (some endpoints evolved from the original contract table)
- [x] Brainy mascot image asset (PNG/SVG) available to all
- [ ] BrainySG logo asset
- [ ] Color palette tokens (from Figma or agreed on)
- [x] Git branching strategy (feature branches per member → merge to main)
- [x] `.env.example` files updated for both frontend and backend
- [x] README with setup instructions

---

## Data Sources Reference

| Source | API | What It Provides | Update Freq | Free? |
|---|---|---|---|---|
| NEA | data.gov.sg | Weather forecasts, PSI, PM2.5 | 5min–1hr | Yes |
| PUB | data.gov.sg / MyWaters | Flood sensor water levels | ~5min | Yes |
| LTA | LTA DataMall | MRT/bus disruptions, traffic | ~5min | Yes (API key) |
| MOH | data.gov.sg | Hospital bed counts, BOR | Annual | Yes |
| OneMap | onemap.gov.sg | Basemap, geocoding, routing | Live | Yes |
| Notify SG | GovTech | Push notifications to citizens | Live | Yes |
| OpenAI | api.openai.com | gpt-4.1-mini (chat + vision) + gpt-5.4-mini (triage/task JSON) + whisper-1 (STT) | Per request | Paid |

---

## Notes

- Hospital bed data is **annual/static**, not live. Displayed as "last reported" values from `handler/hospitals.go` (2025 MOH figures for 10 public hospitals).
- `src/lib/mockData.js` has been **removed** — the map, crisis detail, and home pages now read live data from the backend (crises/shelters/hospitals endpoints). Use `db/seeds/demo_crises.sql` + `DATA_SOURCE=demo` for a stable demo dataset.
- **LLM setup:** two OpenAI models, routed by task. `gpt-4.1-mini` (multimodal) handles chat, vision, and the situation-assessment prose (`LLM_MODEL`/`LLM_BASE_URL=https://api.openai.com/v1`). The structured-output path — triage findings → task-card JSON via `ChatJSON` — runs on `gpt-5.4-mini` (reasoning, low effort) via `LLM_JSON_MODEL`/`LLM_JSON_REASONING_EFFORT`; `buildTextRequest` switches to `max_completion_tokens` + `reasoning_effort` for GPT-5/o-series models and keeps `max_tokens` for the rest. Leaving `LLM_JSON_MODEL` blank reuses the chat model (no behaviour change). STT is `whisper-1` (`STT_BASE_URL`/`STT_MODEL`). This lineage replaced the earlier Nemotron-via-OpenRouter setup (which itself replaced Gemini Flash).
- **Dengue:** `GET /api/data/dengue` is now fully live — it fetches from data.gov.sg on demand (poll-download → GeoJSON → cluster centroids, cached), so no ingestion goroutine is required. Note: this live data is **not** written into the `crises` table, so dengue does not yet surface in the crisis map/feed/triage unless seeded separately.
- **Timeline live data:** `GET /api/feed` is implemented in `handler/feed.go` but `Timeline.jsx` still reads from `MOCK_FEED`. One-line fix to wire them up.
- **Crisis insert timestamps:** `lib.crisisInsertBody` builds the insert payload for `CreateCrisis`/`UpsertCrisis` and omits `created_at`/`updated_at` so the DB `DEFAULT NOW()` applies. (Sending the struct serialised the zero `time.Time` as `0001-01-01T00:00:00Z` — `omitempty` doesn't work on a struct — which is why early reports showed a year-0001 date.)
- **RBAC / report approval:** users carry a `role` (`resident` | `volunteer` | `coordinator`; in the JWT). `POST /api/crises` lets any authenticated user file a report — residents/volunteers create it `pending`, coordinators auto-`approved`. Only `approval_status='approved'` crises appear in `GET /api/crises` (map) and `GET /api/feed`. Coordinators review via `GET /api/crises/pending` and act with `POST /api/crises/:id/approve|reject` (gated by `middleware.RequireRole("coordinator")`). **Run migration `db/migrations/003_rbac_crisis_approval.sql` by hand** — it adds `users.role` (previously only assumed by `seed_users.sql`) and the `crises.approval_status/reported_by/approved_by` columns; without it these endpoints 500. Re-login after deploying so tokens carry the role. **Frontend wired:** `ReportCrisis.jsx` POSTs to `/api/crises` (maps vision type/severity to the table enums, sends geolocation lat/lng). The **approval workflow lives in the Feed** (`Timeline.jsx` + `components/feed/PendingReports.jsx`): coordinators see an **approval container** (`GET /api/crises/pending`, inline approve/reject); residents/volunteers see a **"your pending reports" container** (`GET /api/crises/mine`, scoped by `reported_by`) with a **View / Edit** modal (`PATCH /api/crises/:id` — owner may edit only while pending; coordinators may edit any). Both hide when empty. Once approved, the crisis appears as a **map marker** (`/api/crises`) and a **feed card** (`/api/feed`) — same row, two surfaces, both linking to `/crises/:id`. **Resolve:** coordinators get a **Resolve** button on active feed cards (`POST /api/crises/:id/resolve` → `status=resolved`); the feed now includes resolved crises (`GetCrisesPaged` dropped its `status` filter) and `feed.go` sorts them to the end, dimmed with a RESOLVED badge, while the map (`GetCrises`, still `status=eq.active`) drops them.

**Photo report auto-fill:** `POST /api/chat/photo` now also returns `caption` (the vision model's one-line `Description`) and `tags` (built from the observation) even when there's no actionable `crisis_card`; `ReportCrisis.jsx` auto-fills the caption and suggested tags. **Readable location:** new `GET /api/geocode/reverse?lat=&lng=` (`handler/geocode.go`, OpenStreetMap Nominatim, keyless + cached) turns GPS coords into a human address that replaces the raw "≈ lat, lng" in the form.
- Update the pitch deck: Flask → Go + Gin, Gemini Flash → OpenAI gpt-4.1-mini (single multimodal model, + Whisper for voice).
