# BrainySG — MVP Project Plan

**Team:** came4food · DSTA BrainHack 2026 · Fast Response Track
**Stack:** React + Vite + TailwindCSS (frontend) · Go + Gin (backend) · PostgreSQL · Gemini Flash API

---

## Project Context

### Problem Statement

Build a web application that gathers information from different sources to help Singapore respond faster and smarter during disasters or health emergencies.

When crises like floods, haze, dengue outbreaks, or MRT disruptions happen in Singapore, information is fragmented across 5+ government agencies (NEA, LTA, PUB, MOH, SCDF). Citizens piece together what's happening from separate apps (MyENV, SGSecure, OneService), social media, and word of mouth. No existing platform unifies cross-agency data with AI triage and volunteer coordination in one place. The result: delayed response, confused citizens, and uncoordinated volunteer efforts.

### What BrainySG Is

BrainySG is a Progressive Web App (PWA) that acts as Singapore's AI crisis-response platform. It has an AI chatbot mascot called "Brainy" (styled as a cute retro radio character) that serves as the user's crisis co-pilot.

The platform does four things:

1. **Unified Data Layer** — Pulls real-time data from NEA (weather, haze, dengue), LTA (transport disruptions), PUB (flood sensors), MOH (hospital beds), and OneMap into one system.
2. **AI Triage** — Uses an LLM (Gemini Flash) to detect threshold breaches, predict cascading events (e.g. heavy rain → flood → MRT disruption), and auto-generate actionable task cards.
3. **Live Crisis Map** — OneMap-based map showing active crises as red dots, shelters with capacity, and hospitals with bed availability.
4. **Volunteer Coordination** — AI matches volunteers to tasks by skill, distance, and availability. Volunteers join crisis-specific group chats with real-time updates from Brainy and coordinators.

### Target Users

- **Primary (5.9M):** General public — residents, commuters, visitors who need fast location-specific guidance during crises.
- **Secondary (~50K):** Community volunteers — RC/CC members, SCDF CERT teams who need coordination tools.
- **Tertiary (~900K):** Caregivers of elderly/vulnerable who need shelter locations, health advisories, and remote monitoring.

### Tech Stack

