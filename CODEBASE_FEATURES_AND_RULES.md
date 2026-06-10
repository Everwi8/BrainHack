# BrainySG Codebase Features, Rules, and File Reference

This document is a working technical map of the repository:
- what features exist,
- how each feature works end-to-end,
- which files implement each piece, and
- which constraints/rules are enforced in code and schema.

It is intended as a maintainers' reference alongside `README.md` and `architecture.md`.

## 1) Feature List: How Each Feature Works

### 1. Authentication and Session Management
- Frontend files:
  - `frontend/src/pages/Login.jsx`
  - `frontend/src/lib/AuthProvider.jsx`
  - `frontend/src/lib/auth.js`
  - `frontend/src/App.jsx`
- Backend files:
  - `backend/handler/auth.go`
  - `backend/middleware/auth.go`
  - `backend/db/schema.sql` (`users` table)
- Flow:
  - Login/register returns JWT + user profile.
  - JWT is stored in localStorage and sent as `Authorization: Bearer <token>`.
  - Protected routes use `RequireAuth`.
- Rules:
  - Password min length 6.
  - JWT includes `user_id`, `email`, `role`.
  - Supported roles: `resident`, `volunteer`, `coordinator`.

### 2. Role-Based Access Control (RBAC)
- Backend files:
  - `backend/middleware/auth.go`
  - `backend/main.go` (route wiring)
  - `backend/handler/crises.go`
- DB files:
  - `backend/db/migrations/003_rbac_crisis_approval.sql`
  - `backend/db/schema.sql`
- Flow:
  - Coordinator-only routes add `RequireRole("coordinator")`.
- Rules:
  - Coordinators can approve/reject/resolve crises.
  - Residents/volunteers cannot action approval queue.

### 3. Crisis Reporting and Approval Workflow
- Frontend files:
  - `frontend/src/pages/ReportCrisis.jsx`
  - `frontend/src/pages/Timeline.jsx`
  - `frontend/src/components/feed/PendingReports.jsx`
- Backend files:
  - `backend/handler/crises.go`
  - `backend/lib/supabase.go`
- DB files:
  - `backend/db/schema.sql` (`crises.approval_status`, `reported_by`, `approved_by`)
- Flow:
  - Authenticated user submits report via `POST /api/crises`.
  - Non-coordinator reports default to `pending`; coordinators auto-approve.
  - Coordinator approves/rejects from pending queue.
- Rules:
  - Public map/feed only show `approved` crises.
  - Report owner can edit only while pending (unless coordinator).

### 4. Public Feed / Timeline
- Frontend files:
  - `frontend/src/pages/Timeline.jsx`
- Backend files:
  - `backend/handler/feed.go`
  - `backend/lib/supabase.go` (`GetCrisesPaged`)
- Flow:
  - Feed endpoint converts crisis rows to feed items with tags.
  - Frontend maps tags to visuals and opens crisis detail.
- Rules:
  - Severity maps to tag priority: `URGENT_ALERT > LIVE > TRENDING > COMMUNITY`.
  - Resolved crises are retained as history but sorted after active crises.

### 5. Map View (Crises, Shelters, Hospitals, User Location)
- Frontend files:
  - `frontend/src/pages/Map.jsx`
  - `frontend/src/components/map/MapView.jsx`
  - `frontend/src/components/map/CrisisMarker.jsx`
- Backend files:
  - `backend/handler/crises.go`
  - `backend/handler/map.go` (shelters)
  - `backend/handler/hospitals.go`
  - `backend/handler/admin.go` (demo/live toggle)
- Flow:
  - Frontend fetches `/api/crises`, `/api/shelters`, `/api/hospitals`.
  - Layer filters are applied in page state; `MapView` receives pre-filtered arrays.
- Rules:
  - Demo/live source switch is runtime API-based.
  - Crisis marker colors normalize both crisis severity (`high/medium/low`) and triage severity (`critical/warning/low`) variants.

### 6. Triage Engine (Situation Assessment)
- Backend files:
  - `backend/lib/triage.go`
  - `backend/lib/triage_live.go`
  - `backend/lib/triage_demo.go`
  - `backend/handler/triage.go`
  - `backend/lib/triage_prose.go`
- Flow:
  - Provider supplies readings (weather, flood, haze, dengue, transport).
  - Rule engine emits findings.
  - Cascade rules derive compound risks.
  - Prose enrichment optionally rewrites findings for resident-facing detail.
