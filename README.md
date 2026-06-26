# Eurowings · Training / Project Management Cockpit

This repository contains two apps:

1. **PM Cockpit** — `mockup.html` — a self-contained, single-file project‑management
   tool (the app this project currently focuses on).
2. **TO DO App** — a React + Vite + Supabase PWA under `src/` (real‑time synced task app).

---

## 1) PM Cockpit (`mockup.html`)

A professional, **multi‑project** project‑management cockpit in Eurowings branding.
Originally built for the Boeing 737 MAX training programme, it is now a **general
multi‑project tool** that works for any kind of project.

> **No build, no server, no install.** Just open `mockup.html` in any modern browser
> (desktop laptop or iPad). Everything runs locally; the interface is in English.

### Features

- **Portfolio home page** — every project as a status card (RAG health, progress ring,
  open / critical / milestone / task counts, status mini‑bar, target date) plus
  portfolio‑level KPIs. Create / rename / delete projects.
- **Per‑project workspace** — independent **Dashboard**, **Tasks** table, **Gantt**
  timeline, **To‑Do** checklists and **Report** for each project.
- **To‑Do tab** — a checklist per task (the Gantt sub‑items), grouped by workstream:
  add / tick off / edit / delete to‑dos, with per‑task progress, filters (workstream,
  search, open‑only, hide empty) and a summary. Synced and backed up with everything else.
- **Master task list** — 18 columns (Workstream, Sub‑Workstream, Task‑ID, Task/Deliverable,
  Description, Owner, Supporting depts, Start, Due, Duration, Priority, Status,
  % Completion, Milestone, Dependencies, Risks/Issues, Last update, Comment).
  Every row is **editable inline**; add / duplicate / delete rows.
- **Live statistics** — KPIs, RAG overview, per‑workstream progress and overall progress
  recompute on every edit.
- **Status automation** — overdue, non‑completed tasks flip to **Delayed** automatically
  (and back when the due date moves forward); *Last update* is stamped automatically.
- **Critical path** — binding dependency chain to the latest milestone, highlighted in the
  table (flag + filter), on the dashboard, and in the Gantt (red bars + **dependency arrows**).
- **Milestone tracking** — programme milestones with status and dates.
- **One‑page status reports** — branded **project** and **portfolio** reports, print‑ready.
- **Custom workstreams per project** — add / rename / re‑code / remove workstreams;
  renaming a code remaps that project's task IDs. Defaults to a standard list.
- **Import existing Excel/CSV lists** — `.xlsx` / `.csv` reader with a **column‑mapping**
  dialog (auto‑maps German *and* English headers), value normalisation
  (status / priority / %, dates), into a new or existing project.
- **Export** — native multi‑sheet **`.xlsx`** (one sheet per project + a portfolio summary),
  per‑project `.xlsx` / CSV, and **branded PDF** for every page (print → save as PDF).
- **Backup & restore** — export/import the whole portfolio as a **JSON** file. This is the
  way to move data between devices (laptop ↔ iPad).
- **Responsive** for 15"/17" laptops and iPad (landscape & portrait), with touch scrolling.

### Cloud sync — one login, all devices (automatic)

Open the app and **sign in** (email + password) to sync your portfolio **automatically and
in real time** across all your devices — laptop and iPad — under a single account.

- Uses the project's existing **Supabase** backend (same project as the PWA below); the whole
  portfolio is stored as one row in the `kv` table, protected by Row‑Level Security per user.
- Changes are pushed automatically (debounced) and pulled live via Supabase Realtime; the nav
  shows a **sync status** (⟳ Syncing… / ✓ Synced / ⚠ Offline).
- **Offline / local-only:** if there is no internet (or you click *Continue offline*), the app
  works fully on that device using a `localStorage` cache and syncs again once signed in online.
- **Setup (once):** the Supabase `kv` table and policies from `supabase-setup.sql` must exist
  (already set up for this project), and in Supabase **Authentication → Providers → Email** turn
  off *Confirm email* so accounts work immediately. The URL/anon key are embedded in `mockup.html`.

To use it on several devices, open the **same hosted URL** on each (the deploy copies
`mockup.html` to GitHub Pages → `https://<username>.github.io/<repo>/mockup.html`) and sign in
with the same account.

