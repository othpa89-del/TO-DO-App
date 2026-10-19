// Hilfsfunktionen für die synchronisierten Kalendertermine.
//
// Reine Funktionen ohne React und ohne Netzwerkzugriff, damit sie testbar
// bleiben. Die Termine kommen von der Edge Function "calendar-feed" und sind
// schreibgeschützt; bearbeitet wird in der App nur, was ihr selbst gehört.

/** Anzeigezone – identisch zur Edge Function. */
export const DISPLAY_TZ = "Europe/Vienna";

/** Quelle -> Firma, damit die bestehenden Kontextfarben greifen. */
export const SOURCE_COMPANY = {
  ew: "Eurowings",
  aaa: "Aviation Academy Austria",
  privat: "Privat",
};

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");

const dayFmtCache = new Map();
function dayFmt(tz) {
  let f = dayFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    });
    dayFmtCache.set(tz, f);
  }
  return f;
}

/** Zeitpunkt in Millisekunden; akzeptiert ISO-Text oder Zahl. */
export function msOf(v) {
  if (typeof v === "number") return v;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in der Anzeigezone. */
export function dayKey(v, tz = DISPLAY_TZ) {
  const ms = msOf(v);
  if (!Number.isFinite(ms)) return "";
  const parts = dayFmt(tz).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Nächster Kalendertag. Rein kalendarisch, deshalb unabhängig von der Zeitumstellung. */
export function nextDay(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Tag um n Tage verschieben (n darf negativ sein). */
export function shiftDay(key, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Alle Kalendertage, die ein Termin berührt. Die Endzeit ist ausschließlich
 * (ICS-Semantik), ein mehrtägiger Termin vom 19. bis 23. belegt also den
 * 19. bis 22.
 */
export function dayKeysOf(ev, tz = DISPLAY_TZ) {
  const start = msOf(ev?.start);
  if (!Number.isFinite(start)) return [];
  let end = msOf(ev?.end);
  if (!Number.isFinite(end) || end <= start) end = start + 1;
  const first = dayKey(start, tz);
  const last = dayKey(end - 1, tz);
  const keys = [first];
  let cur = first;
  for (let i = 0; cur !== last && i < 400; i++) {
    cur = nextDay(cur);
    if (!cur) break;
    keys.push(cur);
  }
  return keys;
}

/** Termine chronologisch; ganztägige zuerst, damit sie oben stehen. */
export function sortEvents(events) {
  return [...(events || [])].sort((a, b) => {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    const d = msOf(a.start) - msOf(b.start);
    if (d) return d;
    return (a.id || "") < (b.id || "") ? -1 : 1;
  });
}

/** Termine nach Kalendertag; mehrtägige erscheinen an jedem berührten Tag. */
export function groupByDay(events, tz = DISPLAY_TZ) {
  const map = new Map();
  for (const ev of events || []) {
    for (const key of dayKeysOf(ev, tz)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
  }
  for (const [key, list] of map) map.set(key, sortEvents(list));
  return map;
}

/** Termine eines einzelnen Tages. */
export function eventsOnDay(events, day, tz = DISPLAY_TZ) {
  return sortEvents((events || []).filter((ev) => dayKeysOf(ev, tz).includes(day)));
}

/**
 * Konflikte nach Abschnitt 4.5: Überschneiden sich zwei belegte Termine aus
 * unterschiedlichen Quellen, gilt das als Konflikt. Ganztägige Termine und
 * als frei markierte Termine (busy: false) bleiben außen vor. Aneinander
 * grenzende Termine (Ende = Beginn) sind kein Konflikt.
 */
export function findConflicts(events) {
  const items = (events || [])
    .filter((e) => e && e.busy !== false && !e.allDay)
    .map((e) => ({ ev: e, s: msOf(e.start), t: msOf(e.end) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.t) && x.t > x.s)
    .sort((a, b) => a.s - b.s);

  const ids = new Set();
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      // Nach Beginn sortiert: ab hier beginnt nichts mehr vor dem Ende von i.
      if (items[j].s >= items[i].t) break;
      if (items[i].ev.source === items[j].ev.source) continue;
      ids.add(items[i].ev.id);
      ids.add(items[j].ev.id);
      pairs.push({
        a: items[i].ev,
        b: items[j].ev,
        from: Math.max(items[i].s, items[j].s),
        to: Math.min(items[i].t, items[j].t),
      });
    }
  }
  pairs.sort((x, y) => x.from - y.from);
  return { ids, pairs };
}

/** Konflikte, deren Überschneidung in den nächsten n Tagen beginnt. */
export function conflictsInDays(events, days = 14, now = Date.now()) {
  const until = now + days * DAY_MS;
  return findConflicts(events).pairs.filter((p) => p.to > now && p.from <= until);
}

// ---------------------------------------------------------------------------
//  Wochenansicht
// ---------------------------------------------------------------------------

/** Montag der Woche, in der der Tag liegt. */
export function weekStart(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dow = (d.getUTCDay() + 6) % 7; // Montag = 0
  return shiftDay(day, -dow);
}

/** Die sieben Tage der Woche, Montag bis Sonntag. */
export function weekDays(day) {
  const s = weekStart(day);
  return s ? Array.from({ length: 7 }, (_, i) => shiftDay(s, i)) : [];
}

/** ISO-Kalenderwoche (Woche 1 enthält den 4. Januar). */
export function isoWeek(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || "");
  if (!m) return 0;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Donnerstag dieser Woche
  const thu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((d - thu) / 604800000);
}

const timeFmtCache = new Map();
function timeFmt(tz) {
  let f = timeFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
    });
    timeFmtCache.set(tz, f);
  }
  return f;
}