- Rules:
  - Core severities in triage: `critical`, `warning`, `low`.
  - Demo/live provider selected via `DATA_SOURCE` or admin toggle.
  - Findings are sorted by severity rank before response.

### 7. AI Task Generation and Persistence
- Backend files:
  - `backend/lib/taskgen.go`
  - `backend/handler/triage.go` (`CrisisTriage`)
  - `backend/lib/supabase.go` (`UpsertAITask`, deterministic IDs)
- Flow:
  - Crisis triage generates task cards from findings.
  - First crisis-open persists generated tasks with deterministic IDs.
  - Later opens reuse persisted tasks, regenerate findings only.
- Rules:
  - Deterministic task ID prevents duplicate task/chat threads.
  - Task generation is per-finding and severity-scaled.
  - Fallback deterministic templates are used if LLM task JSON fails.

### 8. Task Board and Task Membership
- Frontend files:
  - `frontend/src/pages/Tasks.jsx`
  - `frontend/src/pages/CrisisDetail.jsx`
  - `frontend/src/pages/Volunteers.jsx`
- Backend files:
  - `backend/handler/tasks.go`
  - `backend/lib/supabase.go` (`task_members`)
- DB files:
  - `backend/db/migrations/005_task_groups.sql`
  - `backend/db/schema.sql`
- Flow:
  - Tasks are listed publicly.
  - Join/leave APIs update membership and volunteer slot counts.
  - Joined tasks appear in volunteer page tabs.
- Rules:
  - Non-coordinators can hold only ONE task globally at a time.
  - Coordinators are exempt from one-task and slot-consumption constraints.
  - Joining full tasks returns conflict.

### 9. Volunteer Skills and Task Matching
- Frontend files:
  - `frontend/src/pages/Profile.jsx`
  - `frontend/src/pages/CrisisDetail.jsx`
- Backend files:
  - `backend/handler/volunteers.go`
  - `backend/handler/tasks.go` (`MatchTasks`)
  - `backend/lib/matching.go`
- DB files:
  - `backend/db/migrations/007_skills_matching.sql`
  - `backend/db/schema.sql` (`volunteers.skills`, `tasks.skills_needed`)
- Flow:
  - Volunteer saves skills profile.
  - Match endpoint scores open tasks by skill overlap + priority.
  - Brainy produces short rationale for recommended task.
- Rules:
  - Skill slugs are normalized and deduplicated.
  - Full tasks are excluded from recommendations.

### 10. Personal Brainy Chat (Text + Streaming + Sessions)
- Frontend files:
  - `frontend/src/pages/Chat.jsx`
  - `frontend/src/components/chat/*`
  - `frontend/src/lib/api.js` (`postStream`)
- Backend files:
  - `backend/handler/chat.go`
  - `backend/lib/llm.go`
  - `backend/lib/sanitize.go`
  - `backend/lib/supabase.go` (`chat_sessions`)
- DB files:
  - `backend/db/migrations/002_chat_sessions.sql`
  - `backend/db/schema.sql`
- Flow:
  - User sends text to `/api/chat` or `/api/chat/stream`.
  - Backend validates input, builds grounded system prompt, stores transcript in session.
  - Sidebar loads prior sessions.
- Rules:
  - Input is injection-checked and length-capped.
  - Session ownership enforced by `user_id` filter on reads/writes.
  - Streaming uses SSE event types: `token`, `error`, `done`.

### 11. Photo Chat and Vision-Assisted Reporting
- Frontend files:
  - `frontend/src/pages/Chat.jsx`
  - `frontend/src/pages/ReportCrisis.jsx`
  - `frontend/src/components/chat/CameraCapture.jsx`
- Backend files:
  - `backend/handler/photo.go`
  - `backend/lib/llm.go` (`ExtractPhotoObservation`, `VisionTurn`)
  - `backend/lib/photo_triage.go`
- Flow:
  - Image upload hits `/api/chat/photo`.
  - Backend stores image (best effort), runs vision extraction, returns reply + optional crisis card/tags.
- Rules:
  - Max image size 8 MB.
  - Non-image MIME rejected.
  - Vision output is schema-constrained and converted into actionable finding only for warning/high severities.

