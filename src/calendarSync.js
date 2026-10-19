// Abruf der synchronisierten Kalendertermine über die Edge Function
// "calendar-feed" samt lokalem Zwischenspeicher für den Offline-Betrieb.
//
// Proxy-Adresse und Token liegen im kv-Satz des angemeldeten Nutzers, damit
// die Einrichtung auf Desktop, iPhone und iPad nur einmal nötig ist. Sie
// stehen bewusst nirgends im Code und nicht im Repo.

import { L } from "./i18n.js";
import { shiftDay } from "./calendar.js";

/** Schlüssel im kv-Speicher (synchronisiert über das Konto). */
export const CAL_KEY = "calendar-settings";

export const SOURCE_KEYS = ["ew", "aaa", "privat"];

export const DEFAULT_SETTINGS = {
  url: "",
  token: "",
  sources: { ew: true, aaa: true, privat: true },
};

/** Standardfenster wie in der Edge Function: heute −7 bis +90 Tage. */
export function defaultRange(today) {
  const day = today || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
  return { from: shiftDay(day, -7), to: shiftDay(day, 90) };
}

/** Gespeicherte Einstellungen auf eine vollständige, sichere Form bringen. */
export function normalizeSettings(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const src = o.sources && typeof o.sources === "object" ? o.sources : {};
  return {
    url: typeof o.url === "string" ? o.url.trim() : "",
    token: typeof o.token === "string" ? o.token.trim() : "",
    sources: SOURCE_KEYS.reduce((acc, k) => {
      acc[k] = src[k] !== false; // standardmäßig eingeschaltet
      return acc;
    }, {}),
  };
}

export function isConfigured(settings) {
  const s = normalizeSettings(settings);
  return !!(s.url && s.token);
}

export async function loadSettings() {
  try {
    const r = await window.storage.get(CAL_KEY);
    return normalizeSettings(r && r.value ? JSON.parse(r.value) : null);
  } catch {
    return { ...DEFAULT_SETTINGS, sources: { ...DEFAULT_SETTINGS.sources } };
  }
}

export async function persistSettings(settings) {
  const s = normalizeSettings(settings);
  await window.storage.set(CAL_KEY, JSON.stringify(s));
  return s;
}

/** Fehler mit maschinenlesbarem Code, damit die Oberfläche passend reagieren kann. */
export class CalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CalError";
    this.code = code;
  }
}

/** Abrufadresse bauen. Akzeptiert die Function-URL mit oder ohne Schrägstrich am Ende. */
export function feedUrl(base, range) {
  const clean = String(base || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(clean)) {
    throw new CalError("bad_url", L("Die Proxy-Adresse muss mit https:// beginnen.", "The proxy address must start with https://."));
  }
  const u = new URL(clean);
  if (range?.from) u.searchParams.set("from", range.from);
  if (range?.to) u.searchParams.set("to", range.to);
  return u.toString();
}

function eventOk(e) {
  return e && typeof e === "object" &&
    typeof e.id === "string" && typeof e.start === "string" &&
    SOURCE_KEYS.includes(e.source);
}

/**
 * Termine abrufen. Wirft einen CalError; der Aufrufer zeigt bei einem Fehler
 * weiter den letzten Stand aus dem Zwischenspeicher an.
 */
export async function fetchCalendar(settings, opts = {}) {
  const s = normalizeSettings(settings);
  if (!s.url || !s.token) {
    throw new CalError("not_configured", L("Proxy-Adresse und Token fehlen noch.", "Proxy address and token are still missing."));
  }
  const url = feedUrl(s.url, opts.range || defaultRange());

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: opts.signal,
      headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" },
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new CalError("unreachable", L("Proxy nicht erreichbar. Adresse prüfen oder später erneut versuchen.", "Proxy not reachable. Check the address or try again later."));
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new CalError("unauthorized", L("Token ungültig. In den Einstellungen korrigieren.", "Invalid token. Correct it in the settings."));
    }
    if (res.status === 503 && body?.error === "not_configured") {
      throw new CalError("server_not_configured", body.message || L("Der Proxy ist noch nicht vollständig eingerichtet.", "The proxy is not fully set up yet."));
    }
    if (body?.message) throw new CalError(body.error || "http_error", String(body.message).slice(0, 300));
    throw new CalError("http_error", `HTTP ${res.status}`);
  }

  if (!body || !Array.isArray(body.events)) {
    throw new CalError("bad_response", L("Unerwartete Antwort vom Proxy.", "Unexpected response from the proxy."));
  }

  return {
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : new Date().toISOString(),
    range: body.range && typeof body.range === "object" ? body.range : null,
    events: body.events.filter(eventOk),
    errors: Array.isArray(body.errors) ? body.errors.filter((e) => e && SOURCE_KEYS.includes(e.source)) : [],
  };
}

/** „Verbindung testen": kurzes Fenster, damit die Antwort schnell kommt. */
export async function testConnection(settings) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
  try {
    const data = await fetchCalendar(settings, { range: { from: today, to: shiftDay(today, 7) } });
    return { ok: true, events: data.events.length, errors: data.errors, generatedAt: data.generatedAt };
  } catch (err) {
    return { ok: false, code: err?.code || "error", message: err?.message || String(err) };
  }
}

/** Nur die eingeschalteten Quellen (§4.1: Quellen einzeln ein-/ausblenden). */
export function filterBySources(events, sources) {
  const on = normalizeSettings({ sources }).sources;
  return (events || []).filter((e) => on[e.source] !== false);
}

// ---------------------------------------------------------------------------
//  Zwischenspeicher: IndexedDB bevorzugt (§4.2), localStorage als Rückfall.
//  Jeder Zugriff ist in try/catch, damit ein privates Fenster oder gesperrter
//  Speicher die App nicht beeinträchtigt.
// ---------------------------------------------------------------------------

const DB_NAME = "ctc-calendar";
const STORE = "feed";
const ROW = "last";
const LS_KEY = "ctc_cal_cache_v1";
const LS_MAX = 1_500_000; // localStorage nicht mit großen Feeds zumüllen

function openDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, ROW);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbGet(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(ROW);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Letzte erfolgreiche Antwort sichern. */
export async function cacheSave(payload) {
  const db = await openDb();
  if (db) {
    const ok = await idbPut(db, payload);
    try { db.close(); } catch { /* egal */ }
    if (ok) return true;
  }
  try {
    const text = JSON.stringify(payload);
    if (text.length > LS_MAX) return false;
    localStorage.setItem(LS_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** Letzten Stand laden; null, wenn noch keiner vorliegt. */
export async function cacheLoad() {
  const db = await openDb();
  if (db) {
    const v = await idbGet(db);
    try { db.close(); } catch { /* egal */ }
    if (v && Array.isArray(v.events)) return v;
  }
  try {
    const text = localStorage.getItem(LS_KEY);
    if (!text) return null;
    const v = JSON.parse(text);
    return v && Array.isArray(v.events) ? v : null;
  } catch {
    return null;
  }
}

/** Zwischenspeicher leeren (z. B. wenn der Nutzer die Einrichtung entfernt). */
export async function cacheClear() {
  const db = await openDb();
  if (db) {
    await idbPut(db, { generatedAt: null, events: [], errors: [] });
    try { db.close(); } catch { /* egal */ }
  }
  try { localStorage.removeItem(LS_KEY); } catch { /* egal */ }
}
