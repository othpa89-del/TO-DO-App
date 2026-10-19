import { describe, expect, it } from "vitest";
import {
  assignLanes, conflictsInDays, dayKey, dayKeysOf, daySpanOf, eventsOnDay,
  findConflicts, groupByDay, hourRange, isoWeek, minutesOfDay, nextDay,
  shiftDay, sortEvents, weekDays, weekStart,
} from "../calendar.js";

const ev = (o) => ({
  id: o.id, source: o.source || "ew", title: o.title || "Termin",
  location: "", start: o.start, end: o.end,
  allDay: !!o.allDay, busy: o.busy !== false,
});

describe("Kalendertage", () => {
  it("bestimmt den Tag in der Anzeigezone", () => {
    expect(dayKey("2026-10-20T09:00:00+02:00")).toBe("2026-10-20");
    // 23:30 UTC ist in Wien schon der nächste Tag
    expect(dayKey("2026-10-20T23:30:00Z")).toBe("2026-10-21");
  });

  it("zählt kalendarisch weiter, auch über Monats- und Jahreswechsel", () => {
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(shiftDay("2026-10-20", -7)).toBe("2026-10-13");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("behandelt die Endzeit mehrtägiger Termine als ausschließlich", () => {
    const e = ev({ id: "a", start: "2026-10-19T00:00:00+02:00", end: "2026-10-23T00:00:00+02:00", allDay: true });
    expect(dayKeysOf(e)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("ordnet einen Termin über Mitternacht beiden Tagen zu", () => {
    const e = ev({ id: "b", start: "2026-10-25T01:30:00+02:00", end: "2026-10-25T04:30:00+01:00" });
    expect(dayKeysOf(e)).toEqual(["2026-10-25"]);
    const n = ev({ id: "c", start: "2026-10-20T23:00:00+02:00", end: "2026-10-21T01:00:00+02:00" });
    expect(dayKeysOf(n)).toEqual(["2026-10-20", "2026-10-21"]);
  });

  it("gruppiert nach Tag und listet mehrtägige Termine an jedem Tag", () => {
    const events = [
      ev({ id: "m", start: "2026-10-19T00:00:00+02:00", end: "2026-10-21T00:00:00+02:00", allDay: true }),
      ev({ id: "t", start: "2026-10-20T09:00:00+02:00", end: "2026-10-20T10:00:00+02:00" }),
    ];
    const g = groupByDay(events);
    expect(g.get("2026-10-19").map((e) => e.id)).toEqual(["m"]);
    expect(g.get("2026-10-20").map((e) => e.id)).toEqual(["m", "t"]);
    expect(eventsOnDay(events, "2026-10-21")).toEqual([]);
  });

  it("sortiert ganztägige Termine nach oben", () => {
    const sorted = sortEvents([
      ev({ id: "t", start: "2026-10-20T08:00:00+02:00", end: "2026-10-20T09:00:00+02:00" }),
      ev({ id: "a", start: "2026-10-20T00:00:00+02:00", end: "2026-10-21T00:00:00+02:00", allDay: true }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "t"]);
  });
});

describe("Konflikterkennung", () => {
  const ewMeeting = ev({ id: "ew1", source: "ew", start: "2026-10-20T09:00:00+02:00", end: "2026-10-20T10:00:00+02:00" });

  it("meldet Überschneidungen aus unterschiedlichen Quellen", () => {
    const aaa = ev({ id: "aaa1", source: "aaa", start: "2026-10-20T09:30:00+02:00", end: "2026-10-20T10:30:00+02:00" });
    const { ids, pairs } = findConflicts([ewMeeting, aaa]);
    expect(ids.has("ew1")).toBe(true);
    expect(ids.has("aaa1")).toBe(true);
    expect(pairs).toHaveLength(1);
    expect(new Date(pairs[0].from).toISOString()).toBe("2026-10-20T07:30:00.000Z");
    expect(new Date(pairs[0].to).toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });

  it("meldet Überschneidungen innerhalb derselben Quelle nicht", () => {
    const same = ev({ id: "ew2", source: "ew", start: "2026-10-20T09:30:00+02:00", end: "2026-10-20T10:30:00+02:00" });
    expect(findConflicts([ewMeeting, same]).pairs).toHaveLength(0);
  });

  it("wertet aneinander grenzende Termine nicht als Konflikt", () => {
    const after = ev({ id: "aaa2", source: "aaa", start: "2026-10-20T10:00:00+02:00", end: "2026-10-20T11:00:00+02:00" });
    expect(findConflicts([ewMeeting, after]).pairs).toHaveLength(0);
  });

  it("ignoriert ganztägige Termine", () => {
    const allDay = ev({ id: "p1", source: "privat", start: "2026-10-20T00:00:00+02:00", end: "2026-10-21T00:00:00+02:00", allDay: true });
    expect(findConflicts([ewMeeting, allDay]).pairs).toHaveLength(0);
  });

  it("ignoriert als frei markierte Termine", () => {
    const free = ev({ id: "p2", source: "privat", start: "2026-10-20T09:15:00+02:00", end: "2026-10-20T09:45:00+02:00", busy: false });
    expect(findConflicts([ewMeeting, free]).pairs).toHaveLength(0);
  });

  it("findet mehrere Konflikte und sortiert sie chronologisch", () => {
    const events = [
      ewMeeting,
      ev({ id: "aaa3", source: "aaa", start: "2026-10-20T09:30:00+02:00", end: "2026-10-20T10:30:00+02:00" }),
      ev({ id: "p3", source: "privat", start: "2026-10-21T14:00:00+02:00", end: "2026-10-21T15:00:00+02:00" }),
      ev({ id: "ew3", source: "ew", start: "2026-10-21T14:30:00+02:00", end: "2026-10-21T16:00:00+02:00" }),
    ];
    const { pairs } = findConflicts(events);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].from < pairs[1].from).toBe(true);
  });

  it("verträgt fehlende oder unsinnige Zeitangaben", () => {
    const broken = [
      ev({ id: "x", source: "ew", start: "keine Zeit", end: "auch nicht" }),
      ev({ id: "y", source: "aaa", start: "2026-10-20T09:00:00+02:00", end: "2026-10-20T09:00:00+02:00" }),
      null,
    ];
    expect(findConflicts(broken).pairs).toHaveLength(0);
  });

  it("begrenzt die Konfliktliste auf die nächsten 14 Tage", () => {
    const now = Date.parse("2026-10-20T06:00:00Z");
    const events = [
      ewMeeting,
      ev({ id: "aaa4", source: "aaa", start: "2026-10-20T09:30:00+02:00", end: "2026-10-20T10:30:00+02:00" }),
      ev({ id: "p4", source: "privat", start: "2026-11-20T09:00:00+01:00", end: "2026-11-20T10:00:00+01:00" }),
      ev({ id: "ew4", source: "ew", start: "2026-11-20T09:30:00+01:00", end: "2026-11-20T10:30:00+01:00" }),
    ];
    const near = conflictsInDays(events, 14, now);
    expect(near).toHaveLength(1);
    expect(near[0].a.id).toBe("ew1");
  });

  it("lässt bereits beendete Konflikte weg", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const events = [
      ewMeeting,
      ev({ id: "aaa5", source: "aaa", start: "2026-10-20T09:30:00+02:00", end: "2026-10-20T10:30:00+02:00" }),
    ];
    expect(conflictsInDays(events, 14, now)).toHaveLength(0);
  });
});

describe("Wochenansicht", () => {
  it("findet den Montag der Woche", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19"); // Mittwoch -> Montag
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Montag bleibt
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sonntag gehört zur Vorwoche
  });

  it("liefert sieben Tage von Montag bis Sonntag", () => {
    const d = weekDays("2026-10-21");
    expect(d).toHaveLength(7);
    expect(d[0]).toBe("2026-10-19");
    expect(d[6]).toBe("2026-10-25");
  });

  it("zählt die ISO-Kalenderwoche", () => {
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2026-01-05")).toBe(2);
    expect(isoWeek("2026-10-19")).toBe(43);
    expect(isoWeek("2026-12-31")).toBe(53); // 2026 hat 53 Wochen
  });

  it("rechnet die Uhrzeit in Minuten seit Mitternacht", () => {
    expect(minutesOfDay("2026-10-20T09:00:00+02:00")).toBe(540);
    expect(minutesOfDay("2026-10-20T07:00:00Z")).toBe(540); // Anzeige in Wien
  });

  it("beschneidet einen Termin über Mitternacht auf beide Tage", () => {
    const ev = { start: "2026-10-20T23:00:00+02:00", end: "2026-10-21T01:00:00+02:00" };
    expect(daySpanOf(ev, "2026-10-20")).toEqual({ startMin: 1380, endMin: 1440 });
    expect(daySpanOf(ev, "2026-10-21")).toEqual({ startMin: 0, endMin: 60 });
    expect(daySpanOf(ev, "2026-10-22")).toBe(null);
  });

  it("gibt Terminen ohne Dauer eine Mindesthöhe", () => {
    const ev = { start: "2026-10-20T09:00:00+02:00", end: "2026-10-20T09:00:00+02:00" };
    expect(daySpanOf(ev, "2026-10-20")).toEqual({ startMin: 540, endMin: 570 });
  });

  it("legt überschneidende Blöcke nebeneinander", () => {
    const laid = assignLanes([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 560, endMin: 620 },
      { id: "c", startMin: 700, endMin: 730 },
    ]);
    expect(laid.map((b) => `${b.id}:${b.lane}`)).toEqual(["a:0", "b:1", "c:0"]);
    expect(laid.every((b) => b.lanes === 2)).toBe(true);
  });

  it("erweitert den Stundenbereich auf die vorhandenen Termine", () => {
    expect(hourRange([])).toEqual({ from: 8, to: 18 });
    expect(hourRange([{ startMin: 360, endMin: 1300 }])).toEqual({ from: 6, to: 22 });
    expect(hourRange([{ startMin: 0, endMin: 1440 }])).toEqual({ from: 0, to: 24 });
  });
});
