// Supabase Edge Function "calendar-feed".
//
// Holt die veröffentlichten ICS-Kalender von Eurowings, AAA und Privat ab und
// gibt sie als gemeinsames JSON zurück. Der Umweg über diese Function ist
// nötig, weil veröffentlichte ICS-Links keine CORS-Header liefern und wie
// Schlüssel behandelt werden müssen: Die URLs stehen ausschließlich in
// Supabase-Secrets und verlassen den Server nicht.
//
// Secrets (siehe README):
//   ICS_EW, ICS_AAA, ICS_PRIVAT  – die ICS-URLs (leere Quelle wird übersprungen)
//   PLANER_TOKEN                 – Zugriffstoken der App
//   ALLOWED_ORIGIN               – Origin der App (z. B. GitHub-Pages-URL)
//
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt
// (eigener Token statt Supabase-JWT)
//
// Es werden bewusst keine Termininhalte und keine ICS-URLs protokolliert.

import { type CalEvent, type CalSource, parseIcs } from "./ics.ts";
import { DISPLAY_TZ, dayInZone, dayStartMs } from "./tz.ts";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

/** Zugriff auf die Secrets. Injiziert, damit der Handler testbar bleibt. */
export type Env = (name: string) => string | undefined;

const SOURCES: ReadonlyArray<{ key: CalSource; env: string }> = [
  { key: "ew", env: "ICS_EW" },
  { key: "aaa", env: "ICS_AAA" },
  { key: "privat", env: "ICS_PRIVAT" },
];

const DEFAULT_DAYS_BACK = 7;
const DEFAULT_DAYS_AHEAD = 90;
const MAX_DAYS = 180;
const FETCH_TIMEOUT_MS = 15000;
const MAX_ICS_BYTES = 8 * 1024 * 1024;
const DAY_MS = 86400000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface SourceError {
  source: CalSource;
  message: string;
}

/** Kalendertag um n Tage verschieben. Der Mittagszuschlag umgeht die Zeitumstellung. */
const addDays = (day: string, n: number) =>
  dayInZone(DISPLAY_TZ, dayStartMs(DISPLAY_TZ, day) + n * DAY_MS + 12 * 3600000);

/** Zeichenweiser Vergleich ohne vorzeitigen Abbruch. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Fehlertext für die Antwort aufbereiten. Entfernt URLs, damit eine geheime
 * ICS-Adresse nicht über eine Fehlermeldung nach außen gelangt.
 */
function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const cleaned = raw.replace(/https?:\/\/\S+/gi, "[URL entfernt]").trim();
  return (cleaned || "Unbekannter Fehler").slice(0, 200);
}

function baseHeaders(origin: string | null, allowedOrigin: string, permissive = false): Headers {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "3600",
  });
  if (allowedOrigin && origin && origin === allowedOrigin) {
    h.set("Access-Control-Allow-Origin", allowedOrigin);
  } else if (permissive && origin) {
    // Nur für Konfigurationsfehler, damit die App den Grund anzeigen kann.
    h.set("Access-Control-Allow-Origin", origin);
  }
  return h;
}

const json = (body: unknown, status: number, headers: Headers) =>
  new Response(JSON.stringify(body), { status, headers });

/** Eine ICS-Quelle laden. Die URL wird nie geloggt oder weitergegeben. */
async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.1",
      "User-Agent": "todo-app-calendar-feed",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") || "0");
  if (declared > MAX_ICS_BYTES) throw new Error("ICS-Datei zu groß");
  const text = await res.text();
  if (text.length > MAX_ICS_BYTES) throw new Error("ICS-Datei zu groß");
  return text;
}

/**
 * Der eigentliche Handler. Nimmt die Secrets als Funktion, damit er in den
 * Tests ohne Deno-Umgebung geprüft werden kann.
 */
export function createHandler(env: Env) {
  return async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const token = env("PLANER_TOKEN") || "";
  const allowedOrigin = (env("ALLOWED_ORIGIN") || "").replace(/\/$/, "");

  // Fehlende Konfiguration: kein offener Zugang, aber eine lesbare Meldung.
  if (!token || !allowedOrigin) {
    const h = baseHeaders(origin, allowedOrigin, true);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    return json({
      error: "not_configured",
      message: "PLANER_TOKEN und ALLOWED_ORIGIN müssen als Supabase-Secrets gesetzt sein.",
    }, 503, h);
  }

  const headers = baseHeaders(origin, allowedOrigin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, headers);
  }

  const auth = req.headers.get("authorization") || "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!presented || !sameToken(presented, token)) {
    return json({ error: "unauthorized" }, 401, headers);
  }

  // Zeitfenster bestimmen: Standard heute −7 bis +90 Tage, höchstens 180 Tage.
  const url = new URL(req.url);
  const today = dayInZone(DISPLAY_TZ, Date.now());
  const from = (url.searchParams.get("from") || addDays(today, -DEFAULT_DAYS_BACK)).trim();
  let to = (url.searchParams.get("to") || addDays(today, DEFAULT_DAYS_AHEAD)).trim();
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    return json({ error: "bad_request", message: "from und to erwarten das Format YYYY-MM-DD." }, 400, headers);
  }
  if (to < from) {
    return json({ error: "bad_request", message: "to liegt vor from." }, 400, headers);
  }
  let fromMs: number, toMs: number;
  try {
    fromMs = dayStartMs(DISPLAY_TZ, from);
    if (Math.round((dayStartMs(DISPLAY_TZ, to) - fromMs) / DAY_MS) + 1 > MAX_DAYS) {
      to = addDays(from, MAX_DAYS - 1); // stillschweigend kürzen, range zeigt das Ergebnis
    }
    toMs = dayStartMs(DISPLAY_TZ, addDays(to, 1)); // Ende ausschließlich
  } catch (err) {
    return json({ error: "bad_request", message: safeMessage(err) }, 400, headers);
  }

  const configured = SOURCES
    .map((s) => ({ ...s, url: (env(s.env) || "").trim() }))
    .filter((s) => s.url.length > 0);

  const errors: SourceError[] = [];
  const events: CalEvent[] = [];

  // Quellen parallel, jede für sich fehlertolerant: fällt eine aus,
  // liefern die anderen trotzdem Daten.
  const results = await Promise.all(configured.map(async (s) => {
    try {
      return { key: s.key, events: parseIcs(await fetchIcs(s.url), s.key, fromMs, toMs) };
    } catch (err) {
      return { key: s.key, error: safeMessage(err) };
    }
  }));

  for (const r of results) {
    if ("error" in r && r.error) errors.push({ source: r.key, message: r.error });
    else if (r.events) events.push(...r.events);
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));

  headers.set("Cache-Control", "private, max-age=600");
  return json({
    generatedAt: new Date().toISOString(),
    range: { from, to },
    events,
    errors,
  }, 200, headers);
  };
}

// Nur in der Deno-Laufzeit starten; beim Import in den Tests passiert nichts.
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve(createHandler((name: string) => Deno.env.get(name)));
}
