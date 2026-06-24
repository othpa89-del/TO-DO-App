// ===========================================================================
//  data.js – Konstanten, Standarddaten, Datums- und Wiederholungs-Logik
//  Reine Hilfsfunktionen (kein JSX). Persistenz läuft über window.storage.
// ===========================================================================

// --- IDs ---------------------------------------------------------------
let idSeq = 0;
export function uid(prefix = "id") {
  idSeq += 1;
  const rnd = Math.floor(performance.now() * 1000) % 100000;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}_${rnd.toString(36)}`;
}

// --- Standard-Benutzer -------------------------------------------------
export const DEFAULT_USERS = [
  { id: "u_patrick", name: "Patrick", role: "admin", color: "#2E9E5B", avatar: "" },
  { id: "u_katharina", name: "Nadja", role: "user", color: "#EC6FA4", avatar: "" },
];

// --- Standard-Bereiche / Firmen ---------------------------------------
export const DEFAULT_AREAS = [
  { id: "a_firma_a", name: "Firma A", color: "#1E88E5", active: true },
  { id: "a_firma_b", name: "Firma B", color: "#43A047", active: true },
  { id: "a_firma_c", name: "Firma C", color: "#FB8C00", active: true },
  { id: "a_privat", name: "Privat", color: "#78909C", active: true },
];

// --- Prioritäten -------------------------------------------------------
export const PRIORITIES = [
  { id: "kritisch", name: "Kritisch", color: "#E53935", dot: "🔴" },
  { id: "hoch", name: "Hoch", color: "#FB8C00", dot: "🟠" },
  { id: "normal", name: "Normal", color: "#FDD835", dot: "🟡" },
  { id: "niedrig", name: "Niedrig", color: "#43A047", dot: "🟢" },
];
export function priorityById(id) {
  return PRIORITIES.find((p) => p.id === id) || PRIORITIES[2];
}

// --- Terminarten (Standard + Aviation) ---------------------------------
export const DEFAULT_EVENT_TYPES = [
  // Standard
  { id: "t_flight", name: "Flight", icon: "✈️", active: true, aviation: true },
  { id: "t_simulator", name: "Simulator", icon: "🛫", active: true, aviation: true },
  { id: "t_arzt", name: "Arzt", icon: "🏥", active: true, aviation: false },
  { id: "t_urlaub", name: "Urlaub", icon: "🌴", active: true, aviation: false },
  { id: "t_auto", name: "Auto", icon: "🚗", active: true, aviation: false },
  { id: "t_kinder", name: "Kinder", icon: "👦", active: true, aviation: false },
  { id: "t_schule", name: "Schule", icon: "🎓", active: true, aviation: false },
  { id: "t_arbeit", name: "Arbeit", icon: "💼", active: true, aviation: false },
  { id: "t_meeting", name: "Meeting", icon: "👥", active: true, aviation: true },
  { id: "t_familie", name: "Familie", icon: "👨‍👩‍👧", active: true, aviation: false },
  { id: "t_geburtstag", name: "Geburtstag", icon: "🎂", active: true, aviation: false },
  { id: "t_sport", name: "Sport", icon: "⚽", active: true, aviation: false },
  { id: "t_restaurant", name: "Restaurant", icon: "🍽️", active: true, aviation: false },
  { id: "t_einkaufen", name: "Einkaufen", icon: "🛒", active: true, aviation: false },
  { id: "t_hotel", name: "Hotel", icon: "🏨", active: true, aviation: false },
  { id: "t_reise", name: "Reise", icon: "🌍", active: true, aviation: false },
  { id: "t_behoerde", name: "Behörde", icon: "🏛️", active: true, aviation: false },
  // Aviation-Spezial
  { id: "t_examiner", name: "Examiner", icon: "📝", active: true, aviation: true },
  { id: "t_instructor", name: "Instructor", icon: "👨‍🏫", active: true, aviation: true },
  { id: "t_line_training", name: "Line Training", icon: "🎯", active: true, aviation: true },
  { id: "t_check_flight", name: "Check Flight", icon: "✔️", active: true, aviation: true },
  { id: "t_recurrent", name: "Recurrent Training", icon: "🔄", active: true, aviation: true },
  { id: "t_medical", name: "Medical", icon: "🩺", active: true, aviation: true },
  { id: "t_layover", name: "Layover", icon: "🛏️", active: true, aviation: true },
  { id: "t_sonstiges", name: "Sonstiges", icon: "📌", active: true, aviation: false },
];

// Auswahl an Emojis für eigene Terminarten
export const ICON_CHOICES = [
  "✈️","🛫","📝","👨‍🏫","🎯","✔️","🔄","🩺","🛏️","🏥","🌴","🚗","👦","🎓","💼",
  "👥","👨‍👩‍👧","🎂","⚽","🍽️","🛒","🏨","🌍","🏛️","📌","📞","💻","🎵","🎬","📚",
  "🏃","🚴","🏖️","🎉","💊","🦷","🐶","🌟","⏰","📅","🔧","🧾","💰","🎤","🛬",
];

// --- Wiederholungs-Frequenzen -----------------------------------------
export const RECUR_FREQS = [
  { id: "none", name: "Keine Wiederholung" },
  { id: "daily", name: "Täglich" },
  { id: "weekly", name: "Wöchentlich" },
  { id: "monthly", name: "Monatlich" },
  { id: "yearly", name: "Jährlich" },
  { id: "custom", name: "Benutzerdefiniert" },
];

// --- Erinnerungs-Optionen ---------------------------------------------
export const REMINDER_OPTIONS = [
  { id: "none", name: "Keine", minutes: null },
  { id: "m15", name: "15 Minuten vorher", minutes: 15 },
  { id: "h1", name: "1 Stunde vorher", minutes: 60 },
  { id: "d1", name: "1 Tag vorher", minutes: 1440 },
];

// --- Schnellanlage-Vorlagen -------------------------------------------
// Verweisen auf Terminart-IDs, Bereich-IDs und Standardpriorität.
export const QUICK_TEMPLATES = [
  { id: "q_flight", label: "Flight", typeId: "t_flight", areaId: "a_firma_a", priority: "hoch" },
  { id: "q_sim", label: "Simulator", typeId: "t_simulator", areaId: "a_firma_a", priority: "hoch" },
  { id: "q_meeting", label: "Meeting", typeId: "t_meeting", areaId: "a_firma_a", priority: "normal" },
  { id: "q_arzt", label: "Arzt", typeId: "t_arzt", areaId: "a_privat", priority: "normal" },
  { id: "q_urlaub", label: "Urlaub", typeId: "t_urlaub", areaId: "a_privat", priority: "niedrig" },
  { id: "q_auto", label: "Auto", typeId: "t_auto", areaId: "a_privat", priority: "niedrig" },
];

// =====================================================================
//  Datums-Hilfsfunktionen  (lokale Zeit, Strings "YYYY-MM-DD" / "HH:MM")
// =====================================================================
export function pad2(n) { return String(n).padStart(2, "0"); }

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseISODate(s) {
  const [y, m, d] = (s || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function todayISO() { return toISODate(new Date()); }

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
export function startOfWeek(d) {
  // Woche beginnt Montag
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // Mo=0 … So=6
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isToday(s) { return s === todayISO(); }

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function fmtDateLong(s) {
  const d = parseISODate(s);
  return `${WEEKDAYS_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateShort(s) {
  const d = parseISODate(s);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Minuten seit Mitternacht aus "HH:MM"
export function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function minToTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// 6x7-Raster für die Monatsansicht (immer ganze Wochen, Montag-Start)
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  return days;
}

// =====================================================================
//  Wiederholungen – erzeugt konkrete Vorkommen in einem Zeitraum
// =====================================================================
// recurrence = { freq:'none'|'daily'|'weekly'|'monthly'|'yearly'|'custom',
//                interval:Number, until:'YYYY-MM-DD'|'', count:Number|null,
//                weekdays:[0..6] (nur custom/weekly optional) }
//
// Liefert Array von ISO-Datums-Strings (Startdatum jedes Vorkommens),
// die in [rangeStart, rangeEnd] (inkl.) liegen.
export function expandOccurrences(ev, rangeStartISO, rangeEndISO) {
  const baseISO = ev.date;
  if (!baseISO) return [];
  const rec = ev.recurrence;
  const rs = parseISODate(rangeStartISO);
  const re = parseISODate(rangeEndISO);

  if (!rec || rec.freq === "none" || !rec.freq) {
    const d = parseISODate(baseISO);
    return d >= rs && d <= re ? [baseISO] : [];
  }

  const interval = Math.max(1, Number(rec.interval) || 1);
  const untilD = rec.until ? parseISODate(rec.until) : null;
  const maxCount = rec.count ? Number(rec.count) : null;
  const base = parseISODate(baseISO);

  const out = [];
  let produced = 0;
  // Obergrenze, damit nichts ausufert
  const HARD_LIMIT = 1000;

  function within(d) {
    if (d < rs || d > re) return false;
    if (untilD && d > untilD) return false;
    return true;
  }
  function past(d) {
    return d > re || (untilD && d > untilD) || (maxCount && produced >= maxCount);
  }

  if (rec.freq === "weekly" || (rec.freq === "custom" && rec.unit === "week")) {
    const wds = (rec.weekdays && rec.weekdays.length) ? rec.weekdays.slice().sort() : [(base.getDay() + 6) % 7];
    // Anker: Wochenstart der Basiswoche
    let weekStart = startOfWeek(base);
    let safety = 0;
    while (safety++ < HARD_LIMIT) {
      for (const wd of wds) {
        const d = addDays(weekStart, wd);
        if (d < base) continue;
        produced += 1;
        if (maxCount && produced > maxCount) return out;
        if (within(d)) out.push(toISODate(d));
      }
      weekStart = addDays(weekStart, 7 * interval);
      if (weekStart > re || (untilD && weekStart > untilD)) break;
    }
    return out;
  }

  // daily / monthly / yearly / custom(day/month/year)
  // Frequenz-Strings auf Einheiten normalisieren
  const FREQ_UNIT = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
  let unit = rec.freq === "custom" ? (rec.unit || "day") : (FREQ_UNIT[rec.freq] || "day");

  let d = new Date(base);
  let safety = 0;
  while (safety++ < HARD_LIMIT) {
    produced += 1;
    if (maxCount && produced > maxCount) break;
    if (within(d)) out.push(toISODate(d));
    if (unit === "day") d = addDays(d, interval);
    else if (unit === "week") d = addDays(d, 7 * interval);
    else if (unit === "month") d = addMonths(d, interval);
    else if (unit === "year") d = addMonths(d, 12 * interval);
    else d = addDays(d, interval);
    if (past(d)) break;
  }
  return out;
}

// Alle Termin-Vorkommen in einem Zeitraum (flach, sortiert nach Datum+Start)
export function occurrencesInRange(events, rangeStartISO, rangeEndISO) {
  const out = [];
  for (const ev of events) {
    const dates = expandOccurrences(ev, rangeStartISO, rangeEndISO);
    for (const date of dates) {
      out.push({ ...ev, date, _occ: true, _baseDate: ev.date });
    }
  }
  out.sort((a, b) => (a.date === b.date ? timeToMin(a.start) - timeToMin(b.start) : a.date < b.date ? -1 : 1));
  return out;
}

// =====================================================================
//  Konflikterkennung – Überschneidungen am selben Tag
// =====================================================================
export function findConflicts(candidate, events) {
  const cs = timeToMin(candidate.start);
  const ce = timeToMin(candidate.end);
  if (ce <= cs) return [];
  const conflicts = [];
  // betrachte 1 Jahr um den Termin (deckt Wiederholungen ab)
  const rs = candidate.date;
  const re = toISODate(addDays(parseISODate(candidate.date), 1));
  for (const ev of events) {
    if (ev.id === candidate.id) continue;
    const dates = expandOccurrences(ev, rs, re);
    if (!dates.includes(candidate.date)) continue;
    const es = timeToMin(ev.start), ee = timeToMin(ev.end);
    if (cs < ee && es < ce) conflicts.push(ev);
  }
  return conflicts;
}

// Liefert ein Set der IDs, die sich mit mind. einem anderen Termin in der
// Liste zeitlich überschneiden (gleiche Liste = gleicher Tag erwartet).
export function dayConflictSet(items) {
  const set = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i], as = timeToMin(a.start), ae = Math.max(timeToMin(a.end), as + 1);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j], bs = timeToMin(b.start), be = Math.max(timeToMin(b.end), bs + 1);
      if (as < be && bs < ae) { set.add(a.id); set.add(b.id); }
    }
  }
  return set;
}

