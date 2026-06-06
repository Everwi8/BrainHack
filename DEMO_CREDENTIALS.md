# Demo Accounts

All accounts use the **same password**: `password`

You normally won't need these — the login screen has a one-click preset button
for each account. This file is just a backup reference.

| Role | Name | Email | Password |
|------|------|-------|----------|
| Coordinator | Coordinator Alice | `coordinator1@brainhack.sg` | `password` |
| Coordinator | Coordinator Bob | `coordinator2@brainhack.sg` | `password` |
| Volunteer | Volunteer Carol | `volunteer1@brainhack.sg` | `password` |
| Volunteer | Volunteer Dave | `volunteer2@brainhack.sg` | `password` |
| Volunteer | Volunteer Eve | `volunteer3@brainhack.sg` | `password` |
| Resident | Resident Frank | `resident1@brainhack.sg` | `password` |
| Resident | Resident Grace | `resident2@brainhack.sg` | `password` |
| Resident | Resident Henry | `resident3@brainhack.sg` | `password` |
| Resident | Resident Irene | `resident4@brainhack.sg` | `password` |
| Resident | Resident James | `resident5@brainhack.sg` | `password` |

## Setup after wiping the users table

Two ways to (re)create these accounts:

1. **SQL seed (recommended for a clean slate):** run `backend/seed_users.sql` in
   the Supabase SQL editor. Inserts all 10 with the correct roles.
2. **Self-seeding presets:** just click a preset button on the login screen.
   If the account doesn't exist yet, the app auto-registers it (with its role),
   then logs in. So the demo works even if you skip the SQL step.

Defined in:
- Frontend presets: `frontend/src/pages/Login.jsx`
- SQL seed: `backend/seed_users.sql`