- **Frontend:** React 18+ with Vite, TailwindCSS, React Router, PWA (service worker + manifest)
- **Backend:** Go with Gin framework, organized under `backend/` with `handlers/`, `middleware/`, `models/`, `services/` folders
- **Database:** PostgreSQL (using pgx or GORM)
- **AI:** Gemini Flash API (free tier) for chatbot, triage reasoning, photo interpretation, and task generation
- **Maps:** OneMap API (Singapore's national basemap, built on Leaflet)
- **Real-time:** gorilla/websocket for volunteer group chat
- **Speech-to-text:** Google STT or Whisper API for voice transcription
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
- All government data is polled by the backend at 5-minute intervals and cached (go-cache or Redis)
- If a government API fails, backend serves last-known-good cached data (graceful degradation)
- Triage logic is rule-based cascade chains (not ML) — hardcoded relationships fed into Gemini prompts as context
- Hospital bed data is annual/static from MOH — displayed as "last reported" or simulated for demo
- Auth is simple JWT for MVP (no Singpass integration yet)
- PWA installable on any device — no app store required

---

## API Contract (Agree Before Coding)

> Sanjey defines these. Everyone else codes against them with mock data until endpoints are live.

| Endpoint | Method | Owner | Consumer |
|---|---|---|---|
| `/api/crises` | GET | Sanjey | Aiya, Jerald |
| `/api/crises/:id` | GET | Sanjey | Jerald, Perrin |
| `/api/crises/nearby?lat=&lng=` | GET | Jerald | Aiya, Jerald |
| `/api/tasks` | GET/POST | Sanjey | Jerald, James |
| `/api/tasks/:id` | PATCH | Sanjey | James |
| `/api/chat` | POST | Perrin | Perrin |
| `/api/chat/photo` | POST | Perrin | Perrin |
| `/api/volunteers` | GET/POST | James | James, Jerald |
| `/api/volunteers/match` | POST | James | James |
| `/api/groupchat/:crisisId` | GET/POST | James | James |
| `/api/shelters?lat=&lng=` | GET | Jerald | Jerald, Perrin |
| `/api/hospitals` | GET | Sanjey | Jerald |
| `/api/transcribe` | POST | James | James |
| `/api/auth/login` | POST | Sanjey | All |
| `/api/data/weather` | GET | Sanjey | Perrin |
| `/api/data/floods` | GET | Sanjey | Perrin, Jerald |
| `/api/data/haze` | GET | Sanjey | Perrin |
| `/api/data/dengue` | GET | Sanjey | Perrin |
| `/api/data/transport` | GET | Sanjey | Perrin |

---

## Aiya — App Shell + Home Page

### Frontend

- [x] React + Vite project scaffolding (folder structure, aliases, env config)
- [ ] TailwindCSS setup and theme config (colors, fonts matching BrainySG brand)
- [ ] PWA manifest + service worker for installability
- [x] Global nav bar component (Home / Map / Tasks / Feed / Chat tabs)
- [x] React Router setup with all route placeholders
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
- [ ] Responsive layout (desktop + mobile)
- [x] User avatar / profile icon in nav

### Backend

- [ ] None — consumes Sanjey's endpoints

### Mock Data Needed

- [x] 3-5 sample crisis objects (fire, flood, haze) with location, status, distance
- [ ] Sample user profile (name, location)
- [x] Sample notification/alert banner data

---

## Sanjey — Data Pipeline + Backend Core

### Frontend

- [ ] None (optional: simple `/admin/status` debug page showing API ingestion health)

### Backend — Project Setup

- [x] Go project init (`go mod init`) with Gin framework
- [x] Project structure: `handlers/`, `middleware/` (models/, services/, config/ not yet created)
- [x] Environment config (`.env` or config file for API keys, DB connection, ports)
- [x] CORS middleware for frontend dev server
- [ ] Error handling middleware
- [ ] Request logging middleware (Gin logger or custom)
- [ ] API rate limiting middleware

### Backend — Database

- [ ] PostgreSQL connection setup (pgx or GORM)
- [ ] Schema: `users` (id, name, email, password_hash, location, role, created_at)
- [ ] Schema: `crises` (id, type, title, description, severity, status, lat, lng, address, source, created_at, updated_at)
- [ ] Schema: `tasks` (id, crisis_id, title, description, status, priority, volunteers_needed, created_at)
- [ ] Schema: `volunteers` (id, user_id, skills, availability, lat, lng)
- [ ] Schema: `reports` (id, user_id, crisis_id, type, content, photo_url, lat, lng, created_at)
- [ ] Migration scripts
- [ ] Seed scripts with realistic sample data

### Backend — Auth

- [ ] JWT-based auth middleware
- [ ] Login / register endpoints
- [ ] Protect relevant routes

### Backend — Data Ingestion

- [ ] NEA Weather API (real-time weather forecasts, heavy rain warnings)
- [ ] NEA PSI / PM2.5 API (haze readings)
- [ ] NEA Dengue clusters API
- [ ] PUB MyWaters API (flood sensor water levels)
- [ ] LTA DataMall API (MRT/bus disruptions)
- [ ] MOH data (hospital bed counts — static/annual, seeded into DB)
- [ ] 5-minute polling interval with go-cache or Redis
- [ ] Graceful degradation: serve last-known-good data if API fails
- [ ] Cross-check logic (e.g. NEA rain + PUB water level = flood confidence)

### Backend — API Routes

- [x] `GET /api/crises` — list all active crises, filterable by type/status (route registered, handler stub)
- [x] `GET /api/crises/:id` — single crisis detail (route registered, handler stub)
- [ ] `GET /api/crises/nearby?lat=&lng=&radius=` — crises within radius
- [x] `GET /api/tasks` — list tasks, filterable by crisis_id/status (route registered, handler stub)
- [x] `POST /api/tasks` — create task (coordinator only) (route registered, handler stub)
- [x] `PATCH /api/tasks/:id` — update task status (route registered as PUT, handler stub)
- [ ] `GET /api/hospitals` — hospital list with bed counts and BOR
- [ ] `GET /api/data/weather` — latest weather data
- [ ] `GET /api/data/floods` — latest flood sensor readings
- [ ] `GET /api/data/haze` — latest PSI/PM2.5
- [ ] `GET /api/data/dengue` — dengue cluster locations
- [ ] `GET /api/data/transport` — MRT disruption status

---

## Perrin — AI Chatbot + Triage

### Frontend

- [x] **Chat Conversation Page**
  - [x] Message bubble layout (user messages right-aligned, Brainy left-aligned)
  - [x] Brainy avatar next to AI messages
  - [x] Timestamps on messages
  - [x] Auto-scroll to latest message
- [x] **Chat Input Bar**
  - [x] Text field with send button
  - [x] Camera icon button for photo capture
  - [x] Microphone icon (triggers James's voice flow, or links to it)
- [ ] **Photo Capture Flow**
  - [ ] Camera button → device camera / file picker
  - [ ] Photo preview before sending
  - [ ] Upload with loading indicator
  - [ ] AI response with situation analysis
- [x] **Inline Rich Cards in Chat**
  - [x] Shelter card (name, distance, "View Map" link) — like the Pasir Ris Community Club card
  - [ ] Hospital card (name, bed availability)
  - [ ] Crisis summary card
- [x] **Quick-Action Chips**
  - [x] Persistent bottom bar: Floods, Shelters, Help, Find out more
  - [x] Tapping a chip sends it as a message
- [x] Brainy intro message on first open ("I'm Brainy! Your personal emergency buddy...")

### Backend

- [ ] **Gemini Flash API Integration**
  - [ ] API client wrapper under `backend/services/`
  - [ ] System prompt design for crisis chatbot persona (Brainy)
  - [ ] Conversation context management (maintain history per session)
  - [ ] Structured JSON output parsing for task cards
  - [ ] Error handling and retry logic for API failures
- [ ] **Triage Logic**
  - [ ] Threshold rules: water level > X% → flood warning
  - [ ] Threshold rules: PSI > 100 → haze advisory
  - [ ] Threshold rules: dengue cases > X in cluster → health alert
  - [ ] Cascade rules: heavy rain + high water → flood risk
  - [ ] Cascade rules: flood at location + nearby MRT → transport disruption
  - [ ] Cascade rules: high PSI + dengue cluster → compound health risk
  - [ ] Feed live data from Sanjey's endpoints into prompt context
- [ ] **Auto Task Card Generation**
  - [ ] AI generates structured task card JSON from triage output
  - [ ] POST generated tasks to Sanjey's `/api/tasks` endpoint
  - [ ] Task fields: title, description, priority, volunteers_needed, crisis_id
- [ ] **Photo Interpretation**
  - [ ] Accept image upload via `POST /api/chat/photo`
  - [ ] Send image to Gemini Flash vision
  - [ ] Return situation description + recommended actions
- [x] **Chat Endpoints**
  - [x] `POST /api/chat` — send text message, return AI response (route registered, handler stub)
  - [ ] `POST /api/chat/photo` — send image, return AI analysis
- [ ] Chat history storage (in-memory for MVP, or DB)

### Mock Data Needed

- [x] Sample crisis data to inject into prompts for testing (without Sanjey's endpoints)
- [ ] Sample photos of flood/fire/haze scenarios for testing vision

---

## Jerald — Map + Crisis Detail

### Frontend

- [ ] **Map Page**
  - [ ] OneMap embed/integration (using onemap-leaflet or Leaflet with OneMap tiles)
  - [ ] Red dot markers for active crises (sized/colored by severity)
  - [ ] Green markers for shelters (with capacity label)
  - [ ] Blue markers for hospitals (with bed count label)
  - [ ] User location marker ("You are here")
  - [ ] Marker clustering if too many points
  - [ ] Map filter/overlay toggles (show/hide: crises, shelters, hospitals)
  - [ ] Click marker → popup summary → link to crisis detail
- [ ] **Crisis Detail Page**
  - [ ] AI-generated situation summary (from Perrin's triage)
  - [ ] Crisis metadata (type, severity, location, last updated)
  - [ ] Water level / sensor reading display (if flood)
  - [ ] Task card list with status badges (Pending / In Progress / Resolved)
  - [ ] Volunteer count ("12 helpers")
  - [ ] "I Want to Help" confirmation button → triggers James's volunteer flow
  - [ ] Link to group chat for this crisis
- [x] **Map on Home Page**
  - [x] "View SG Map" button links to full map page

### Backend

- [ ] **Geospatial Queries**
  - [ ] `GET /api/crises/nearby?lat=&lng=&radius=` — crises within radius (Haversine or PostGIS)
  - [ ] `GET /api/shelters?lat=&lng=` — nearest shelters sorted by distance
- [ ] **Shelter Data**
  - [ ] Parse shelter locations from OneMap / data.gov.sg
  - [ ] Store in DB with coordinates and capacity
- [x] **Map Marker Endpoint**
  - [x] `GET /api/map/markers?types=crises,shelters,hospitals` — returns all markers (route registered, handler stub)
- [ ] **Crisis Detail Endpoint**
  - [ ] `GET /api/crises/:id` — aggregates crisis data from Sanjey's DB + triage summary from Perrin + task list

### Mock Data Needed

- [ ] 5-10 crisis markers across Singapore (various types and severities)
- [ ] 10+ shelter locations with capacity numbers
- [ ] 8 public hospital locations with bed counts

---

## James — Volunteer System + Group Chat + Voice

### Frontend

- [ ] **Volunteer Group Chat Page**
  - [ ] Tab bar for chat rooms (Brainy general / Flash Flood / Fire — one per crisis)
  - [ ] Crisis header with summary (e.g. "Flash Flood - Pasir Ris Dr 3 · Water 76% · 12 helpers · 3 Open Tasks")
  - [ ] Message list with different message types:
    - [ ] Brainy auto-update messages (green dot, system-style)
    - [ ] Coordinator messages (blue dot, official-style)
    - [ ] Volunteer messages (standard chat bubble)
  - [ ] Message input bar with text field + send button
  - [ ] Voice record button (microphone icon)
  - [ ] Camera and attachment buttons
- [ ] **Voice Recording UI**
  - [ ] Tap mic → recording indicator (waveform or timer)
  - [ ] Stop → "Transcribing..." indicator
  - [ ] Transcribed text appears in chat input or sent directly
- [ ] **"I Want to Help" Registration Flow**
  - [ ] Triggered from Jerald's crisis detail page
  - [ ] Skill input (checkboxes: has car, medical training, heavy lifting, etc.)
  - [ ] Availability toggle
  - [ ] Confirmation → added to crisis volunteer pool
- [ ] **Task Status Tracker**
  - [ ] Task card with status badge (Pending → Assigned → In Progress → Resolved)
  - [ ] Volunteer can update status on assigned tasks

### Backend

- [ ] **Speech-to-Text**
  - [ ] Accept audio upload via `POST /api/transcribe`
  - [ ] Integration with Google STT or Whisper API
  - [ ] Return transcribed text
  - [ ] Forward transcribed text to Perrin's `POST /api/chat` as standard message
- [x] **Volunteer System**
  - [x] `POST /api/volunteers` — register with skills, location, availability (route registered, handler stub)
  - [x] `GET /api/volunteers?crisis_id=` — list volunteers for a crisis (route registered, handler stub)
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

- [ ] Agree on API response JSON shapes (30-min team meeting)
- [ ] Agree on crisis type enum (flood, fire, haze, dengue, transport, pandemic)
- [ ] Agree on severity enum (low, warning, critical)
- [ ] Agree on task status enum (pending, assigned, in_progress, resolved)
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
| NEA | data.gov.sg | Weather, PSI, PM2.5, dengue clusters | 5min-1hr | Yes |
| PUB | data.gov.sg / MyWaters | Flood sensor water levels | ~5min | Yes |
| LTA | LTA DataMall | MRT/bus disruptions, traffic | ~5min | Yes (API key) |
| MOH | data.gov.sg | Hospital bed counts, BOR | Annual | Yes |
| OneMap | onemap.gov.sg | Basemap, geocoding, routing | Live | Yes |
| Notify SG | GovTech | Push notifications to citizens | Live | Yes |
| Gemini Flash | Google AI | LLM for chatbot + vision | Per request | Free tier |

---

## Notes

- Hospital bed data is **annual/static**, not live. Display as "last reported" or simulate for demo.
- All frontend work can proceed with mock data before Sanjey's endpoints are ready.
- Perrin's AI work is independently testable against Gemini Flash API.
- Update the pitch deck: Flask → Go + Gin, Claude → Gemini Flash (or say "LLM API").
