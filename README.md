# TO DO APP

Aufgaben-App mit **Echtzeit-Synchronisation** über Supabase.
Dieselben Daten auf iPhone, iPad und Laptops – live und gleichzeitig.
Läuft als installierbare Web-App (PWA).

## 🚀 Live & Projekt-Infos

| | |
|---|---|
| **Live-App** | https://othpa89-del.github.io/TO-DO-App/ |
| **GitHub-Repo** | https://github.com/othpa89-del/To-Do-App (Branch `main`) |
| **Deployment** | GitHub Actions → GitHub Pages (automatisch bei jedem Push auf `main`) |
| **Supabase-URL** | `https://jgrupdbfsxinahflzogr.supabase.co` |
| **Supabase Projekt-ID** | `jgrupdbfsxinahflzogr` |
| **Schlüssel** | `SUPABASE_URL` & `SUPABASE_ANON_KEY` in `src/config.js` (anon-Key darf öffentlich sein) |

### Tech-Stack
- **Frontend:** React 18 + Vite 5
- **PWA:** `vite-plugin-pwa` (installierbar, Offline-Shell, Auto-Update)
- **Backend/Daten:** Supabase (Postgres-Tabelle `kv`) mit Row-Level-Security je `user_id`
- **Echtzeit:** Supabase Realtime
- **Icons / Export:** `lucide-react`, `xlsx`

### Lokale Entwicklung
```bash
npm install      # Abhängigkeiten installieren
npm run dev      # Dev-Server (http://localhost:5173)
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal testen
```

### Projektstruktur
```
src/            App.jsx · main.jsx · Login.jsx · config.js
public/         Icons (favicon, icon-192/512, apple-touch-icon)
.github/workflows/deploy.yml   GitHub-Pages-Deploy
index.html · vite.config.js · package.json
supabase-setup.sql             Datenbank-Setup (einmalig im SQL-Editor)
```

## Einrichtung – Teil 1: Supabase (einmalig, ~10 Min, kostenlos)

1. Auf **supabase.com** kostenlos registrieren → **New project** anlegen
   (Projektname frei, Region z. B. „Central EU (Frankfurt)", DB-Passwort vergeben).
2. **Datenbank vorbereiten:** linkes Menü → **SQL Editor** → Inhalt der Datei
   `supabase-setup.sql` einfügen → **RUN**.
3. **Anmeldung vereinfachen (optional, empfohlen):** **Authentication → Providers →
   Email** → „**Confirm email**" ausschalten. Dann funktioniert die Anmeldung
   sofort ohne Bestätigungs-E-Mail.
4. **Schlüssel holen:** **Project Settings → API**:
   - **Project URL**  → später als `SUPABASE_URL`
   - **anon public**  → später als `SUPABASE_ANON_KEY`

## Einrichtung – Teil 2: Schlüssel eintragen

Datei **`src/config.js`** öffnen und die zwei Platzhalter ersetzen:

```js
export const SUPABASE_URL = "https://deinprojekt.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

(Der anon-Key darf im Browser sichtbar sein – die Daten sind durch Anmeldung +
Zugriffsregeln in der Datenbank geschützt.)

## Einrichtung – Teil 3: Auf GitHub veröffentlichen

1. Alle Dateien dieses Projekts ins Repo laden (Inhalte direkt ins Hauptverzeichnis,
   Branch **main**).
2. Repo **öffentlich** stellen (kostenlose GitHub Pages) → **Settings → Pages →
   Source: „GitHub Actions"**.
3. Der Workflow baut automatisch (Reiter **Actions**). Danach live unter
   `https://<benutzername>.github.io/<repo-name>/`.

> ✅ Für dieses Repo bereits eingerichtet – live unter
> https://othpa89-del.github.io/TO-DO-App/

## Nutzung

1. Seite öffnen → **Konto erstellen** (E-Mail + Passwort), dann **anmelden**.
2. Auf **jedem Gerät dasselbe Konto** verwenden → überall dieselben Daten, live.
3. Installieren:
   - **iPhone/iPad (Safari):** Teilen → „Zum Home-Bildschirm".
   - **Laptop (Chrome/Edge):** Installations-Symbol in der Adressleiste.
4. **Abmelden:** Button unten rechts.

## Synchronisation

Die Daten synchronisieren pro **Konto** über alle deine Geräte (live via Supabase
Realtime). Auf jedem Gerät dasselbe Konto verwenden → überall dieselben Aufgaben.

## Hinweise

- **Online-Betrieb:** Lesen/Schreiben benötigt Internet. Eine Sicherung über
  „Druck & Export → JSON-Backup" ist trotzdem empfehlenswert.
- Bei Fehlern im **Actions**-Lauf: Log-Meldung schicken, dann wird's korrigiert.

## Technisches

- React + Vite, PWA via `vite-plugin-pwa`.
- Daten: Supabase (Postgres) Tabelle `kv`, Zugriff per Row Level Security je `user_id`.
- Live-Updates via Supabase Realtime → `src/main.jsx` verteilt Änderungen an die App.
- Deployment: GitHub Actions → GitHub Pages (`base` wird automatisch gesetzt).
