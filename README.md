# BrainySG — AI Crisis Response for Singapore

> 🏆 **BrainHack 2026 finalist — Open Track.** Built as a hackathon MVP and
> polished after the event — this README is the clone-and-run guide for anyone
> picking it up.

BrainySG is a community crisis-response app for Singapore. It pulls live data
from cross-agency government feeds (NEA, LTA, PUB), surfaces active situations on
a map, and uses an LLM to triage each crisis into a plain-language summary plus
concrete volunteer tasks. Residents can report incidents, coordinators approve
and manage them, and volunteers get matched to tasks by skill and coordinate in
per-task group chats. **"Brainy"** is the in-app assistant that answers questions
over the live situation via text, photo, or voice — in the user's chosen
language.

See [`architecture.md`](architecture.md) for a full system diagram.

---

## Highlights

- **Live cross-agency data** — NEA (weather, haze, dengue), LTA DataMall (MRT
  alerts), PUB (flood sensors), polled every 5 minutes and surfaced on a map.
- **LLM triage** — each crisis is turned into a resident-facing summary and a set
  of concrete, staffable volunteer tasks.
- **Brainy assistant** — grounded chat over the live situation via text, photo
  (vision), or voice (Whisper), with token streaming and a per-user reply
  language (English / Mandarin / Malay / Tamil / Singlish).
- **Skill-based volunteer matching** — volunteers register skills; the app ranks
  a crisis's open tasks for them.
- **Role-based workflow** — residents report, coordinators approve/resolve,
  volunteers join tasks and coordinate in per-task group chats.
- **Singapore-native maps** — OneMap tiles, reverse-geocoding, civic resources
  ("Near you": AED / shelter / hospital), and drive + public-transport ETAs.

---

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19 + Vite, React Router v7, lucide-react |
| Maps | Leaflet + react-leaflet (+ marker clustering), OneMap tiles |
| Backend | Go + Gin |
| Database / Storage | Supabase (PostgreSQL + Storage) |
| Auth | JWT issued by the backend, role-based (resident / volunteer / coordinator) |
| LLM | OpenAI — `gpt-4.1-mini` (multimodal) for chat + vision + situation assessments; `gpt-5.4-mini` (reasoning) for triage / task-card JSON |
| Speech-to-text | OpenAI `whisper-1` |
| Live data | NEA (weather, haze, dengue), LTA DataMall (MRT alerts), PUB (flood sensors), OneMap (tiles + geocode + civic themes) |

---

## Getting started

You need **Node 18+**, **Go 1.21+**, and a **Supabase** project.

### 1. Database

Run the migrations in `backend/db/migrations/` **in order** against your Supabase
project (paste each into the SQL editor, or pipe with `psql`). They are **not**
run automatically:

```text
001_initial.sql              tables: crises, tasks, users, volunteers, reports
002_chat_sessions.sql        per-user chat history (JSONB)
003_rbac_crisis_approval.sql roles + crisis approval queue
004_crisis_sensors.sql       sensor metadata on crises
005_task_groups.sql          persisted AI tasks + per-task group chats
006_fix_crisis_timestamps.sql  created_at/updated_at defaults + backfill
007_skills_matching.sql      volunteer skills + skill-based task matching
008_user_language.sql        per-user preferred Brainy reply language
```

Then load demo data from `backend/db/seeds/`:

- `seed_users.sql` — the 10 demo accounts (see [Demo accounts](#demo-accounts))
- `demo_crises.sql` — curated crisis scenario (used when `DATA_SOURCE=demo`)

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in your keys (see below)
go mod tidy
go run main.go         # http://localhost:8080
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # set VITE_API_URL if your backend isn't on :8080
npm install
npm run dev            # http://localhost:5173
```

The frontend reads the backend URL from `VITE_API_URL` (`frontend/.env`,
defaults to `http://localhost:8080`).

---

## Environment variables

Copy `backend/.env.example` to `backend/.env`:

| Variable | Description |
| --- | --- |
| `PORT` | Backend port (default `8080`) |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:5173`) |
| `DATA_SOURCE` | `demo` serves only seed crises and pauses live ingestion; blank = live feeds |
| `SUPABASE_URL` | From Supabase → Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Public (anon) key |
| `SUPABASE_SECRET_KEY` | Server-side service key — keep secret |
| `JWT_SECRET` | Any long random string |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | OpenAI chat-completions for chat + vision; defaults `gpt-4.1-mini`. `LLM_TIMEOUT_SECONDS` (default 60) raises the per-attempt timeout |
| `LLM_JSON_MODEL` / `LLM_JSON_REASONING_EFFORT` | Model + reasoning effort for the structured-output path (triage + task cards); blank reuses `LLM_MODEL`. Defaults `gpt-5.4-mini` / `low`. GPT-5/o-series models use `max_completion_tokens` automatically |
| `STT_API_KEY` / `STT_BASE_URL` / `STT_MODEL` | Whisper-compatible STT; defaults `whisper-1` |
| `LTA_API_KEY` | LTA DataMall (free at datamall.lta.gov.sg); blank skips MRT ingestion |
| `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` | OneMap account (free at onemap.gov.sg) for reverse-geocoding, civic resources, and ETAs; the server auto-fetches and auto-renews the token. Blank falls back to coarse region labels |

Frontend (`frontend/.env.example` → `frontend/.env`):

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Backend base URL (default `http://localhost:8080`) |

---

## Demo accounts

All 10 demo accounts use the password **`password`**. The login screen has a
one-click preset button per account (auto-registers if missing), so you usually
don't need to type credentials.

| Role | Accounts |
| --- | --- |
| Coordinator | `coordinator1@brainhack.sg`, `coordinator2@brainhack.sg` |
| Volunteer | `volunteer1@brainhack.sg` … `volunteer3@brainhack.sg` |
| Resident | `resident1@brainhack.sg` … `resident5@brainhack.sg` |

---

## Data sources

Set `DATA_SOURCE=demo` to run the app on a curated, deterministic scenario
(`db/seeds/demo_crises.sql`) — live ingestion is paused so seed rows aren't
overwritten. Leave it blank for **live mode**, where three ingestion goroutines
poll NEA, LTA, and PUB every 5 minutes and upsert into Supabase. The source can
also be flipped at runtime via `POST /api/admin/data-source`.

---

## API overview

All routes are prefixed `/api`. Reads are mostly public; writes require a JWT,
and some are gated to the `coordinator` role.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login` → `{ token }`; `GET/PATCH /auth/me` (own profile: name / password / reply language) |
| Crises (read) | `GET /crises`, `GET /crises/:id`, `GET /crises/:id/triage` |
| Crises (report) | `POST /crises`, `PATCH /crises/:id`, `GET /crises/mine` |
| Crises (coordinator) | `GET /crises/pending`, `POST /crises/:id/{approve,reject,resolve}` |
| Crisis chat | `POST /crises/:id/chat`, `POST /crises/:id/chat/photo` (crisis-grounded Brainy drawer) |
| Tasks | `GET /tasks`, `GET /tasks/mine`, `POST/PATCH/DELETE /tasks/:id`, `POST/DELETE /tasks/:id/join` |
| Matching | `GET /crises/:id/match` (rank a crisis's open tasks for the caller's skills) |
| AI chat | `POST /chat`, `POST /chat/stream` (SSE), `POST /chat/photo`, `GET/POST/DELETE /chat/sessions[/:id]` |
| Triage | `GET /triage`, `GET /triage/tasks` |
| Data | `GET /data/{weather,haze,floods,transport,dengue}`, `GET /hospitals`, `GET /shelters`, `GET /feed` |
| Geo | `GET /geocode/reverse`, `GET /resources/nearby`, `GET /route` (drive + transit ETA) |
| Map | `GET /map/markers` |
| Volunteers / voice | `GET/POST /volunteers`, `GET /volunteers/skills`, `GET /volunteers/me`, `POST /voice` |
| Group chat | `GET/POST /groupchat/:crisisID/messages`, `POST /groupchat/image` |
| Task chat | `GET/POST /taskchat/:taskID/messages` (membership-gated) |
| Admin | `GET/POST /admin/data-source` |

---

## Project structure

```text
backend/
├── main.go              router wiring + ingestion goroutines + graceful shutdown
├── handler/             HTTP handlers (auth, crises, tasks, chat, map, data,
│                          geocode, resources, route, volunteers, …)
├── middleware/          JWT auth guard, role guard, CORS
├── ingestion/           nea.go, lta.go, pub.go — 5-min pollers → Supabase
├── lib/                 llm.go, stt.go, triage*.go, taskgen.go, matching.go,
│                          onemap.go, datasource.go, supabase.go, sanitize.go
├── cache/               in-memory cache with graceful degradation
└── db/                  schema.sql, migrations/, seeds/

frontend/src/
├── pages/               Home, Map, CrisisDetail, Tasks, Chat, Volunteers,
│                          ReportCrisis, Timeline, Profile, Help, Login
├── components/          chat/, crisis/, map/, feed/, layout/
└── lib/                 api.js, auth.js, AuthProvider.jsx, useVoiceRecorder.js
```

---

## How it works (notes)

- Backend default port is **8080** (Go/Gin, not Express).
- Protected routes use `middleware.RequireAuth()`; coordinator-only routes add
  `middleware.RequireRole("coordinator")`.
- The LLM layer (`lib/llm.go`) routes by task: chat, photo triage, and the
  AI-written situation assessment run on the multimodal chat model
  (`gpt-4.1-mini`); the structured-output path — triage findings → task-card JSON
  (`ChatJSON`) — runs on a reasoning model (`gpt-5.4-mini`, low effort) for
  sharper judgment. `lib/stt.go` handles voice → text via Whisper.
- Situation assessments are LLM-generated, not templates: the rule engine
  produces terse findings, then `lib/triage_prose.go` expands each into a
  resident-facing paragraph, cached by finding identity and falling back to the
  template on any LLM error.
- Brainy replies in the user's preferred language (Singlish / Mandarin / Malay /
  Tamil), stored per-account (migration `008`).
- Skill-based matching (`lib/matching.go`): the task generator tags each task
  with `skills_needed`; `GET /crises/:id/match` ranks open tasks against the
  caller's saved volunteer skills.
- Volunteer slots are finite: joining a task decrements its `volunteers_needed`,
  leaving restores it, and at 0 the card shows "Fully staffed" and blocks new
  joins (coordinators are exempt — they oversee rather than fill a slot).
- Residents/volunteers may hold **one task at a time** across all crises: joining
  a second returns `409` with the current task id, and the UI offers
  leave-and-switch (coordinators are unlimited).
- Icons come from [`lucide-react`](https://lucide.dev) — already installed.