// =====================================================================
//  Karten-Links
// =====================================================================
export function googleMapsLink(addr) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}
export function appleMapsLink(addr) {
  return `https://maps.apple.com/?q=${encodeURIComponent(addr)}`;
}
export function googleCalendarLink(ev) {
  const d = ev.date.replace(/-/g, "");
  const s = (ev.start || "00:00").replace(":", "") + "00";
  const e = (ev.end || ev.start || "00:00").replace(":", "") + "00";
  const dates = `${d}T${s}/${d}T${e}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "Termin",
    dates,
    details: ev.description || "",
    location: ev.address || ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// =====================================================================
//  ICS-Export (Outlook / Google / Apple kompatibel)
// =====================================================================
function icsDate(dateISO, time) {
  const d = dateISO.replace(/-/g, "");
  const t = (time || "00:00").replace(":", "") + "00";
  return `${d}T${t}`;
}
function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function rrule(rec) {
  if (!rec || rec.freq === "none" || !rec.freq) return null;
  const map = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
  let freq = map[rec.freq];
  if (rec.freq === "custom") freq = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" }[rec.unit || "day"];
  if (!freq) return null;
  let r = `FREQ=${freq};INTERVAL=${Math.max(1, Number(rec.interval) || 1)}`;
  if (rec.count) r += `;COUNT=${Number(rec.count)}`;
  else if (rec.until) r += `;UNTIL=${rec.until.replace(/-/g, "")}T235959`;
  return r;
}
export function buildICS(events, typeName, areaName, userName) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kalender App//DE",
    "CALSCALE:GREGORIAN",
  ];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@kalender-app`);
    lines.push(`DTSTART:${icsDate(ev.date, ev.start)}`);
    lines.push(`DTEND:${icsDate(ev.date, ev.end || ev.start)}`);
    const r = rrule(ev.recurrence);
    if (r) lines.push(`RRULE:${r}`);
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    const descParts = [];
    if (ev.description) descParts.push(ev.description);
    if (typeName) descParts.push(`Art: ${typeName(ev.typeId)}`);
    if (areaName) descParts.push(`Bereich: ${areaName(ev.areaId)}`);
    if (userName) descParts.push(`Ersteller: ${userName(ev.creatorId)}`);
    if (descParts.length) lines.push(`DESCRIPTION:${icsEscape(descParts.join("\n"))}`);
    if (ev.address || ev.location) lines.push(`LOCATION:${icsEscape(ev.address || ev.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================================================================
//  Theme-Token (Dunkelblau, Dark Mode Standard)
// =====================================================================
export function theme(mode) {
  const dark = mode !== "light";
  const NAVY = "#16233F";       // Dunkelblau (Header/Navigation)
  const NAVY_DEEP = "#0E1A33";
  const ACCENT = "#2E5BFF";     // Akzentblau
  if (dark) {
    return {
      mode: "dark",
      navy: NAVY, navyDeep: NAVY_DEEP, accent: ACCENT,
      bg: "#0B1426", surface: "#15233F", surface2: "#1C2D4E",
      header: NAVY, text: "#E8EDF6", muted: "#9DB0CE", faint: "#6B7E9E",
      border: "#2A3C5E", borderSoft: "#223150",
      input: "#0F1C33", chip: "#1C2D4E", shadow: "0 10px 30px rgba(0,0,0,.45)",
      todayBg: "rgba(46,91,255,.16)",
    };
  }
  return {
    mode: "light",
    navy: NAVY, navyDeep: NAVY_DEEP, accent: ACCENT,
    bg: "#EEF2F8", surface: "#FFFFFF", surface2: "#F4F7FC",
    header: NAVY, text: "#152238", muted: "#5A6B86", faint: "#8696B0",
    border: "#D9E1EE", borderSoft: "#E7EDF6",
    input: "#FFFFFF", chip: "#EEF2FA", shadow: "0 10px 30px rgba(20,40,80,.10)",
    todayBg: "rgba(46,91,255,.10)",
  };
}