### 12. Crisis-Scoped Co-Pilot (Drawer in Crisis Detail)
- Frontend files:
  - `frontend/src/pages/CrisisDetail.jsx`
  - `frontend/src/components/crisis/BrainyDrawer.jsx`
- Backend files:
  - `backend/handler/chat.go` (`CrisisChat`, `CrisisChatPhoto`)
  - `backend/lib/brainy_chat.go`
- Flow:
  - Crisis page sends question/history to `/api/crises/:id/chat`.
  - Backend grounds reply in one crisis row + tasks + sensors + broader triage context.
- Rules:
  - Stateless: drawer history is client-provided and not persisted server-side.
  - Vision drawer path is auth-gated.

### 13. Group Chat (Per-Crisis and Per-Task)
- Frontend files:
  - `frontend/src/pages/Volunteers.jsx`
- Backend files:
  - `backend/handler/groupchat.go`
  - `backend/lib/supabase.go` (group chat in `chat_sessions`)
  - `backend/lib/brainy_chat.go`
- Flow:
  - Per-crisis and per-task messages are persisted in chat session rows with title prefixes.
  - Task chat can asynchronously trigger Brainy reply when addressed.
- Rules:
  - Task chat access requires task membership.
  - Message history capped to last 500 entries.
  - Brainy identity uses reserved sender role `brainy`.

### 14. Voice Notes and Speech-to-Text
- Frontend files:
  - `frontend/src/lib/useVoiceRecorder.js`
  - `frontend/src/pages/Chat.jsx`
  - `frontend/src/pages/Volunteers.jsx`
- Backend files:
  - `backend/handler/volunteers.go` (`/api/voice`)
  - `backend/lib/stt.go`
- Flow:
  - Browser records audio blob and uploads multipart `audio`.
  - Backend validates type/size and forwards to transcription API.
- Rules:
  - Max voice upload size 12 MB.
  - Audio container sniffing allows `audio/*`, `video/webm`, `video/mp4` with audio-like extensions.

### 15. Nearby Civic Resources
- Frontend files:
  - `frontend/src/pages/Timeline.jsx`
- Backend files:
  - `backend/handler/resources.go`
  - `backend/lib/onemap.go`
- Flow:
  - Frontend calls `/api/resources/nearby?lat=&lng=`.
  - Backend queries OneMap themes for shelters/hospitals/AED summaries.
- Rules:
  - Per-cell cache key uses rounded coordinates.
  - Endpoint is best-effort: missing themes degrade to null/omitted rows.

### 16. Live Data Ingestion and Data Endpoints
- Backend files:
  - `backend/ingestion/nea.go`
  - `backend/ingestion/lta.go`
  - `backend/ingestion/pub.go`
  - `backend/handler/data.go`
  - `backend/lib/datasource.go`
- Flow:
  - Goroutines poll NEA/LTA/PUB every 5 minutes and upsert crises.
  - `/api/data/*` serves parsed feed snapshots for UI.
- Rules:
  - In `DATA_SOURCE=demo`, ingestion is paused.
  - Some endpoint failures degrade gracefully (for example dengue returns empty set instead of 503).

## 2) Rulebook Summary (Cross-Cutting Constraints)

- Auth required for writes and private reads:
  - `middleware.RequireAuth()` gates protected routes.
- Coordinator-only actions:
  - Crisis pending queue review and resolve actions.
- One-task rule:
  - Residents/volunteers can join only one task at a time.
  - Coordinators are exempt.
- Approval visibility:
  - Public feed/map list only `approval_status='approved'`.
- Input safety:
  - `ValidateUserInput` strips controls, caps length, blocks injection patterns.
- Prompt safety:
  - System prompt enforces topic scope and anti-redirection behavior.
- Chat ownership:
  - `chat_sessions` CRUD filters by `user_id`.
- Cache policy:
  - 5-minute in-memory TTL with stale-on-fetch-error fallback in `cache.GetOrFetch`.
- Crisis/task consistency:
  - Deterministic task IDs preserve stable task threads/chats.

## 3) Full File Reference (Code and Schema)

### Backend Runtime
- `backend/main.go`: server entrypoint; env init, provider selection, ingestion goroutines, route wiring, graceful shutdown.

#### Cache
- `backend/cache/cache.go`: process-wide TTL cache with `Get`, `GetOrFetch`, and explicit invalidation.

