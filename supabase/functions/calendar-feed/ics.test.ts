import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIcs } from "./ics.ts";
import { dayStartMs, resolveTzid } from "./tz.ts";

const TZ = "Europe/Vienna";
// Vitest läuft vom Projektverzeichnis aus.
const FIXTURES = join(process.cwd(), "supabase/functions/calendar-feed/__fixtures__");
const fx = (name: string) => readFileSync(join(FIXTURES, name), "utf-8");

// Weites Fenster, damit die Fixtures vollständig durchlaufen.
const FROM = dayStartMs(TZ, "2026-10-01");
const TO = dayStartMs(TZ, "2026-11-30");

const parse = (file: string, source: "ew" | "aaa" | "privat" = "ew", from = FROM, to = TO) =>
  parseIcs(fx(file), source, from, to);

describe("resolveTzid", () => {
  it("bildet Windows-Zeitzonennamen von Outlook auf IANA ab", () => {
    expect(resolveTzid("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(resolveTzid("Central Europe Standard Time")).toBe("Europe/Budapest");
    expect(resolveTzid("GMT Standard Time")).toBe("Europe/London");
  });

  it("lässt echte IANA-Namen unverändert", () => {
    expect(resolveTzid("Europe/Vienna")).toBe("Europe/Vienna");
    expect(resolveTzid("UTC")).toBe("UTC");
  });

  it("entfernt den Offset-Vorsatz von Outlook", () => {
    expect(resolveTzid("(UTC+01:00) W. Europe Standard Time")).toBe("Europe/Berlin");
  });

  it("fällt bei unbekannten Namen auf die Anzeigezone zurück", () => {
    expect(resolveTzid("Irgendeine Fantasiezone")).toBe("Europe/Vienna");
    expect(resolveTzid("")).toBe("Europe/Vienna");
    expect(resolveTzid(null)).toBe("Europe/Vienna");
  });
});

describe("parseIcs – Outlook-Serie mit Windows-Zeitzone", () => {
  const events = parse("outlook-weekly.ics");

  it("entfernt den per EXDATE abgesagten Termin", () => {
    expect(events.map((e) => e.start.slice(0, 10))).toEqual([
      "2026-10-06", "2026-10-20", "2026-10-27", "2026-11-03",
    ]);
  });

  it("übernimmt Titel und Zeit des geänderten Einzeltermins", () => {
    const moved = events.find((e) => e.start.startsWith("2026-10-20"));
    expect(moved?.start).toBe("2026-10-20T14:00:00+02:00");
    expect(moved?.end).toBe("2026-10-20T15:30:00+02:00");
    expect(moved?.title).toBe("Standardisierungsmeeting (verschoben)");
    expect(moved?.location).toBe("Raum B");
  });

  it("rechnet die Windows-Zeitzone über die Zeitumstellung korrekt", () => {
    expect(events.find((e) => e.start.startsWith("2026-10-06"))?.start)
      .toBe("2026-10-06T09:00:00+02:00");
    expect(events.find((e) => e.start.startsWith("2026-10-27"))?.start)
      .toBe("2026-10-27T09:00:00+01:00");
  });

  it("vergibt stabile, eindeutige IDs mit Quellenpräfix", () => {
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => i.startsWith("ew-"))).toBe(true);
    expect(parse("outlook-weekly.ics").map((e) => e.id)).toEqual(ids);
  });
});

describe("parseIcs – ganztägige und mehrtägige Termine", () => {
  const events = parse("google-allday.ics", "privat");

  it("erkennt den ganztägigen Termin", () => {
    const e = events.find((x) => x.title === "Betriebsausflug");
    expect(e?.allDay).toBe(true);
    expect(e?.start).toBe("2026-10-15T00:00:00+02:00");
    expect(e?.end).toBe("2026-10-16T00:00:00+02:00");
  });

  it("behält beim mehrtägigen Termin die exklusive ICS-Endzeit", () => {
    const e = events.find((x) => x.title === "Recurrent Training");
    expect(e?.allDay).toBe(true);
    expect(e?.start).toBe("2026-10-19T00:00:00+02:00");
    expect(e?.end).toBe("2026-10-23T00:00:00+02:00");
  });

  it("behandelt Termine mit Uhrzeit weiter als nicht ganztägig", () => {
    const e = events.find((x) => x.title === "Abstimmung AAA");
    expect(e?.allDay).toBe(false);
    expect(e?.start).toBe("2026-10-21T13:30:00+02:00");
    expect(e?.source).toBe("privat");
  });
});

