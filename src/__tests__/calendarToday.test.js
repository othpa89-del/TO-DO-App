import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CalendarToday from "../CalendarToday.jsx";
import { dayKey, shiftDay } from "../calendar.js";

// Feste "Jetzt"-Zeit, damit heute und morgen berechenbar sind.
const NOW = Date.parse("2026-10-21T08:00:00+02:00");
const TODAY = "2026-10-21";
const TOMORROW = "2026-10-22";

const companyColor = (n) => (n === "Eurowings" ? "#AF1E65" : "#9AA0A6");

const ev = (o) => ({
  id: o.id, source: o.source || "ew", title: o.title, location: o.location || "",
  start: o.start, end: o.end, allDay: !!o.allDay, busy: o.busy !== false,
});

const render = (props) =>
  renderToStaticMarkup(h(CalendarToday, {
    cal: { configured: true, events: [] },
    companyColor, tasks: [], meetings: [],
    onPickTask: () => {}, onPickMeeting: () => {}, onOpenCalendar: () => {},
    ...props,
  }));

describe("CalendarToday", () => {
  afterEach(() => { vi.useRealTimers(); });

  const withNow = (fn) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try { return fn(); } finally { vi.useRealTimers(); }
  };

  it("zeigt nichts, solange der Sync nicht eingerichtet ist", () => {
    expect(render({ cal: { configured: false, events: [] } })).toBe("");
  });

  it("bestätigt die Bezugstage der Testdaten", () => {
    withNow(() => {
      expect(dayKey(Date.now())).toBe(TODAY);
      expect(shiftDay(TODAY, 1)).toBe(TOMORROW);
    });
  });

  it("listet Termine des Tages chronologisch, ganztägig zuerst, Aufgaben zuletzt", () => {
    const html = withNow(() => render({
      cal: {
        configured: true,
        events: [
          ev({ id: "b", title: "Spaetes Meeting", start: `${TODAY}T15:00:00+02:00`, end: `${TODAY}T16:00:00+02:00` }),
          ev({ id: "a", title: "Frueher Flug", start: `${TODAY}T07:00:00+02:00`, end: `${TODAY}T09:00:00+02:00` }),
          ev({ id: "g", title: "Ganztagstermin", start: `${TODAY}T00:00:00+02:00`, end: `${TOMORROW}T00:00:00+02:00`, allDay: true }),
        ],
      },
      tasks: [{ id: "t1", title: "Checkliste pruefen", due: TODAY, company: "Eurowings" }],
    }));
    const order = [...html.matchAll(/class="ct-title">([^<]+)/g)].map((m) => m[1].trim());
    expect(order).toEqual(["Ganztagstermin", "Frueher Flug", "Spaetes Meeting", "Checkliste pruefen"]);
  });

  it("nimmt eigene Meetings mit Uhrzeit wörtlich auf", () => {
    const html = withNow(() => render({
      meetings: [{ id: "m1", title: "Jour fixe", date: TODAY, start: "14:00", end: "15:00", location: "Raum B" }],
    }));
    expect(html).toContain(">14:00<");
    expect(html).toContain("Jour fixe");
    expect(html).toContain("Raum B");
  });

  it("macht Fremdtermine schreibgeschützt und eigene Einträge anklickbar", () => {
    const html = withNow(() => render({
      cal: { configured: true, events: [ev({ id: "s", title: "Fremd", start: `${TODAY}T09:00:00+02:00`, end: `${TODAY}T10:00:00+02:00` })] },
      tasks: [{ id: "t1", title: "Eigene", due: TODAY }],
    }));
    expect(html).toMatch(/<div class="ct-row"[^>]*role="note"/);
    expect(html).toMatch(/<button type="button" class="ct-row"/);
  });

  it("zeigt eine Vorschau auf morgen mit höchstens drei Terminen", () => {
    const html = withNow(() => render({
      cal: {
        configured: true,
        events: [1, 2, 3, 4].map((n) => ev({
          id: "t" + n, title: "Morgen " + n,
          start: `${TOMORROW}T0${5 + n}:00:00+02:00`, end: `${TOMORROW}T0${6 + n}:00:00+02:00`,
        })),
      },
    }));
    expect(html).toContain("Morgen</h3>");
    expect(html).toContain("Morgen 1");
    expect(html).toContain("Morgen 3");
    expect(html).not.toContain("Morgen 4");
  });

  it("listet Konflikte der nächsten 14 Tage und markiert beide Termine", () => {
    const html = withNow(() => render({
      cal: {
        configured: true,
        events: [
          ev({ id: "x", source: "ew", title: "EW Termin", start: `${TODAY}T09:00:00+02:00`, end: `${TODAY}T10:00:00+02:00` }),
          ev({ id: "y", source: "aaa", title: "AAA Termin", start: `${TODAY}T09:30:00+02:00`, end: `${TODAY}T10:30:00+02:00` }),
        ],
      },
    }));
    expect(html).toContain("Konflikte der nächsten 14 Tage");
    expect(html).toContain("EW Termin");
    expect(html).toContain("Aviation Academy Austria");
    // Beide Termine tragen die Markierung
    expect(html.match(/class="ct-row clash"/g)).toHaveLength(2);
  });

  it("meldet keinen Konflikt innerhalb derselben Quelle", () => {
    const html = withNow(() => render({
      cal: {
        configured: true,
        events: [
          ev({ id: "x", source: "ew", title: "A", start: `${TODAY}T09:00:00+02:00`, end: `${TODAY}T10:00:00+02:00` }),
          ev({ id: "y", source: "ew", title: "B", start: `${TODAY}T09:30:00+02:00`, end: `${TODAY}T10:30:00+02:00` }),
        ],
      },
    }));
    expect(html).not.toContain("Konflikte der nächsten 14 Tage");
    expect(html).not.toContain("ct-row clash");
  });

  it("sagt es, wenn heute nichts ansteht", () => {
    expect(withNow(() => render({}))).toContain("Heute steht nichts an.");
  });
});
