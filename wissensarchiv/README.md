# Wissensarchiv

Persönliche, **offline-fähige Wissensdatenbank** für einen einzelnen Nutzer – ohne
Backend, ohne Login. Alle Daten (Originaldateien, Suchindex, Metadaten,
Einstellungen) werden über die **File System Access API** als echte Dateien in
einem von dir gewählten Ordner auf der Festplatte gespeichert. Das übersteht auch
das Löschen von Browser-Cache, Verlauf und Websitedaten.

> **Zielbrowser:** Google Chrome oder Microsoft Edge (Desktop).
> Firefox/Safari unterstützen die benötigte API derzeit nicht.

Dieses Projekt liegt bewusst in einem **eigenen Unterordner** (`wissensarchiv/`)
und ist vollständig von der übrigen Repo-App getrennt – es lässt sich später 1:1
in ein eigenes Repository verschieben.

---

## Wichtig: die App muss über `http(s)` laufen

Chrome/Edge erlauben die File System Access API **und** Service Worker nur in einem
*sicheren Kontext* – also über `https://` oder `http://localhost`.
Per Doppelklick als `file://…/index.html` geöffnet funktioniert die App **nicht**.

Es gibt zwei einfache Wege:

### Variante A – Ohne Installation: GitHub Pages (empfohlen)

1. Dieses Repository nach GitHub pushen.
2. Im Repo → **Settings → Pages** → Branch wählen und Ordner `/wissensarchiv`
   (bzw. Repo-Root, falls du die Dateien dorthin verschiebst) als Quelle setzen.
3. Nach ein paar Minuten die angezeigte `https://…`-Adresse in Chrome/Edge öffnen.

Deine Dokumente bleiben dabei **lokal auf deiner Festplatte** – die Seite lädt und
speichert nichts auf einen Server.

### Variante B – Lokal starten (kleiner Webserver)

Benötigt Python 3 (auf den meisten Systemen vorinstalliert).

```bash
# in diesem Ordner:
python start.py
# oder eigener Port:
python start.py 8080
```

- **Windows:** Doppelklick auf `start.bat`
- **macOS:** Doppelklick auf `start.command` (ggf. vorher `chmod +x start.command`)

Der Browser öffnet automatisch `http://localhost:8000/index.html`.
Beenden mit `Strg+C`.

---

## Als App installieren (PWA)

Läuft die Seite über `https`/`localhost`, zeigt Chrome/Edge in der Adressleiste ein
**Installieren**-Symbol. Danach startet das Wissensarchiv wie eine eigenständige
Desktop-App und funktioniert nach dem ersten Start vollständig offline.

---

## Ordnerstruktur der Daten

Beim ersten Start wählst du einen Ordner. Die App legt darin an:

```
Dein-Ordner/
├─ originals/   – Originaldateien (PDF, DOCX, XLSX, CSV, TXT, MD)
├─ index/       – ein JSON-Suchindex pro Dokument
├─ meta/        – Tags, Notizen, Einstellungen, API-Key
└─ exports/     – Berichte & Backups
```

Das Ordner-Handle wird zusätzlich in IndexedDB zwischengespeichert, damit die App
den Ordner beim nächsten Start automatisch wiederfindet. Fehlt die Berechtigung
(z. B. nach dem Löschen von Websitedaten), erscheint ein freundlicher
**„Ordner erneut verbinden"**-Dialog – deine Dateien bleiben unangetastet.

---

## Projektdateien

```
wissensarchiv/
├─ index.html          – die komplette App (HTML + CSS + JS in einer Datei)
├─ service-worker.js   – Offline-Cache der App-Shell und (ab Etappe 2) der Bibliotheken
├─ manifest.json       – PWA-Manifest (Installierbarkeit)
├─ icons/              – App-Icons
├─ vendor/             – lokal mitgelieferte Bibliotheken (ab Etappe 2)
├─ start.py / .bat / .command – lokaler Start
└─ README.md
```

## Umsetzungsstand (Etappen)

Die App wird in vier lauffähigen Etappen gebaut:

- **Etappe 1 – Fundament (fertig):** Ordner wählen/wiederherstellen, Reconnect-Dialog,
  Ordnerstruktur anlegen, Einstellungen (Theme Auto/Hell/Dunkel, Sprache DE/EN),
  PWA-Grundgerüst mit Offline-Cache, Browser-Prüfung.
- **Etappe 2 – Import & Suche:** Import (Drag & Drop / Datei / Ordner), Parser im
  Web Worker (PDF.js, mammoth.js, SheetJS), PDF seitenweise mit Fortschritt,
  Erkennung gescannter PDFs, Duplikat-Dialog, Volltextindex, Suche mit Filtern,
  Snippets, Quellenreferenz und Fundstellen-Ansicht.
- **Etappe 3 – Bibliothek & Backup:** Verwaltung (Umbenennen, Tags, Notizen, Löschen,
  Neu-Indexieren, Batch-Aktionen) sowie ZIP-Export/-Import des gesamten Archivs.
- **Etappe 4 – Zusammenfassung & Export:** extraktive Offline-Zusammenfassung und
  optional Claude API (claude-sonnet-4-6), Export als DOCX/PDF/XLSX, jeweils mit
  vollständigem Quellenverzeichnis.

---

*Kein Konto, kein Server, keine Cloud – deine Daten bleiben bei dir.*
