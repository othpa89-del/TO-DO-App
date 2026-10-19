// Zeitzonen-Hilfen für die Kalender-Integration.
//
// Zwei Aufgaben:
//  1. Windows-Zeitzonennamen, wie Outlook sie in TZID schreibt
//     ("W. Europe Standard Time"), auf IANA-Namen abbilden.
//  2. Wanduhrzeit <-> UTC umrechnen und ISO-Zeitstempel mit Offset bauen.
//     Die Zeitzonendaten kommen aus Intl (in Deno und Node vollständig
//     vorhanden), deshalb braucht es keine eigene Zeitzonendatenbank.

/** Anzeigezone des Planers. Alle Ausgaben werden darauf normalisiert. */
export const DISPLAY_TZ = "Europe/Vienna";

/**
 * Windows-Zeitzonennamen -> IANA. Quelle: CLDR windowsZones (Territorium 001).
 * Enthält die gängigen Zonen; unbekannte Namen fallen auf DISPLAY_TZ zurück.
 */
export const WINDOWS_TZ: Record<string, string> = {
  "afghanistan standard time": "Asia/Kabul",
  "alaskan standard time": "America/Anchorage",
  "aleutian standard time": "America/Adak",
  "altai standard time": "Asia/Barnaul",
  "arab standard time": "Asia/Riyadh",
  "arabian standard time": "Asia/Dubai",
  "arabic standard time": "Asia/Baghdad",
  "argentina standard time": "America/Argentina/Buenos_Aires",
  "astrakhan standard time": "Europe/Astrakhan",
  "atlantic standard time": "America/Halifax",
  "aus central standard time": "Australia/Darwin",
  "aus eastern standard time": "Australia/Sydney",
  "azerbaijan standard time": "Asia/Baku",
  "azores standard time": "Atlantic/Azores",
  "bahia standard time": "America/Bahia",
  "bangladesh standard time": "Asia/Dhaka",
  "belarus standard time": "Europe/Minsk",
  "bougainville standard time": "Pacific/Bougainville",
  "canada central standard time": "America/Regina",
  "cape verde standard time": "Atlantic/Cape_Verde",
  "caucasus standard time": "Asia/Yerevan",
  "cen. australia standard time": "Australia/Adelaide",
  "central america standard time": "America/Guatemala",
  "central asia standard time": "Asia/Almaty",
  "central brazilian standard time": "America/Cuiaba",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "central pacific standard time": "Pacific/Guadalcanal",
  "central standard time": "America/Chicago",
  "central standard time (mexico)": "America/Mexico_City",
  "chatham islands standard time": "Pacific/Chatham",
  "china standard time": "Asia/Shanghai",
  "cuba standard time": "America/Havana",
  "e. africa standard time": "Africa/Nairobi",
  "e. australia standard time": "Australia/Brisbane",
  "e. europe standard time": "Europe/Chisinau",
  "e. south america standard time": "America/Sao_Paulo",
  "easter island standard time": "Pacific/Easter",
  "eastern standard time": "America/New_York",
  "eastern standard time (mexico)": "America/Cancun",
  "egypt standard time": "Africa/Cairo",
  "ekaterinburg standard time": "Asia/Yekaterinburg",
  "fiji standard time": "Pacific/Fiji",
  "fle standard time": "Europe/Kiev",
  "georgian standard time": "Asia/Tbilisi",
  "gmt standard time": "Europe/London",
  "greenland standard time": "America/Nuuk",
  "greenwich standard time": "Atlantic/Reykjavik",
  "gtb standard time": "Europe/Bucharest",
  "haiti standard time": "America/Port-au-Prince",
  "hawaiian standard time": "Pacific/Honolulu",
  "india standard time": "Asia/Kolkata",
  "iran standard time": "Asia/Tehran",
  "israel standard time": "Asia/Jerusalem",
  "jordan standard time": "Asia/Amman",
  "kaliningrad standard time": "Europe/Kaliningrad",
  "korea standard time": "Asia/Seoul",
  "libya standard time": "Africa/Tripoli",
  "line islands standard time": "Pacific/Kiritimati",
  "lord howe standard time": "Australia/Lord_Howe",
  "magadan standard time": "Asia/Magadan",
  "magallanes standard time": "America/Punta_Arenas",
  "marquesas standard time": "Pacific/Marquesas",
  "mauritius standard time": "Indian/Mauritius",
  "middle east standard time": "Asia/Beirut",
  "montevideo standard time": "America/Montevideo",
  "morocco standard time": "Africa/Casablanca",
  "mountain standard time": "America/Denver",
  "mountain standard time (mexico)": "America/Chihuahua",
  "myanmar standard time": "Asia/Yangon",
  "n. central asia standard time": "Asia/Novosibirsk",
  "namibia standard time": "Africa/Windhoek",
  "nepal standard time": "Asia/Kathmandu",
  "new zealand standard time": "Pacific/Auckland",
  "newfoundland standard time": "America/St_Johns",
  "norfolk standard time": "Pacific/Norfolk",
  "north asia east standard time": "Asia/Irkutsk",
  "north asia standard time": "Asia/Krasnoyarsk",
  "north korea standard time": "Asia/Pyongyang",
  "omsk standard time": "Asia/Omsk",
  "pacific sa standard time": "America/Santiago",
  "pacific standard time": "America/Los_Angeles",
  "pacific standard time (mexico)": "America/Tijuana",
  "pakistan standard time": "Asia/Karachi",
  "paraguay standard time": "America/Asuncion",
  "qyzylorda standard time": "Asia/Qyzylorda",
  "romance standard time": "Europe/Paris",
  "russia time zone 3": "Europe/Samara",
  "russia time zone 10": "Asia/Srednekolymsk",
  "russia time zone 11": "Asia/Kamchatka",
  "russian standard time": "Europe/Moscow",
  "sa eastern standard time": "America/Cayenne",
  "sa pacific standard time": "America/Bogota",
  "sa western standard time": "America/La_Paz",
  "saint pierre standard time": "America/Miquelon",
  "sakhalin standard time": "Asia/Sakhalin",
  "samoa standard time": "Pacific/Apia",
  "sao tome standard time": "Africa/Sao_Tome",
  "saratov standard time": "Europe/Saratov",
  "se asia standard time": "Asia/Bangkok",
  "singapore standard time": "Asia/Singapore",
  "south africa standard time": "Africa/Johannesburg",
  "south sudan standard time": "Africa/Juba",
  "sri lanka standard time": "Asia/Colombo",
  "sudan standard time": "Africa/Khartoum",
  "syria standard time": "Asia/Damascus",
  "taipei standard time": "Asia/Taipei",
  "tasmania standard time": "Australia/Hobart",
  "tocantins standard time": "America/Araguaina",
  "tokyo standard time": "Asia/Tokyo",
  "tomsk standard time": "Asia/Tomsk",
  "tonga standard time": "Pacific/Tongatapu",
  "transbaikal standard time": "Asia/Chita",
  "turkey standard time": "Europe/Istanbul",
  "turks and caicos standard time": "America/Grand_Turk",
  "ulaanbaatar standard time": "Asia/Ulaanbaatar",
  "us eastern standard time": "America/Indiana/Indianapolis",
  "us mountain standard time": "America/Phoenix",
  "utc": "UTC",
  "utc+12": "Etc/GMT-12",
  "utc+13": "Etc/GMT-13",
  "utc-02": "Etc/GMT+2",
  "utc-08": "Etc/GMT+8",
  "utc-09": "Etc/GMT+9",
  "utc-11": "Etc/GMT+11",
  "venezuela standard time": "America/Caracas",
  "vladivostok standard time": "Asia/Vladivostok",
  "volgograd standard time": "Europe/Volgograd",
  "w. australia standard time": "Australia/Perth",
  "w. central africa standard time": "Africa/Lagos",
  "w. europe standard time": "Europe/Berlin",
  "w. mongolia standard time": "Asia/Hovd",
  "west asia standard time": "Asia/Tashkent",
  "west bank standard time": "Asia/Hebron",
  "west pacific standard time": "Pacific/Port_Moresby",
  "yakutsk standard time": "Asia/Yakutsk",
  "yukon standard time": "America/Whitehorse",
};

