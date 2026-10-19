# TO DO APP

Aufgaben-App mit **Echtzeit-Synchronisation** über Supabase.
Dieselben Daten auf iPhone, iPad und Laptops – live und gleichzeitig.
Läuft als installierbare Web-App (PWA).

## 🚀 Live & Projekt-Infos

| | |
|---|---|
| **Live-App** | https://othpa89-del.github.io/TO-DO-App/ |
| **GitHub-Repo** | https://github.com/othpa89-del/TO-DO-App (Branch `main`) |
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

### Funktionen
- **Aufgaben:** anlegen (eigener Tab „Neue Aufgabe"), Liste mit Suche/Filter/Sortierung, Status, Priorität, Fälligkeit, Wiederholung, Ansprechperson, Company, Verlauf
- **Meeting Minutes:** professionelles Besprechungsprotokoll – Übersicht (Liste/Karten, Suche, Filter, Favoriten, Archiv), Agenda mit Mitschrift (Rich-Text), Entscheidungen, Action Items → Aufgaben, Teilnehmer aus Kontakten, Anhänge/Bilder/Sprachmemos, Export (PDF/Druck, Word, Markdown, TXT)
- **Persons:** Kontaktverwaltung (Name, Firma, Rolle, Telefon, E-Mail, Themen)
- **Kalender:** Termine aus Outlook (Eurowings), AAA und Privat zusammengeführt – Wochenansicht,
  Tagesübersicht im Dashboard, Vorschau auf morgen und Warnung bei Überschneidungen zwischen den
  Quellen. Fremdtermine sind schreibgeschützt, eigene Aufgaben und Meetings bleiben bearbeitbar.
  Einrichtung siehe Teil 4.
- **Druck & Export:** PDF/Druck und Excel für Aufgaben und Personen, JSON-Backup/Restore

### Projektstruktur
```
src/            App.jsx · main.jsx · Login.jsx · Meetings.jsx · config.js
                store.js · dates.js · i18n.js · meetingExport.js
                calendar.js · calendarSync.js · useCalendar.js
                CalendarView.jsx · CalendarWeek.jsx · CalendarToday.jsx
src/__tests__/  Unit-Tests (Vitest)
supabase/functions/calendar-feed/   Edge Function für den Kalender-Sync
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

## Einrichtung – Teil 4: Kalender-Sync (optional)

Führt die Termine aus Outlook (Eurowings), AAA und Privat in der App zusammen.
Ohne diesen Teil funktioniert die App unverändert; der Kalender-Tab zeigt dann
nur die Eingabefelder.

**Warum ein Proxy?** Veröffentlichte ICS-Links liefern keine CORS-Header, der
Browser darf sie also nicht direkt laden. Vor allem aber wirken sie wie ein
Schlüssel: Wer den Link kennt, sieht den Kalender. Deshalb liegen die Links
ausschließlich als Supabase-Secrets auf dem Server, und die App spricht nur mit
der Edge Function `calendar-feed`.

### 1. Kalender veröffentlichen

- **Outlook / Microsoft 365:** Einstellungen → Kalender → Freigegebene Kalender →
  Kalender veröffentlichen. Detailstufe **„Eingeschränkte Details"** genügt
  (Titel und Ort) und gibt am wenigsten preis. Die **ICS**-Adresse kopieren,
  nicht die HTML-Adresse.
- **Google Kalender:** Kalendereinstellungen → „Geheime Adresse im iCal-Format".
- Eine Quelle, die du nicht hast, einfach leer lassen – sie wird übersprungen.

### 2. Secrets setzen und Function veröffentlichen

```bash
supabase secrets set ICS_EW="..." ICS_AAA="..." ICS_PRIVAT="..." \
  PLANER_TOKEN="..." ALLOWED_ORIGIN="https://..."
supabase functions deploy calendar-feed --no-verify-jwt
```

| Secret | Bedeutung |
| --- | --- |
| `ICS_EW`, `ICS_AAA`, `ICS_PRIVAT` | die veröffentlichten ICS-Adressen; leere oder fehlende Quelle wird übersprungen |
| `PLANER_TOKEN` | langer Zufallswert, den die App beim Abruf mitsendet (`openssl rand -base64 48`) |
| `ALLOWED_ORIGIN` | Adresse der App, z. B. `https://othpa89-del.github.io` – nur von dort nimmt die Function Anfragen an |

`--no-verify-jwt` ist nötig, weil die Function mit dem eigenen `PLANER_TOKEN`
prüft und nicht mit einem Supabase-JWT. Ohne gültigen Token liefert sie `401`,
ohne gesetzte Secrets `503` – nie Daten.

Die Secrets lassen sich auch ohne CLI im Supabase-Dashboard setzen:
**Edge Functions → calendar-feed → Secrets**.

### 3. In der App eintragen

Tab **Kalender → Einstellungen**: Proxy-Adresse
(`https://<projekt>.supabase.co/functions/v1/calendar-feed`) und Token eingeben,
**Verbindung testen**, dann speichern. Beides liegt im eigenen, per Row Level
Security geschützten Datensatz und ist damit auf Desktop, iPhone und iPad
sofort vorhanden – eine bewusste Abweichung von der Spezifikation, die eine
Speicherung nur je Gerät vorsah.

Einzelne Quellen lassen sich im Kalender-Tab ein- und ausblenden, ohne neu
abzurufen.

### 4. Lokal ausprobieren

```bash
supabase functions serve calendar-feed --no-verify-jwt --env-file supabase/.env.local
```

`.env.example` zeigt die erwarteten Namen. **Eine `.env` mit echten Werten
niemals committen** – `.gitignore` sperrt `.env*`, `.env.example` ist
ausgenommen.

### Wenn es nicht klappt

| Meldung | Ursache |
| --- | --- |
| `401` / „Token ungültig" | Token in der App weicht von `PLANER_TOKEN` ab |
| `503` / „not_configured" | `PLANER_TOKEN` oder `ALLOWED_ORIGIN` fehlt als Secret |
| CORS-Fehler im Browser | `ALLOWED_ORIGIN` passt nicht genau zur Adresse der App (ohne Schrägstrich am Ende) |
| Eine Quelle fehlt, andere kommen | Fehler steht pro Quelle im Kalender-Tab; meist ein abgelaufener ICS-Link |
| Zeiten um eine Stunde verschoben | sollte nicht vorkommen; Outlook-Zeitzonen und die Umstellung sind durch Tests abgedeckt – bitte melden |

### Datenschutz

- ICS-Adressen und Token stehen nirgends im Repo und nicht im ausgelieferten
  Code. Das Repo ist **öffentlich**, das Bundle kann jeder laden – entsprechend
  gehören dort keine Geheimnisse hinein.
- Die Function protokolliert weder Termininhalte noch ICS-Adressen und entfernt
  URLs aus Fehlermeldungen, bevor sie den Server verlassen.
- Termine werden nur gelesen, nie zurückgeschrieben.

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
- Kalender-Sync: Supabase Edge Function `calendar-feed` (Deno, `ical.js`) liest die
  ICS-Quellen serverseitig und liefert JSON. Zeiten werden auf Europe/Vienna normalisiert;
  Serien (`RRULE`, `EXDATE`, `RECURRENCE-ID`), Outlook-Zeitzonennamen, ganztägige und
  mehrtägige Termine sowie abgesagte und als frei markierte Termine sind berücksichtigt.
- Letzter Kalenderstand liegt in IndexedDB (Rückfall: localStorage) und wird offline angezeigt.
- Tests: `npm test` (Vitest). Der Deploy-Workflow bricht ab, wenn ein Test fehlschlägt.