### Data & persistence (without login)

Without signing in, data is stored **locally in the browser** (`localStorage`) and does **not**
sync between devices — use **Backup (JSON)** / **Restore** to transfer a portfolio. The seed data
(three demo training programmes) is sample content; use **↺ Demo** to reset, or delete/replace it.

### Quick start

1. Open `mockup.html` (double‑click, or serve the repo and browse to it).
2. On the **Portfolio** page, open a project or create a new one.
3. Edit tasks in the **Tasks** view; watch the Dashboard / Gantt update live.
4. Generate a **Report**, **Export** to Excel/PDF, or **Import** an existing Excel list.

---

## 2) TO DO App (React + Vite + Supabase PWA)

A task app with **real‑time sync** via Supabase — the same data on iPhone, iPad and
laptops, live and simultaneously. Runs as an installable web app (PWA).

| | |
|---|---|
| **Live app** | https://othpa89-del.github.io/TO-DO-App/ |
| **GitHub repo** | https://github.com/othpa89-del/To-Do-App (branch `main`) |
| **Deployment** | GitHub Actions → GitHub Pages (automatic on every push to `main`) |
| **Supabase URL** | `https://jgrupdbfsxinahflzogr.supabase.co` |
| **Supabase project ID** | `jgrupdbfsxinahflzogr` |
| **Keys** | `SUPABASE_URL` & `SUPABASE_ANON_KEY` in `src/config.js` (the anon key may be public) |

### Tech stack
- **Frontend:** React 18 + Vite 5
- **PWA:** `vite-plugin-pwa` (installable, offline shell, auto‑update)
- **Backend/data:** Supabase (Postgres table `kv`) with Row‑Level Security per `user_id`
- **Real‑time:** Supabase Realtime
- **Icons / export:** `lucide-react`, `xlsx`

### Local development
```bash
npm install      # install dependencies
npm run dev      # dev server (http://localhost:5173)
npm run build    # production build to dist/
npm run preview  # test the build locally
```

### Project structure
```
mockup.html                    Standalone PM Cockpit (app #1)
src/            App.jsx · main.jsx · Login.jsx · config.js   (app #2)
public/         Icons (favicon, icon-192/512, apple-touch-icon)
.github/workflows/deploy.yml   GitHub Pages deploy
index.html · vite.config.js · package.json
supabase-setup.sql             Database setup (run once in the SQL editor)
```

### Setup – Part 1: Supabase (once, ~10 min, free)
1. Sign up at **supabase.com** → **New project** (free tier, region e.g. *Central EU (Frankfurt)*).
2. **Prepare the database:** **SQL Editor** → paste the contents of `supabase-setup.sql` → **RUN**.
3. **Simplify sign‑in (optional):** **Authentication → Providers → Email** → turn off
   *Confirm email* so sign‑in works without a confirmation mail.
4. **Get the keys:** **Project Settings → API** → **Project URL** (`SUPABASE_URL`) and
   **anon public** (`SUPABASE_ANON_KEY`).

### Setup – Part 2: enter the keys
Open **`src/config.js`** and replace the two placeholders:
```js
export const SUPABASE_URL = "https://yourproject.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```
(The anon key may be visible in the browser — data is protected by sign‑in + database
access rules.)

### Setup – Part 3: publish on GitHub
1. Push all project files to the repo (contents in the root, branch **main**).
2. Make the repo **public** (free GitHub Pages) → **Settings → Pages → Source: "GitHub Actions"**.
3. The workflow builds automatically (**Actions** tab); then live at
   `https://<username>.github.io/<repo-name>/`.

### Usage
1. Open the page → **Create account** (email + password), then **sign in**.
2. Use the **same account on every device** → the same data everywhere, live.
3. Install: **iPhone/iPad (Safari):** Share → *Add to Home Screen*;
   **Laptop (Chrome/Edge):** install icon in the address bar.

### Sync
Data syncs per **account** across all your devices (live via Supabase Realtime). Use the
same account on every device to see the same tasks everywhere.

### Notes
- **Online operation:** reading/writing needs internet.
- Deployment: GitHub Actions → GitHub Pages (`base` is set automatically).
