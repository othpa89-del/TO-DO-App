import { describe, it, expect, beforeEach } from "vitest";
import { isoDay } from "../dates.js";
import { sanitizeHtml } from "../meetingExport.js";
import { setLang } from "../i18n.js";

beforeEach(() => setLang("de"));

describe("isoDay – lokaler Kalendertag statt UTC", () => {
  it("nimmt die lokalen Datumsteile (kein UTC-Versatz)", () => {
    const d = new Date(2026, 6, 28, 0, 30); // 28.07.2026, 00:30 lokal
    expect(isoDay(d)).toBe("2026-07-28");   // toISOString() ergäbe hier den Vortag
  });
  it("füllt Monat und Tag zweistellig auf", () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("später Abend bleibt derselbe Tag", () => {
    expect(isoDay(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("sanitizeHtml – Allowlist statt Regex-Denylist", () => {
  it("erhält erlaubte Formatierung", () => {
    const out = sanitizeHtml("<p>Hallo <b>Welt</b><br><ul><li>Punkt</li></ul></p>");
    expect(out).toContain("<b>Welt</b>");
    expect(out).toContain("<li>Punkt</li>");
  });
  it("entfernt script-Elemente", () => {
    expect(sanitizeHtml('<div>ok<script>alert(1)</script></div>')).not.toContain("alert(1)");
  });
  it("blockt <svg/onload=…> (frühere Regex-Lücke)", () => {
    const out = sanitizeHtml('<svg/onload=alert(1)>');
    expect(out.toLowerCase()).not.toContain("onload");
    expect(out.toLowerCase()).not.toContain("<svg");
  });
  it("blockt href=javascript: ohne Anführungszeichen (frühere Regex-Lücke)", () => {
    const out = sanitizeHtml("<a href=javascript:alert(1)>x</a>");
    expect(out.toLowerCase()).not.toContain("javascript:");
  });
  it("entfernt Event-Handler-Attribute", () => {
    const out = sanitizeHtml('<div onclick="alert(1)" onmouseover=alert(2)>x</div>');
    expect(out.toLowerCase()).not.toContain("onclick");
    expect(out.toLowerCase()).not.toContain("onmouseover");
  });
  it("erlaubt normale Links", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
  });
  it("behält Checkboxen der Mitschrift", () => {
    expect(sanitizeHtml('<input type="checkbox" checked>')).toContain("checkbox");
  });
  it("leere Eingabe bleibt leer", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});
