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
