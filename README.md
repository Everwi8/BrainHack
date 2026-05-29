# BrainHack — Developer Guide

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19 + Vite, TailwindCSS, React Router v7, lucide-react |
| Backend | Go + Gin framework |
| Database | Supabase (PostgreSQL) |
| Auth | JWT (issued by backend) |
| AI | Gemini Flash API |
| Maps | OneMap Singapore |
| STT | Google STT or Whisper API |

---

## Running the project

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Backend

```bash
cd backend
cp .env.example .env   # fill in your keys
go mod tidy
go run main.go         # http://localhost:8080
```

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
| --- | --- |
| `PORT` | Backend port (default 8080) |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:5173`) |
| `SUPABASE_URL` | From your Supabase project settings |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only — keep secret |
| `JWT_SECRET` | Any long random string |
| `GEMINI_API_KEY` | From Google AI Studio |

Copy `frontend/.env.example` to `frontend/.env` if needed.

---

## API base URL

All backend routes are prefixed `/api`. The frontend `lib/api.js` should point to `http://localhost:8080`.

---

## Ownership map

### Sanjey — Data Pipeline + Backend Core

**Your files:**

```text
backend/
├── main.go                   ← router wiring (owns overall structure)
├── handler/auth.go           ← POST /api/auth/register, POST /api/auth/login
├── handler/crises.go         ← GET /api/crises, GET /api/crises/:id
├── handler/tasks.go          ← GET/POST/PUT/DELETE /api/tasks
├── middleware/auth.go        ← JWT verification middleware
├── middleware/cors.go        ← CORS headers
├── cache/cache.go            ← 5-min in-memory cache, graceful degradation
├── ingestion/nea.go          ← NEA: weather, haze, dengue
├── ingestion/lta.go          ← LTA DataMall: MRT disruptions
├── ingestion/pub.go          ← PUB MyWaters: flood sensors, water levels
├── ingestion/moh.go          ← MOH open data
├── lib/supabase.go           ← Supabase REST client
└── db/
    ├── schema.sql            ← tables: crises, tasks, users, volunteers, reports
    ├── migrations/
    └── seeds/
```

**Endpoints you must expose (others depend on these):**

- `GET /api/crises` — accepts `?lat=&lng=&radius=` query params
- `GET /api/crises/:id`
- `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`
- `POST /api/auth/register`, `POST /api/auth/login` → returns `{ token }`

---

### Aiya — App Shell + Home Page

**Your files:**

```text
frontend/src/
├── main.jsx                        ← React Router setup
├── App.jsx                         ← root layout + routes
├── pages/Home.jsx                  ← crisis cards list (left) + Brainy panel (right)
├── pages/Help.jsx                  ← "I Need Help" 8-tile grid + SOS-995 button
├── components/layout/NavBar.jsx    ← Home / Map / Tasks / Feed / Chat tabs
├── components/crisis/CrisisCard.jsx
└── components/crisis/BrainyPanel.jsx
```

**Depends on:** `GET /api/crises` from Sanjey for the home page crisis list.

---

### Perrin — AI Chatbot + Triage

**Your files:**

```text
frontend/src/
├── pages/Chat.jsx
├── components/chat/MessageBubble.jsx
├── components/chat/ChatInput.jsx         ← text + camera button
└── components/chat/InlineShelterCard.jsx

backend/
├── handler/chat.go    ← POST /api/chat
└── lib/gemini.go      ← Gemini Flash client, system prompt, context mgmt
```

**Depends on:** Sanjey's crisis/task data endpoints for triage thresholds. Sanjey owns `lib/supabase.go` — coordinate on chat history storage.

---

### Jerald — Map + Crisis Detail

**Your files:**

```text
frontend/src/
├── pages/Map.jsx
├── pages/CrisisDetail.jsx           ← AI summary, task cards, "I Want to Help" button
├── components/map/MapView.jsx       ← OneMap embed + filter toggles
└── components/map/CrisisMarker.jsx  ← severity-coded red dot markers

backend/
└── handler/map.go    ← GET /api/map/markers
```

**Depends on:**

- Sanjey's `GET /api/crises/:id` for crisis detail data and tasks
- Perrin's triage output (AI summary) for the Crisis Detail page

---

### James — Volunteer System + Group Chat + Voice

**Your files:**

```text
frontend/src/
├── pages/Volunteers.jsx
├── components/volunteer/VolunteerForm.jsx   ← skill input, availability toggle
├── components/volunteer/TaskTracker.jsx     ← Pending → Assigned → In Progress → Resolved
└── components/volunteer/VoiceRecorder.jsx  ← record → stop → transcribing → sent

backend/
└── handler/volunteers.go   ← GET/POST /api/volunteers, POST /api/voice
```

**Depends on:**

- Sanjey's task routes for assignment + status updates
- Perrin's `POST /api/chat` — forward transcribed voice text there as a standard message

---

## Shared files — coordinate before editing

| File | Owner | Used by |
| --- | --- | --- |
| `frontend/src/lib/api.js` | Aiya | everyone making API calls |
| `frontend/src/lib/supabase.js` | Aiya | anyone reading DB client-side |
| `frontend/src/hooks/useCrises.js` | shared | Aiya, Jerald |
| `frontend/src/hooks/useAuth.js` | shared | Aiya, Perrin, James |
| `backend/main.go` | Sanjey | Sanjey registers all routes here |
| `backend/db/schema.sql` | Sanjey | everyone — source of truth for table shapes |

---

## Icons

Use `lucide-react` for all icons — already installed.

```jsx
import { AlertTriangle, MapPin, Phone, User } from 'lucide-react'

<AlertTriangle size={20} className="text-red-500" />
```

Browse icons at [lucide.dev](https://lucide.dev).

---

## Notes

- The backend default port is **8080** (not 3000 — it's Go, not Express).
- All protected routes should use `middleware.RequireAuth()` from `backend/middleware/auth.go` — Sanjey's job to wire up.
- For real-time group chat (James), consider a WebSocket handler in a new `handler/ws.go` — coordinate with Sanjey so it's registered in `main.go`.
- Ingestion scripts (Sanjey) run as background goroutines on startup and populate the `crises` table that everyone reads from.
