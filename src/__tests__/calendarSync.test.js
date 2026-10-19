import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CalError, cacheClear, cacheLoad, cacheSave, defaultRange, feedUrl,
  fetchCalendar, filterBySources, isConfigured, normalizeSettings, testConnection,
} from "../calendarSync.js";

const ok = { url: "https://example.invalid/functions/v1/calendar-feed", token: "geheim" };

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const event = (o) => ({
  id: o.id, source: o.source, title: o.title || "Termin", location: "",
  start: o.start || "2026-10-20T09:00:00+02:00", end: o.end || "2026-10-20T10:00:00+02:00",
  allDay: false, busy: true,
});

describe("normalizeSettings", () => {
  it("füllt fehlende Felder auf", () => {
    expect(normalizeSettings(null)).toEqual({
      url: "", token: "", sources: { ew: true, aaa: true, privat: true },
    });
  });

  it("entfernt Leerzeichen und behält abgeschaltete Quellen", () => {
    const s = normalizeSettings({ url: "  https://x.invalid  ", token: " t ", sources: { aaa: false } });
    expect(s.url).toBe("https://x.invalid");
    expect(s.token).toBe("t");
    expect(s.sources).toEqual({ ew: true, aaa: false, privat: true });
  });

  it("erkennt eine vollständige Einrichtung", () => {
    expect(isConfigured(ok)).toBe(true);
    expect(isConfigured({ url: ok.url, token: "" })).toBe(false);
    expect(isConfigured(null)).toBe(false);
  });
});

describe("feedUrl", () => {
  it("hängt das Zeitfenster an und verträgt einen Schrägstrich am Ende", () => {
    const u = feedUrl(ok.url + "/", { from: "2026-10-01", to: "2026-10-31" });
    expect(u).toBe(ok.url + "?from=2026-10-01&to=2026-10-31");
  });

  it("verlangt https", () => {
    expect(() => feedUrl("http://example.invalid/f", {})).toThrow(/https/);
    expect(() => feedUrl("example.invalid", {})).toThrow(/https/);
  });
});

describe("defaultRange", () => {
  it("umschließt heute −7 bis +90 Tage", () => {
    expect(defaultRange("2026-10-19")).toEqual({ from: "2026-10-12", to: "2027-01-17" });
  });
});

describe("filterBySources", () => {
  const events = [event({ id: "a", source: "ew" }), event({ id: "b", source: "aaa" }), event({ id: "c", source: "privat" })];

  it("blendet abgeschaltete Quellen aus", () => {
    expect(filterBySources(events, { aaa: false }).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("zeigt ohne Angabe alle Quellen", () => {
    expect(filterBySources(events, undefined)).toHaveLength(3);
  });
});

describe("fetchCalendar", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("gibt Termine und Quellfehler zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({
      generatedAt: "2026-10-19T06:00:00Z",
      range: { from: "2026-10-12", to: "2027-01-17" },
      events: [event({ id: "ew-1", source: "ew" })],
      errors: [{ source: "aaa", message: "HTTP 404" }],
    })));
    const data = await fetchCalendar(ok);
    expect(data.events).toHaveLength(1);
    expect(data.errors).toEqual([{ source: "aaa", message: "HTTP 404" }]);
    expect(data.generatedAt).toBe("2026-10-19T06:00:00Z");
  });

  it("sendet den Token als Bearer-Header", async () => {
    const spy = vi.fn(async () => jsonRes({ events: [], errors: [] }));
    vi.stubGlobal("fetch", spy);
    await fetchCalendar(ok);
    expect(spy.mock.calls[0][1].headers.Authorization).toBe("Bearer geheim");
  });

  it("verwirft Termine mit unbekannter Quelle oder ohne Kennung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({
      events: [event({ id: "x", source: "fremd" }), { ...event({ id: "y", source: "ew" }), id: 7 }, event({ id: "z", source: "ew" })],
      errors: [],
    })));
    expect((await fetchCalendar(ok)).events.map((e) => e.id)).toEqual(["z"]);
  });

  it("meldet einen fehlenden Token, ohne abzurufen", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(fetchCalendar({ url: ok.url, token: "" })).rejects.toThrow(CalError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("übersetzt 401 in eine verständliche Meldung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: "unauthorized" }, 401)));
    await expect(fetchCalendar(ok)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("gibt die Meldung des Proxys bei fehlender Einrichtung weiter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: "not_configured", message: "Secrets fehlen." }, 503)));
    await expect(fetchCalendar(ok)).rejects.toMatchObject({ code: "server_not_configured", message: "Secrets fehlen." });
  });

  it("behandelt einen Netzwerkfehler als nicht erreichbar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchCalendar(ok)).rejects.toMatchObject({ code: "unreachable" });
  });

  it("weist eine Antwort ohne Terminliste ab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ hallo: "welt" })));
    await expect(fetchCalendar(ok)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("lässt einen Abbruch durch", async () => {
    const err = new Error("abgebrochen");
    err.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));
    await expect(fetchCalendar(ok)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("testConnection", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("meldet Erfolg mit der Anzahl der Termine", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ events: [event({ id: "a", source: "ew" })], errors: [] })));
    expect(await testConnection(ok)).toMatchObject({ ok: true, events: 1 });
  });

  it("meldet den Fehler, ohne zu werfen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: "unauthorized" }, 401)));
    const r = await testConnection(ok);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("unauthorized");
  });
});

describe("Zwischenspeicher", () => {
  // In jsdom gibt es keine IndexedDB, hier greift der localStorage-Rückfall.
  beforeEach(async () => { await cacheClear(); });

  it("sichert den letzten Stand und liest ihn zurück", async () => {
    const payload = { generatedAt: "2026-10-19T06:00:00Z", events: [event({ id: "a", source: "ew" })], errors: [] };
    expect(await cacheSave(payload)).toBe(true);
    expect(await cacheLoad()).toEqual(payload);
  });

  it("gibt ohne gespeicherten Stand null zurück", async () => {
    expect(await cacheLoad()).toBe(null);
  });

  it("lehnt übergroße Feeds ab, statt den Speicher zu füllen", async () => {
    const big = { generatedAt: "x", errors: [], events: Array.from({ length: 20000 }, (_, i) => event({ id: "e" + i, source: "ew", title: "T".repeat(80) })) };
    expect(await cacheSave(big)).toBe(false);
    expect(await cacheLoad()).toBe(null);
  });

  it("verträgt kaputten Inhalt im Speicher", async () => {
    localStorage.setItem("ctc_cal_cache_v1", "{kaputt");
    expect(await cacheLoad()).toBe(null);
  });
});
