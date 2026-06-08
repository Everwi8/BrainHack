# BrainySG — AI Crisis Response for Singapore

BrainySG is a community crisis-response app for Singapore. It pulls live data
from cross-agency government feeds (NEA, LTA, PUB), surfaces active situations on
a map, and uses an LLM to triage each crisis into a plain-language summary plus
concrete volunteer tasks. Residents can report incidents, coordinators approve
and manage them, and volunteers join tasks and coordinate in per-task group
chats. "Brainy" is the in-app assistant that answers questions over the live
situation via text, photo, or voice.

See [`architecture.md`](architecture.md) for a system diagram.

---

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19 + Vite, React Router v7, lucide-react |
| Maps | Leaflet + react-leaflet (+ marker clustering), OneMap tiles |
| Backend | Go + Gin |
| Database / Storage | Supabase (PostgreSQL + Storage) |
| Auth | JWT issued by the backend, role-based (resident / volunteer / coordinator) |
| LLM | OpenAI `gpt-4.1-mini` — single multimodal model for text **and** vision |
| Speech-to-text | OpenAI `whisper-1` |
| Live data | NEA (weather, haze, dengue), LTA DataMall (MRT alerts), PUB (flood sensors) |

---

## Getting started

You need **Node 18+**, **Go 1.21+**, and a **Supabase** project.

### 1. Database

Run the migrations in `backend/db/migrations/` **in order** against your Supabase
project (paste each into the SQL editor, or pipe with `psql`). They are not run
automatically:

```text
001_initial.sql          tables: crises, tasks, users, volunteers, reports
002_chat_sessions.sql    per-user chat history (JSONB)
003_rbac_crisis_approval.sql   roles + crisis approval queue
004_crisis_sensors.sql   sensor metadata on crises
005_task_groups.sql      persisted AI tasks + per-task group chats
```

Then load demo data from `backend/db/seeds/`:

- `seed_users.sql` — the 10 demo accounts (see [`DEMO_CREDENTIALS.md`](DEMO_CREDENTIALS.md))
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
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | OpenAI chat-completions; defaults `gpt-4.1-mini` |
| `STT_API_KEY` / `STT_BASE_URL` / `STT_MODEL` | Whisper-compatible STT; defaults `whisper-1` |
| `LTA_API_KEY` | LTA DataMall (free at datamall.lta.gov.sg); blank skips MRT ingestion |

Frontend (`frontend/.env.example` → `frontend/.env`):

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Backend base URL (default `http://localhost:8080`) |

---

## Demo accounts

All 10 demo accounts use the password `password`. The login screen has a
one-click preset button per account (auto-registers if missing), so you usually
don't need to type credentials. Full list in [`DEMO_CREDENTIALS.md`](DEMO_CREDENTIALS.md).

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
| Auth | `POST /auth/register`, `POST /auth/login` → `{ token }` |
| Crises (read) | `GET /crises`, `GET /crises/:id`, `GET /crises/:id/triage` |
| Crises (report) | `POST /crises`, `PATCH /crises/:id`, `GET /crises/mine` |
| Crises (coordinator) | `GET /crises/pending`, `POST /crises/:id/{approve,reject,resolve}` |
| Tasks | `GET /tasks`, `GET /tasks/mine`, `POST/PATCH/DELETE /tasks/:id`, `POST/DELETE /tasks/:id/join` |
| AI chat | `POST /chat`, `POST /chat/photo`, `GET/POST/DELETE /chat/sessions[/:id]` |
| Triage | `GET /triage`, `GET /triage/tasks` |
| Data | `GET /data/{weather,haze,floods,transport,dengue}`, `GET /hospitals`, `GET /shelters`, `GET /feed` |
| Map | `GET /map/markers` |
| Volunteers / voice | `GET/POST /volunteers`, `POST /voice` |
| Group chat | `GET/POST /groupchat/:crisisID/messages`, `POST /groupchat/image` |
| Task chat | `GET/POST /taskchat/:taskID/messages` (membership-gated) |
| Admin | `GET/POST /admin/data-source` |

---

## Project structure

```text
backend/
├── main.go              router wiring + ingestion goroutines + graceful shutdown
├── handler/             HTTP handlers (auth, crises, tasks, chat, map, data, …)
├── middleware/          JWT auth guard, role guard, CORS
├── ingestion/           nea.go, lta.go, pub.go — 5-min pollers → Supabase
├── lib/                 llm.go, stt.go, triage*.go, taskgen.go, datasource.go, supabase.go
├── cache/               in-memory cache with graceful degradation
└── db/                  schema.sql, migrations/, seeds/

frontend/src/
├── pages/               Home, Map, CrisisDetail, Tasks, Chat, Volunteers, ReportCrisis, …
├── components/          chat/, crisis/, map/, volunteer/, feed/, layout/
└── lib/                 api.js, auth.js, AuthProvider.jsx, useVoiceRecorder.js
```

---

## Notes

- Backend default port is **8080** (Go/Gin, not Express).
- Protected routes use `middleware.RequireAuth()`; coordinator-only routes add
  `middleware.RequireRole("coordinator")`.
- The LLM layer (`lib/llm.go`) is one multimodal client for chat, photo triage,
  and task generation; `lib/stt.go` handles voice → text via Whisper.
- Icons come from [`lucide-react`](https://lucide.dev) — already installed.