describe("parseIcs – Status und Verfügbarkeit", () => {
  const events = parse("cancelled-transparent.ics");

  it("filtert abgesagte Termine aus", () => {
    expect(events.some((e) => e.title === "Abgesagter Termin")).toBe(false);
    expect(events).toHaveLength(2);
  });

  it("markiert TRANSP:TRANSPARENT als frei", () => {
    expect(events.find((e) => e.title === "Arbeitszeit blocken")?.busy).toBe(false);
    expect(events.find((e) => e.title === "Jour fixe")?.busy).toBe(true);
  });
});

describe("parseIcs – Sommer-/Winterzeitwechsel am 25.10.2026", () => {
  const events = parse("dst-change.ics");

  it("rechnet einen Termin über die Umstellungsnacht korrekt", () => {
    const e = events.find((x) => x.title.startsWith("Nachtschicht"));
    expect(e?.start).toBe("2026-10-25T01:30:00+02:00");
    expect(e?.end).toBe("2026-10-25T04:30:00+01:00");
  });

  it("verschiebt eine tägliche Serie ab der Umstellung auf Winterzeit", () => {
    const briefings = events
      .filter((x) => x.title === "Morgenbriefing")
      .map((x) => x.start);
    expect(briefings).toEqual([
      "2026-10-24T09:00:00+02:00",
      "2026-10-25T09:00:00+01:00",
      "2026-10-26T09:00:00+01:00",
    ]);
  });
});

describe("parseIcs – Zeitzone ohne VTIMEZONE-Block", () => {
  const events = parse("outlook-no-vtimezone.ics");

  it("nutzt den Windows-Namen als Rückfall", () => {
    expect(events.find((e) => e.title === "Termin ohne VTIMEZONE")?.start)
      .toBe("2026-10-20T09:00:00+02:00");
  });

  it("nutzt bei unbekannter Zone die Anzeigezone", () => {
    expect(events.find((e) => e.title === "Termin mit unbekannter Zone")?.start)
      .toBe("2026-10-20T11:00:00+02:00");
  });
});

describe("parseIcs – Zeitfenster", () => {
  it("lässt Termine außerhalb des Fensters weg", () => {
    const events = parse(
      "outlook-weekly.ics", "ew",
      dayStartMs(TZ, "2026-10-19"), dayStartMs(TZ, "2026-10-21"),
    );
    expect(events.map((e) => e.start.slice(0, 10))).toEqual(["2026-10-20"]);
  });

  it("nimmt einen Termin mit, der in das Fenster hineinragt", () => {
    const events = parse(
      "google-allday.ics", "privat",
      dayStartMs(TZ, "2026-10-22"), dayStartMs(TZ, "2026-10-23"),
    );
    expect(events.map((e) => e.title)).toEqual(["Recurrent Training"]);
  });

  it("gibt Termine chronologisch zurück", () => {
    const starts = parse("google-allday.ics", "privat").map((e) => e.start);
    expect([...starts].sort()).toEqual(starts);
  });
});

describe("parseIcs – Fehlerfälle", () => {
  it("weist Inhalte ohne VCALENDAR ab", () => {
    expect(() => parseIcs("<html>Anmeldeseite</html>", "ew", FROM, TO))
      .toThrow(/Keine ICS-Daten/);
  });

  it("weist einen leeren Text ab", () => {
    expect(() => parseIcs("", "ew", FROM, TO)).toThrow();
  });

  it("verträgt einen Kalender ohne Termine", () => {
    const empty = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//y//EN\r\nEND:VCALENDAR";
    expect(parseIcs(empty, "aaa", FROM, TO)).toEqual([]);
  });
});
