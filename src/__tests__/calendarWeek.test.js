import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CalendarWeek from "../CalendarWeek.jsx";
import { weekDays } from "../calendar.js";

const WEEK = weekDays("2026-10-21"); // Mo 19.10. bis So 25.10.2026
const TODAY = "2026-10-21";

const sync = (o) => ({
  key: o.key, kind: "sync", title: o.title, location: o.location || "",
  start: o.start, end: o.end, allDay: !!o.allDay,
  sourceLabel: o.sourceLabel || "Eurowings", color: "#AF1E65",
  editable: false, conflict: !!o.conflict,
});

const own = (o) => ({
  kind: "task", location: "", sourceLabel: "Aufgabe", color: "#1A4F8B",
  editable: true, ...o, allDay: o.allDay !== false,
});

const render = (items, extra = {}) =>
  renderToStaticMarkup(h(CalendarWeek, {
    days: WEEK, items, today: TODAY,
    onPick: () => {}, onShift: () => {}, onToday: () => {},
    ...extra,
  }));

describe("CalendarWeek", () => {
  it("zeigt sieben Tage mit Kalenderwoche", () => {
    const html = render([]);
    expect(html.match(/class="wk-head/g)).toHaveLength(7);
    expect(html).toContain("KW 43");
  });

  it("hebt den heutigen Tag hervor", () => {
    const html = render([]);
    expect(html.match(/wk-head today/g)).toHaveLength(1);
    expect(html).toContain("wk-col today");
  });

  it("setzt einen Termin an die richtige Stelle im Raster", () => {
    // 09:00–10:30 bei Rasterbeginn 08:00 und 46px je Stunde
    const html = render([sync({ key: "a", title: "Standardisierung", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T10:30:00+02:00" })]);
    expect(html).toContain("top:46px");
    expect(html).toContain("height:69px");
    expect(html).toContain("Standardisierung");
  });

  it("legt überschneidende Termine nebeneinander", () => {
    const html = render([
      sync({ key: "a", title: "A", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T10:00:00+02:00" }),
      sync({ key: "b", title: "B", start: "2026-10-21T09:30:00+02:00", end: "2026-10-21T10:30:00+02:00" }),
    ]);
    expect(html).toContain("left:0%");
    expect(html).toContain("left:50%");
  });

  it("stellt ganztägige Termine in eine eigene Zeile", () => {
    const html = render([sync({ key: "a", title: "Betriebsausflug", start: "2026-10-21T00:00:00+02:00", end: "2026-10-22T00:00:00+02:00", allDay: true })]);
    expect(html).toContain("wk-allday-lbl");
    expect(html).toContain("wk-chip");
    expect(html).toContain("Betriebsausflug");
  });

  it("lässt die Ganztagszeile weg, wenn es keine gibt", () => {
    expect(render([sync({ key: "a", title: "A", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T10:00:00+02:00" })]))
      .not.toContain("wk-allday-lbl");
  });

  it("macht Fremdtermine schreibgeschützt und eigene Einträge anklickbar", () => {
    const html = render([
      sync({ key: "s1", title: "Fremd", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T10:00:00+02:00" }),
      own({ key: "t1", title: "Eigene Aufgabe", day: "2026-10-21" }),
    ]);
    // Fremdtermin: div mit role="note", keine Schaltfläche
    expect(html).toMatch(/<div class="wk-block wk-e sync"[^>]*role="note"/);
    // Eigener Eintrag: Schaltfläche, gestrichelt gekennzeichnet
    expect(html).toMatch(/<button type="button" class="wk-chip wk-e own"/);
  });

  it("markiert einen Konflikt an dem Termin", () => {
    const html = render([sync({ key: "a", title: "A", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T10:00:00+02:00", conflict: true })]);
    expect(html).toContain("wk-e sync clash");
    expect(html).toContain("Konflikt");
  });

  it("erweitert das Raster auf frühe und späte Termine", () => {
    const html = render([sync({ key: "a", title: "Nacht", start: "2026-10-21T05:00:00+02:00", end: "2026-10-21T23:00:00+02:00" })]);
    expect(html).toContain("05:00");
    expect(html).toContain("22:00");
  });

  it("verteilt einen Termin über Mitternacht auf beide Tage", () => {
    const html = render([sync({ key: "a", title: "Nachtschicht", start: "2026-10-21T23:00:00+02:00", end: "2026-10-22T01:00:00+02:00" })]);
    expect(html.match(/wk-title">Nachtschicht/g)).toHaveLength(2);
  });

  it("zeigt eigene Meetings mit Uhrzeit im Raster", () => {
    const html = render([own({
      key: "m1", kind: "meeting", title: "Jour fixe", allDay: false,
      day: "2026-10-21", startMin: 14 * 60, endMin: 15 * 60, timeLabel: "14:00–15:00",
    })]);
    expect(html).toMatch(/<button type="button" class="wk-block wk-e own"/);
    expect(html).toContain("Jour fixe");
    // Wanduhrzeit gilt wörtlich, unabhängig von der Zeitzone des Geräts
    expect(html).toContain(">14:00<");
    expect(html).toContain("top:276px");
  });
});
