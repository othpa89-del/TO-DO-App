import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHandler } from "./index.ts";

const ORIGIN = "https://othpa89-del.github.io";
const TOKEN = "ein-sehr-langes-geheimes-token";
const URL_BASE = "https://projekt.supabase.co/functions/v1/calendar-feed";

const FIXTURES = join(process.cwd(), "supabase/functions/calendar-feed/__fixtures__");
const fx = (name: string) => readFileSync(join(FIXTURES, name), "utf-8");

const envOf = (over: Record<string, string> = {}) => {
  const vals: Record<string, string> = {
    PLANER_TOKEN: TOKEN, ALLOWED_ORIGIN: ORIGIN, ...over,
  };
  return (name: string) => vals[name];
};

const req = (opts: { method?: string; token?: string | null; origin?: string | null; query?: string } = {}) => {
  const h = new Headers();
  if (opts.token !== null) h.set("Authorization", `Bearer ${opts.token ?? TOKEN}`);
  if (opts.origin !== null) h.set("Origin", opts.origin ?? ORIGIN);
  return new Request(URL_BASE + (opts.query || ""), { method: opts.method || "GET", headers: h });
};

describe("calendar-feed – Zugriffsschutz", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("liefert ohne Token keine Daten", async () => {
    const res = await createHandler(envOf({ ICS_EW: "https://quelle.invalid/a.ics" }))(req({ token: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
    expect(body.events).toBeUndefined();
  });

  it("liefert mit falschem Token keine Daten", async () => {
    const res = await createHandler(envOf({ ICS_EW: "https://quelle.invalid/a.ics" }))(req({ token: "falsch" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("ruft die Quellen bei falschem Token gar nicht erst ab", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await createHandler(envOf({ ICS_EW: "https://quelle.invalid/a.ics" }))(req({ token: "falsch" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("verweigert den Dienst, solange die Secrets fehlen", async () => {
    const res = await createHandler(() => undefined)(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("lehnt andere Methoden als GET ab", async () => {
    const res = await createHandler(envOf())(req({ method: "POST" }));
    expect(res.status).toBe(405);
  });
});

describe("calendar-feed – CORS", () => {
  it("antwortet auf den Preflight mit dem erlaubten Origin", async () => {
    const res = await createHandler(envOf())(req({ method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
  });

  it("setzt für einen fremden Origin keinen CORS-Header", async () => {
    const res = await createHandler(envOf())(req({ origin: "https://fremde-seite.invalid" }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(null);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("verträgt einen Schrägstrich am Ende von ALLOWED_ORIGIN", async () => {
    const res = await createHandler(envOf({ ALLOWED_ORIGIN: ORIGIN + "/" }))(req({ method: "OPTIONS" }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});

describe("calendar-feed – Zeitfenster", () => {
  it("weist ein unsinniges Datum ab", async () => {
    const res = await createHandler(envOf())(req({ query: "?from=20261001&to=2026-10-31" }));
    expect(res.status).toBe(400);
  });

  it("weist ein Ende vor dem Beginn ab", async () => {
    const res = await createHandler(envOf())(req({ query: "?from=2026-10-31&to=2026-10-01" }));
    expect(res.status).toBe(400);
  });

  it("kürzt ein Fenster über 180 Tage", async () => {
    const res = await createHandler(envOf())(req({ query: "?from=2026-01-01&to=2026-12-31" }));
    expect(res.status).toBe(200);
    const { range } = await res.json();
    expect(range).toEqual({ from: "2026-01-01", to: "2026-06-29" }); // 180 Tage
  });

  it("übernimmt ein gültiges Fenster unverändert", async () => {
    const res = await createHandler(envOf())(req({ query: "?from=2026-10-01&to=2026-10-31" }));
    expect((await res.json()).range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("calendar-feed – Quellen", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const okRes = (text: string) => ({
    ok: true, status: 200, headers: new Headers(), text: async () => text,
  });

  it("führt mehrere Quellen zusammen und kennzeichnet sie", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) =>
      okRes(String(u).includes("ew") ? fx("outlook-weekly.ics") : fx("google-allday.ics"))));
    const res = await createHandler(envOf({
      ICS_EW: "https://quelle.invalid/ew.ics",
      ICS_PRIVAT: "https://quelle.invalid/privat.ics",
    }))(req({ query: "?from=2026-10-01&to=2026-10-31" }));
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(new Set(body.events.map((e: { source: string }) => e.source))).toEqual(new Set(["ew", "privat"]));
    // chronologisch sortiert
    const starts = body.events.map((e: { start: string }) => e.start);
    expect([...starts].sort()).toEqual(starts);
  });

  it("liefert die übrigen Quellen, wenn eine ausfällt", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (String(u).includes("aaa")) return { ok: false, status: 404, headers: new Headers(), text: async () => "" };
      return okRes(fx("outlook-weekly.ics"));
    }));
    const res = await createHandler(envOf({
      ICS_EW: "https://quelle.invalid/ew.ics",
      ICS_AAA: "https://quelle.invalid/aaa.ics",
    }))(req({ query: "?from=2026-10-01&to=2026-10-31" }));
    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.errors).toEqual([{ source: "aaa", message: "HTTP 404" }]);
  });

  it("entfernt URLs aus Fehlermeldungen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("error sending request for url (https://geheim.invalid/kalender.ics)");
    }));
    const res = await createHandler(envOf({ ICS_EW: "https://geheim.invalid/kalender.ics" }))(req());
    const body = await res.json();
    expect(body.errors[0].message).not.toContain("geheim.invalid");
    expect(body.errors[0].message).toContain("[URL entfernt]");
  });

  it("überspringt leere Quellen", async () => {
    const spy = vi.fn(async () => okRes(fx("outlook-weekly.ics")));
    vi.stubGlobal("fetch", spy);
    await createHandler(envOf({ ICS_EW: "https://quelle.invalid/ew.ics", ICS_AAA: "", ICS_PRIVAT: "   " }))(req());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("meldet eine Anmeldeseite statt ICS als Quellfehler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okRes("<html>Bitte anmelden</html>")));
    const res = await createHandler(envOf({ ICS_EW: "https://quelle.invalid/ew.ics" }))(req());
    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.errors[0]).toMatchObject({ source: "ew" });
    expect(body.errors[0].message).toContain("Keine ICS-Daten");
  });

  it("setzt den vorgesehenen Cache-Header", async () => {
    const res = await createHandler(envOf())(req());
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=600");
  });
});