#### Middleware
- `backend/middleware/auth.go`: JWT parse/validate and role-gate middleware.
- `backend/middleware/cors.go`: CORS headers and preflight handling.

#### HTTP Handlers
- `backend/handler/admin.go`: runtime triage data-source status/switch endpoints.
- `backend/handler/auth.go`: register/login + profile read/update endpoints.
- `backend/handler/chat.go`: personal chat, stream chat, crisis-scoped chat, chat sessions.
- `backend/handler/crises.go`: crisis listing/detail/create/update/approval/resolve flows.
- `backend/handler/data.go`: live feed passthrough endpoints (`weather`, `haze`, `floods`, `transport`, `dengue`).
- `backend/handler/feed.go`: feed aggregation/sorting/tagging endpoint.
- `backend/handler/geocode.go`: reverse geocoding proxy (Nominatim + cache).
- `backend/handler/groupchat.go`: per-crisis and per-task group chat endpoints + image upload.
- `backend/handler/health.go`: health/readiness endpoint with env-presence checks.
- `backend/handler/hospitals.go`: static public hospital list endpoint.
- `backend/handler/map.go`: shelter list and map-marker stub.
- `backend/handler/photo.go`: image upload + vision-assisted chat and report helpers.
- `backend/handler/resources.go`: nearby resources (shelter/hospital/AED coverage).
- `backend/handler/tasks.go`: CRUD, membership, matching, and "my tasks" enrichment.
- `backend/handler/triage.go`: triage reports, task generation, per-crisis triage/task persistence.
- `backend/handler/volunteers.go`: volunteer profile, skill catalog, voice transcription endpoint.

#### Ingestion Workers
- `backend/ingestion/nea.go`: NEA PSI/weather ingestion and stale-weather crisis resolution.
- `backend/ingestion/lta.go`: LTA train disruption ingestion.
- `backend/ingestion/pub.go`: PUB water-level ingestion.

#### Core Library
- `backend/lib/brainy_chat.go`: Brainy task-chat/crisis-chat prompt builders and response generation.
- `backend/lib/datasource.go`: live-feed fetch/parse layer for NEA/LTA/PUB datasets.
- `backend/lib/geo.go`: haversine helpers, MRT proximity, regional containment, location labels.
- `backend/lib/llm.go`: OpenAI-compatible chat/JSON/vision client with retries, caching, streaming.
- `backend/lib/matching.go`: skill catalog, skill normalization, task scoring, rationale generation.
- `backend/lib/onemap.go`: OneMap auth/token cache, reverse geocode, thematic retrieval.
- `backend/lib/photo_triage.go`: vision observation -> triage finding mapping rules.
- `backend/lib/sanitize.go`: text normalization and prompt-injection detection.
- `backend/lib/stt.go`: OpenAI-compatible speech-to-text multipart client.
- `backend/lib/supabase.go`: PostgREST/storage client and all data-access methods.
- `backend/lib/taskgen.go`: triage-finding to volunteer-task generation and persistence forwarding.
- `backend/lib/triage.go`: triage threshold and cascade rules engine.
- `backend/lib/triage_demo.go`: deterministic demo provider for triage.
- `backend/lib/triage_live.go`: live triage provider + crisis-ID relinking.
- `backend/lib/triage_prose.go`: LLM enhancement of terse findings into resident-facing prose.

#### Tests
- `backend/lib/llm_injection_test.go`: injection-defense behavior tests.
- `backend/lib/llm_lang_test.go`: language instruction and whitelist tests.
- `backend/lib/photo_triage_test.go`: observation-to-finding and JSON extraction tests.
- `backend/lib/taskgen_test.go`: task generation sanitization/fallback tests.
- `backend/lib/triage_demo_test.go`: demo provider triage behavior tests.
- `backend/lib/triage_live_test.go`: live provider mapping/linking tests.
- `backend/lib/triage_test.go`: triage rule outputs and context tests.