const validCache = new Map<string, boolean>();

/** Prüft, ob Intl die Zone kennt (echter IANA-Name). */
export function isValidZone(tz: string): boolean {
  if (!tz) return false;
  const hit = validCache.get(tz);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    ok = true;
  } catch {
    ok = false;
  }
  validCache.set(tz, ok);
  return ok;
}

/**
 * Löst einen TZID aus einer ICS-Datei auf einen nutzbaren IANA-Namen auf.
 * Reihenfolge: echter IANA-Name -> Windows-Name -> Anzeigezone als Rückfall.
 * Outlook schreibt gelegentlich Präfixe wie "(UTC+01:00) Wien" davor; die
 * Klammer wird deshalb entfernt, bevor nachgesehen wird.
 */
export function resolveTzid(tzid: string | null | undefined, fallback = DISPLAY_TZ): string {
  const raw = (tzid || "").trim().replace(/^"|"$/g, "");
  if (!raw) return fallback;
  if (isValidZone(raw)) return raw;
  const cleaned = raw.replace(/^\(UTC[^)]*\)\s*/i, "").trim();
  if (cleaned !== raw && isValidZone(cleaned)) return cleaned;
  const win = WINDOWS_TZ[cleaned.toLowerCase()] || WINDOWS_TZ[raw.toLowerCase()];
  if (win && isValidZone(win)) return win;
  return fallback;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

/** Wanduhrzeit in der Zone zu einem UTC-Zeitpunkt. */
function wallOf(tz: string, utcMs: number): Wall {
  const parts = dtf(tz).formatToParts(new Date(utcMs));
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    y: num("year"), mo: num("month"), d: num("day"),
    h: num("hour") % 24, mi: num("minute"), s: num("second"),
  };
}

/** Offset der Zone in Minuten zum UTC-Zeitpunkt (z. B. 120 für MESZ). */
export function zoneOffsetMinutes(tz: string, utcMs: number): number {
  const w = wallOf(tz, utcMs);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * Wanduhrzeit in der Zone -> UTC-Millisekunden. Zwei Durchläufe, weil der
 * Offset selbst vom Ergebnis abhängt (Sommer-/Winterzeit).
 */
export function wallToUtcMs(
  tz: string, y: number, mo: number, d: number, h = 0, mi = 0, s = 0,
): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const next = naive - zoneOffsetMinutes(tz, guess) * 60000;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC-Zeitpunkt als ISO 8601 mit Offset der Zone, z. B. 2026-10-20T09:00:00+02:00. */
export function isoInZone(tz: string, utcMs: number): string {
  const w = wallOf(tz, utcMs);
  const off = zoneOffsetMinutes(tz, utcMs);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Kalendertag (YYYY-MM-DD) eines UTC-Zeitpunkts in der Zone. */
export function dayInZone(tz: string, utcMs: number): string {
  const w = wallOf(tz, utcMs);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}

/** Mitternacht des Kalendertags (YYYY-MM-DD) in der Zone als UTC-Millisekunden. */
export function dayStartMs(tz: string, day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) throw new Error("Ungültiges Datum: erwartet YYYY-MM-DD");
  return wallToUtcMs(tz, Number(m[1]), Number(m[2]), Number(m[3]));
}
