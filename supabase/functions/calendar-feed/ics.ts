// ICS-Parsing für die Kalender-Integration.
//
// Reine Funktionen ohne Netzwerk- oder Umgebungszugriff, damit sie sowohl in
// der Edge Function (Deno) als auch in den Unit-Tests (Vitest/Node) laufen.
// Behandelt: Serien (RRULE) inkl. EXDATE und geänderter Einzeltermine
// (RECURRENCE-ID), Zeitzonen aus VTIMEZONE sowie Windows-Zeitzonennamen von
// Outlook, ganztägige und mehrtägige Termine, abgesagte Termine und TRANSP.

import * as ICALns from "ical.js";
import { DISPLAY_TZ, dayInZone, isoInZone, resolveTzid, wallToUtcMs } from "./tz.ts";

// ical.js liefert je nach Bündelung ein Default- oder ein Namespace-Objekt.
// deno-lint-ignore no-explicit-any
const ICAL: any = (ICALns as any).default ?? ICALns;

export type CalSource = "ew" | "aaa" | "privat";

export interface CalEvent {
  /** Stabil über Abrufe hinweg: Quelle + Hash aus UID und Startzeit. */
  id: string;
  source: CalSource;
  title: string;
  location: string;
  /** ISO 8601 mit Offset, normalisiert auf die Anzeigezone. */
  start: string;
  /** Bei ganztägigen Terminen exklusiv (ICS-Semantik). */
  end: string;
  allDay: boolean;
  /** false bei TRANSP:TRANSPARENT ("frei"). */
  busy: boolean;
}

/** Obergrenzen, damit eine kaputte oder bösartige Datei nicht den Abruf blockiert. */
const MAX_ITERATIONS = 20000;  // Schritte je Serie
const MAX_PER_EVENT = 750;     // ausgegebene Termine je Serie
const MAX_TOTAL = 5000;        // ausgegebene Termine je Quelle
const MAX_TEXT = 300;          // Zeichen für Titel und Ort

/** Steuerzeichen entfernen und kürzen; Titel und Ort kommen aus fremden Quellen. */
function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  // deno-lint-ignore no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…" : s;
}

/**
 * 64-Bit-FNV-1a in zwei 32-Bit-Hälften, als 16 Hex-Zeichen.
 * Nur zur Bildung stabiler IDs, nicht für Sicherheitszwecke.
 */