/**
 * Wanduhrzeit "HH:MM" in Minuten seit Mitternacht. Für eigene Einträge, deren
 * Uhrzeit ohne Zeitzone gespeichert ist und genau so gelten soll – egal, in
 * welcher Zeitzone das Gerät gerade steht.
 */
export function hhmmToMin(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Minuten seit Mitternacht in der Anzeigezone. */
export function minutesOfDay(v, tz = DISPLAY_TZ) {
  const ms = msOf(v);
  if (!Number.isFinite(ms)) return 0;
  const parts = timeFmt(tz).formatToParts(new Date(ms));
  const num = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return (num("hour") % 24) * 60 + num("minute");
}

/**
 * Lage eines Termins innerhalb eines Tages, in Minuten. Mehrtägige Termine
 * werden auf den Tag beschnitten; null, wenn der Termin den Tag nicht berührt.
 */
export function daySpanOf(ev, day, tz = DISPLAY_TZ) {
  // Eigene Einträge bringen Tag und Minuten schon mit.
  if (ev?.day && Number.isFinite(ev.startMin)) {
    if (ev.day !== day) return null;
    const startMin = Math.max(0, Math.min(1439, ev.startMin));
    let endMin = Number.isFinite(ev.endMin) ? Math.min(1440, ev.endMin) : startMin;
    if (endMin <= startMin) endMin = Math.min(1440, startMin + 30);
    return { startMin, endMin };
  }
  const startMs = msOf(ev?.start);
  if (!Number.isFinite(startMs)) return null;
  const endMs = msOf(ev?.end);
  const lastMs = (Number.isFinite(endMs) && endMs > startMs ? endMs : startMs + 1) - 1;
  const firstKey = dayKey(startMs, tz);
  const lastKey = dayKey(lastMs, tz);
  if (day < firstKey || day > lastKey) return null;

  const startMin = day === firstKey ? minutesOfDay(startMs, tz) : 0;
  let endMin = 1440;
  if (day === lastKey) {
    endMin = Number.isFinite(endMs) ? minutesOfDay(endMs, tz) : startMin;
    if (endMin === 0) endMin = 1440; // Ende genau um Mitternacht
  }
  if (endMin <= startMin) endMin = Math.min(1440, startMin + 30); // Mindesthöhe
  return { startMin, endMin };
}

/**
 * Überschneidende Blöcke nebeneinander legen. Vergibt je Block eine Spur und
 * die Gesamtzahl der Spuren des Tages.
 */
export function assignLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnd = [];
  for (const b of sorted) {
    let lane = laneEnd.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(b.endMin);
    } else {
      laneEnd[lane] = b.endMin;
    }
    b.lane = lane;
  }
  const lanes = Math.max(1, laneEnd.length);
  for (const b of sorted) b.lanes = lanes;
  return sorted;
}

/** Stundenbereich, der alle Blöcke zeigt; mindestens 8 bis 18 Uhr. */
export function hourRange(blocks, minFrom = 8, minTo = 18) {
  let lo = minFrom, hi = minTo;
  for (const b of blocks || []) {
    lo = Math.min(lo, Math.floor(b.startMin / 60));
    hi = Math.max(hi, Math.ceil(b.endMin / 60));
  }
  lo = Math.max(0, lo);
  hi = Math.min(24, Math.max(hi, lo + 4));
  return { from: lo, to: hi };
}
