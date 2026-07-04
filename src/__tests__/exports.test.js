import { describe, it, expect, beforeEach } from "vitest";
import { setLang, L } from "../i18n.js";
import {
  fmtDay, enrichMeeting, meetingToMarkdown, meetingToText, meetingHTML, meetingToEmailHtml,
} from "../meetingExport.js";

// Minimales, gültiges Meeting für die Export-Tests
const baseMeeting = (over = {}) => ({
  id: "m1", title: "Boeing 737 CTC Übergabe", date: "2026-06-30",
  type: "Weekly", status: "Geplant", organizer: "Dennis Tatzel", recorder: "Patrick Thorn",
  participants: [], absentees: [], agenda: [], decisions: [], actionItems: [],
  attachments: [], images: [], voice: [],
  ...over,
});

beforeEach(() => setLang("de"));

describe("i18n", () => {
  it("L() liefert die passende Sprache", () => {
    setLang("de"); expect(L("Aufgaben", "Tasks")).toBe("Aufgaben");
    setLang("en"); expect(L("Aufgaben", "Tasks")).toBe("Tasks");
  });
});

describe("fmtDay", () => {
  it("führende Nullen im deutschen Datum", () => {
    expect(fmtDay("2026-06-30")).toBe("30.06.2026");
    expect(fmtDay("2026-07-04")).toBe("04.07.2026");
  });
  it("leer bleibt leer", () => {
    expect(fmtDay("")).toBe("");
  });
});

describe("enrichMeeting – Teilnehmer immer aktuell", () => {
  const persons = [
    { id: "p1", name: "Frank Oedinger", company: "Eurowings", role: "NPCT", phone: "", email: "f@ew.de" },
  ];

  it("umbenannter Kontakt (per id) erscheint mit neuem Namen", () => {
    const m = baseMeeting({ participants: [{ id: "p1", name: "Frank Ödinger", company: "", role: "" }] });
    const e = enrichMeeting(m, persons);
    expect(e.participants[0].name).toBe("Frank Oedinger");
    expect(e.participants[0].role).toBe("NPCT");
    expect(e.participants[0].company).toBe("Eurowings");
  });

  it("Abgleich per Name, wenn keine id passt", () => {
    const m = baseMeeting({ participants: [{ id: "alt", name: "frank oedinger", company: "", role: "" }] });
    const e = enrichMeeting(m, persons);
    expect(e.participants[0].role).toBe("NPCT");
  });

  it("unbekannte Teilnehmer bleiben unverändert", () => {
    const m = baseMeeting({ participants: [{ id: "x", name: "Gast", company: "Extern", role: "Berater" }] });
    const e = enrichMeeting(m, persons);
    expect(e.participants[0]).toMatchObject({ name: "Gast", company: "Extern", role: "Berater" });
  });
});

describe("meetingToMarkdown", () => {
  it("enthält Titel, Teilnehmer mit Firma/Rolle und Copyright", () => {
    const m = baseMeeting({
      participants: [{ id: "p1", name: "Ulf Westerhoff", company: "Eurowings", role: "CTC A320 EWG" }],
    });
    const md = meetingToMarkdown(m);
    expect(md).toContain("Besprechungsprotokoll");
    expect(md).toContain("Boeing 737 CTC Übergabe");
    expect(md).toContain("- Ulf Westerhoff (Eurowings), CTC A320 EWG");
    expect(md).toContain("© Copyright by Patrick Thorn");
  });

  it("leere Abschnitte werden weggelassen", () => {
    const md = meetingToMarkdown(baseMeeting());
    expect(md).not.toContain("## " + L("Entscheidungen", "Decisions"));
    expect(md).not.toContain("## " + L("Aufgaben", "Tasks"));
  });

  it("gefüllte Abschnitte erscheinen", () => {
    const m = baseMeeting({ actionItems: [{ id: "a1", text: "Protokoll versenden" }] });
    const md = meetingToMarkdown(m);
    expect(md).toContain("Protokoll versenden");
  });

  it("Englisch: Überschriften wechseln mit der Sprache", () => {
    setLang("en");
    const m = baseMeeting({ participants: [{ id: "p1", name: "Ulf" }] });
    expect(meetingToMarkdown(m)).toContain("## Participants");
  });
});

describe("meetingHTML (PDF/Druck/Word)", () => {
  it("escapet HTML im Titel (kein Self-XSS)", () => {
    const html = meetingHTML(baseMeeting({ title: '<script>alert(1)</script>' }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keine Web-Schrift, Calibri als Dokumentschrift (I/l-Glyphen-Fix)", () => {
    const html = meetingHTML(baseMeeting());
    expect(html).not.toContain("fonts.googleapis");
    expect(html).toContain("Calibri");
  });

  it("Anlagen-Abschnitt nur, wenn Anhänge existieren", () => {
    const ohne = meetingHTML(baseMeeting());
    expect(ohne).not.toContain(">" + L("Anlagen", "Attachments") + "<");
    const mit = meetingHTML(baseMeeting({ attachments: [{ id: "f1", name: "plan.pdf", dataUrl: "data:application/pdf;base64,AA==" }] }));
    expect(mit).toContain(L("Anlagen", "Attachments"));
    expect(mit).toContain("plan.pdf");
  });
});

describe("meetingToText / E-Mail", () => {
  it("Text-Export ist nicht leer und ohne Markdown-Zeichen", () => {
    const txt = meetingToText(baseMeeting({ actionItems: [{ id: "a", text: "Punkt A" }] }));
    expect(txt).toContain("Punkt A");
    expect(txt).not.toContain("##");
  });

  it("E-Mail-HTML enthält Kopf und Copyright", () => {
    const html = meetingToEmailHtml(baseMeeting());
    expect(html).toContain(L("Besprechungsprotokoll", "Meeting minutes"));
    expect(html).toContain("© Copyright by Patrick Thorn");
  });
});