### Database and Data Bootstrap
- `backend/db/schema.sql`: canonical schema, constraints, indexes, update triggers.
- `backend/db/migrations/001_initial.sql`: initial schema bridge.
- `backend/db/migrations/002_chat_sessions.sql`: chat sessions persistence.
- `backend/db/migrations/003_rbac_crisis_approval.sql`: user roles + crisis approval workflow.
- `backend/db/migrations/004_crisis_sensors.sql`: per-crisis sensors JSONB.
- `backend/db/migrations/005_task_groups.sql`: task priority/slots + task membership.
- `backend/db/migrations/006_fix_crisis_timestamps.sql`: timestamp backfill/default fixes.
- `backend/db/migrations/007_skills_matching.sql`: task skill requirements + volunteer profile indexes.
- `backend/db/migrations/008_user_language.sql`: user language preference constraints.
- `backend/db/seeds/demo_crises.sql`: curated demo crises with sensors.
- `backend/db/seeds/seed.sql`: generic sample seed data.
- `backend/db/seeds/seed_users.sql`: demo login accounts.

### Frontend Runtime
- `frontend/src/main.jsx`: React app bootstrap and global style imports.
- `frontend/src/App.jsx`: route table and auth protection wrapper.

#### Frontend Shared Libraries
- `frontend/src/lib/AuthProvider.jsx`: auth state provider and login/logout flows.
- `frontend/src/lib/api.js`: HTTP helper layer (`request`, multipart, SSE stream).
- `frontend/src/lib/auth.js`: auth context and hook exports.
- `frontend/src/lib/lang.js`: language selection constants and local cache helpers.
- `frontend/src/lib/useVoiceRecorder.js`: browser recorder hook and MIME helpers.

#### Pages
- `frontend/src/pages/Chat.jsx`: personal Brainy chat UI (text, stream, photo, voice, session history).
- `frontend/src/pages/CrisisDetail.jsx`: crisis deep view with triage, tasks, matching, and crisis drawer chat.
- `frontend/src/pages/Help.jsx`: guided emergency-intent wizard UI.
- `frontend/src/pages/Home.jsx`: dashboard with greeting, nearby crises card, and action panel.
- `frontend/src/pages/Login.jsx`: login/register + one-click demo identity presets.
- `frontend/src/pages/Map.jsx`: map dashboard with layer filters, stats, and demo/live toggle.
- `frontend/src/pages/Profile.jsx`: account edit, language preference, and skill management.
- `frontend/src/pages/ReportCrisis.jsx`: camera/report capture and submission flow.
- `frontend/src/pages/Tasks.jsx`: task list with status/priority filter chips.
- `frontend/src/pages/Timeline.jsx`: feed page with crisis cards and nearby-resource panel.
- `frontend/src/pages/Volunteers.jsx`: joined-task group chat tabs with voice/image messaging.

#### Components
- `frontend/src/components/BrainyMascot.jsx`: shared Brainy avatar component.
- `frontend/src/components/chat/CameraCapture.jsx`: camera modal used by chat/report flows.
- `frontend/src/components/chat/ChatInput.jsx`: reusable input bar (text, image, mic, send).
- `frontend/src/components/chat/InlineCrisisCard.jsx`: inline triage card in chat responses.
- `frontend/src/components/chat/InlineHospitalCard.jsx`: inline hospital resource card.
- `frontend/src/components/chat/InlineShelterCard.jsx`: inline shelter resource card.
- `frontend/src/components/chat/MessageBubble.jsx`: reusable message bubble renderer.
- `frontend/src/components/crisis/BrainyDrawer.jsx`: crisis-detail slide-in chat drawer.
- `frontend/src/components/crisis/BrainyPanel.jsx`: home-page action + quick-topic panel.
- `frontend/src/components/crisis/CrisisCard.jsx`: home-page "top crises near you" cards.
- `frontend/src/components/feed/PendingReports.jsx`: coordinator approval and reporter pending-report containers.
- `frontend/src/components/layout/NavBar.jsx`: global nav with route links, profile, and logout.
- `frontend/src/components/map/CrisisMarker.jsx`: colored crisis marker + tooltip behavior.
- `frontend/src/components/map/MapView.jsx`: map rendering, clustering, overlays, and recentering.

## 4) Notes for Future Contributors
- Keep schema constraints and handler validations aligned:
  - crisis type/severity enums,
  - language whitelist,
  - role values.
- Keep skill vocabulary synchronized between:
  - `lib/matching.go` catalog,
  - task generation prompts,
  - profile UI chips.
- If changing triage severity names, update:
  - triage engine constants,
  - frontend severity palettes,
  - any status mapping helper.
- If changing task membership rules, update both:
  - handler logic (`JoinTask`, `LeaveTask`),
  - user-facing messaging in `CrisisDetail.jsx` and `Volunteers.jsx`.