function hashId(input: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * ICAL.Time -> UTC-Millisekunden.
 * Ganztägige Werte gelten als Mitternacht in der Anzeigezone. Hat der Wert
 * eine registrierte Zone (VTIMEZONE oder UTC), rechnet ical.js selbst; sonst
 * greift die aus dem TZID aufgelöste Rückfallzone.
 */
// deno-lint-ignore no-explicit-any
function timeToUtcMs(t: any, fallbackTz: string): number {
  if (t.isDate) return wallToUtcMs(DISPLAY_TZ, t.year, t.month, t.day);
  const tzid = t.zone?.tzid;
  const floating = !tzid || tzid === "floating" || t.zone === ICAL.Timezone.localTimezone;
  if (!floating) return t.toJSDate().getTime();
  return wallToUtcMs(fallbackTz, t.year, t.month, t.day, t.hour, t.minute, t.second);
}

/** TZID-Parameter einer Eigenschaft (DTSTART/DTEND) lesen. */
// deno-lint-ignore no-explicit-any
function tzidParam(vevent: any, name: string): string | null {
  try {
    const p = vevent.getFirstProperty(name);
    const v = p?.getParameter("tzid");
    return typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
function propValue(component: any, name: string): string {
  try {
    const v = component.getFirstPropertyValue(name);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

/**
 * Registriert alle VTIMEZONE-Blöcke der Datei, damit ical.js Zeiten mit
 * Outlook-TZIDs korrekt umrechnet. Die Registrierung ist global; bereits
 * bekannte Namen werden nicht überschrieben, damit Quellen sich nicht
 * gegenseitig beeinflussen.
 */
// deno-lint-ignore no-explicit-any
function registerTimezones(comp: any): void {
  let subs: unknown[] = [];
  try {
    subs = comp.getAllSubcomponents("vtimezone") || [];
  } catch {
    return;
  }
  for (const vt of subs) {
    try {
      const tz = new ICAL.Timezone(vt);
      if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz);
    } catch {
      // Unbrauchbarer VTIMEZONE-Block: der TZID-Rückfall greift später.
    }
  }
}

/**
 * Liest eine ICS-Datei und gibt die Termine im Zeitfenster zurück.
 *
 * @param text    Inhalt der ICS-Datei
 * @param source  ew | aaa | privat
 * @param fromMs  Beginn des Fensters (UTC-Millisekunden, einschließlich)
 * @param toMs    Ende des Fensters (UTC-Millisekunden, ausschließlich)
 * @throws wenn der Text keine lesbare ICS-Datei ist
 */
export function parseIcs(
  text: string, source: CalSource, fromMs: number, toMs: number,
): CalEvent[] {
  if (typeof text !== "string" || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error("Keine ICS-Daten erhalten");
  }
  const comp = new ICAL.Component(ICAL.parse(text));
  registerTimezones(comp);

  const vevents: unknown[] = comp.getAllSubcomponents("vevent") || [];
  // deno-lint-ignore no-explicit-any
  const masters: any[] = [];
  // deno-lint-ignore no-explicit-any
  const overrides: any[] = [];
  for (const ve of vevents) {
    // deno-lint-ignore no-explicit-any
    (propValue(ve as any, "recurrence-id") || (ve as any).getFirstProperty?.("recurrence-id")
      ? overrides : masters).push(ve);
  }

  const out: CalEvent[] = [];
  const seen = new Set<string>();
  const attached = new Set<unknown>();

  // deno-lint-ignore no-explicit-any
  const push = (item: any, startMs: number, endMs: number, uid: string, allDay: boolean) => {
    if (out.length >= MAX_TOTAL) return;
    if (propValue(item.component, "status").toUpperCase() === "CANCELLED") return;
    const start = isoInZone(DISPLAY_TZ, startMs);
    const id = `${source}-${hashId(uid + "|" + start)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id, source,
      title: clean(item.summary),
      location: clean(item.location),
      start,
      end: isoInZone(DISPLAY_TZ, endMs),
      allDay,
      busy: propValue(item.component, "transp").toUpperCase() !== "TRANSPARENT",
    });
  };

  // deno-lint-ignore no-explicit-any
  const bounds = (ev: any, startDate: any, endDate: any, fbStart: string, fbEnd: string) => {
    const allDay = !!startDate?.isDate;
    const startMs = timeToUtcMs(startDate, fbStart);
    let endMs = endDate ? timeToUtcMs(endDate, fbEnd) : startMs;
    // Ohne DTEND gilt DURATION bzw. bei Ganztagsterminen ein Tag.
    if (!endDate || endMs < startMs) endMs = startMs + (allDay ? 86400000 : 0);
    if (allDay && endMs === startMs) endMs = startMs + 86400000;
    return { allDay, startMs, endMs };
  };

  for (const ve of masters) {
    let ev;
    try {
      ev = new ICAL.Event(ve, { strictExceptions: false });
    } catch {
      continue;
    }
    const uid = propValue(ve, "uid") || `no-uid-${out.length}`;
    const fbStart = resolveTzid(tzidParam(ve, "dtstart"));
    const fbEnd = resolveTzid(tzidParam(ve, "dtend"), fbStart);

    let recurring = false;
    try {
      recurring = !!ev.isRecurring();
    } catch { /* keine Serie */ }

    if (recurring) {
      for (const ov of overrides) {
        if (propValue(ov, "uid") !== uid) continue;
        attached.add(ov);
        try {
          ev.relateException(new ICAL.Event(ov));
        } catch {
          // Passt nicht zur Serie: wird unten als Einzeltermin ausgegeben.
          attached.delete(ov);
        }
      }
      let iter;
      try {
        iter = ev.iterator();
      } catch {
        continue;
      }
      let steps = 0, emitted = 0, next;
      while ((next = iter.next())) {
        if (++steps > MAX_ITERATIONS || emitted >= MAX_PER_EVENT) break;
        let det;
        try {
          det = ev.getOccurrenceDetails(next);
        } catch {
          continue;
        }
        const b = bounds(ev, det.startDate, det.endDate, fbStart, fbEnd);
        if (b.startMs >= toMs) break;            // Iterator läuft chronologisch
        if (b.endMs <= fromMs) continue;
        push(det.item, b.startMs, b.endMs, uid, b.allDay);
        emitted++;
      }
    } else {
      const b = bounds(ev, ev.startDate, ev.endDate, fbStart, fbEnd);
      if (b.startMs < toMs && b.endMs > fromMs) push(ev, b.startMs, b.endMs, uid, b.allDay);
    }
  }

  // Geänderte Einzeltermine ohne zugehörige Serie in der Datei: eigenständig ausgeben.
  for (const ov of overrides) {
    if (attached.has(ov)) continue;
    let ev;
    try {
      ev = new ICAL.Event(ov, { strictExceptions: false });
    } catch {
      continue;
    }
    const uid = propValue(ov, "uid") || `no-uid-${out.length}`;
    const fbStart = resolveTzid(tzidParam(ov, "dtstart"));
    const fbEnd = resolveTzid(tzidParam(ov, "dtend"), fbStart);
    const b = bounds(ev, ev.startDate, ev.endDate, fbStart, fbEnd);
    if (b.startMs < toMs && b.endMs > fromMs) push(ev, b.startMs, b.endMs, uid, b.allDay);
  }

  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
  return out;
}

export { DISPLAY_TZ, dayInZone };
