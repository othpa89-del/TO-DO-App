import { L, getLang } from "./i18n.js";

// ===========================================================================
//  Export-/Format-Schicht für Meeting Minutes (aus Meetings.jsx ausgelagert)
// ===========================================================================
// Nur die von den Export-Funktionen benötigten Farbwerte (Werte identisch zur
// UI-Palette in Meetings.jsx – nicht ändern!)
const C = {
  burgundy: "#AF1E65", burgundyDark: "#871C54", ink: "#1f2937", grey: "#4b5563",
};

// Anzeige-Labels für gespeicherte Status-Werte (gespeicherte value bleibt deutsch).
export const statusLabel = (s) => ({
  Geplant: L("Geplant", "Planned"),
  Laufend: L("Laufend", "In progress"),
  Abgeschlossen: L("Abgeschlossen", "Completed"),
  Archiviert: L("Archiviert", "Archived"),
}[s] || s);
export const decisionStatusLabel = (s) => ({
  Offen: L("Offen", "Open"),
  Beschlossen: L("Beschlossen", "Decided"),
  Umgesetzt: L("Umgesetzt", "Implemented"),
  Verworfen: L("Verworfen", "Rejected"),
}[s] || s);

export const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export function downloadFile(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export function htmlToPlain(html) {
  if (!html) return "";
  let s = html
    .replace(/<\/(div|p|h[1-6])>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n• ").replace(/<\/li>/gi, "")
    .replace(/<input[^>]*type=["']?checkbox["']?[^>]*checked[^>]*>/gi, "[x] ")
    .replace(/<input[^>]*type=["']?checkbox["']?[^>]*>/gi, "[ ] ")
    .replace(/<[^>]+>/g, "");
  const ta = document.createElement("textarea"); ta.innerHTML = s;
  return ta.value.replace(/\n{3,}/g, "\n\n").trim();
}
// Entfernt potenziell gefährliches HTML vor dem Export/Druck (Self-XSS vermeiden)
export function sanitizeHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed|link|meta|style)[\s\S]*?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "").replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

// ===========================================================================
//  Export-Helfer
// ===========================================================================
export function meetingMetaRows(m) {
  return [
    [L("Projekt", "Project"), m.project], [L("Kategorie", "Category"), m.category], [L("Typ", "Type"), m.type], [L("Status", "Status"), statusLabel(m.status)],
    [L("Datum", "Date"), fmtDay(m.date)], [L("Zeit", "Time"), [m.start, m.end].filter(Boolean).join(" – ")],
    [L("Ort", "Location"), m.location], [L("Online", "Online"), m.onlineLink],
    [L("Organisator", "Organizer"), m.organizer], [L("Protokollführer", "Minute taker"), m.recorder],
  ].filter((r) => r[1]);
}

// Teilnehmer-Schnappschüsse werden beim Hinzufügen gespeichert. Wird die
// Funktion/Firma einer Person erst SPÄTER im Kontakt ergänzt, fehlt sie im
// alten Schnappschuss. Vor dem Export füllen wir fehlende Felder aus der
// aktuellen Kontaktliste nach (per id, ersatzweise per Name).
export function enrichMeeting(m, persons = []) {
  if (!m) return m;
  const byId = {}, byName = {};
  persons.forEach((p) => { byId[p.id] = p; byName[(p.name || "").toLowerCase()] = p; });
  const fill = (p) => {
    const src = byId[p.id] || byName[(p.name || "").toLowerCase()];
    if (!src) return p;
    // Aktuelle Kontaktdaten haben Vorrang (z. B. nach Umbenennen), Schnappschuss
    // nur als Rückfall – so ist der Export immer auf dem neuesten Stand.
    return {
      ...p,
      name: src.name || p.name,
      company: src.company || p.company || "",
      role: src.role || p.role || "",
      phone: src.phone || p.phone || "",
      email: src.email || p.email || "",
    };
  };
  return { ...m, participants: (m.participants || []).map(fill), absentees: (m.absentees || []).map(fill) };
}
export function meetingToMarkdown(m) {
  const LINES = [];
  LINES.push(`# ${L("Besprechungsprotokoll", "Meeting minutes")} – ${m.title || ""}`.trim(), "");
  meetingMetaRows(m).forEach(([k, v]) => LINES.push(`**${k}:** ${v}`));
  LINES.push("");
  if ((m.participants || []).length) { LINES.push(`## ${L("Teilnehmer", "Participants")}`); m.participants.forEach((p) => LINES.push(`- ${p.name}${p.company ? ` (${p.company})` : ""}${p.role ? `, ${p.role}` : ""}`)); LINES.push(""); }
  if ((m.absentees || []).length) { LINES.push(`## ${L("Abwesend", "Absent")}`); m.absentees.forEach((p) => LINES.push(`- ${p.name}`)); LINES.push(""); }
  if ((m.agenda || []).length) {
    LINES.push(`## ${L("Agenda & Mitschrift", "Agenda & minutes")}`);
    m.agenda.forEach((a, i) => {
      LINES.push(`### ${i + 1}. ${a.title || ""}${a.done ? " ✓" : ""}`);
      if (a.desc) LINES.push(a.desc);
      const notes = htmlToPlain(a.notesHtml); if (notes) LINES.push("", notes);
      [[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]]
        .filter((x) => x[1]).forEach(([k, v]) => LINES.push(`- **${k}:** ${v}`));
      LINES.push("");
    });
  }
  if ((m.decisions || []).length) { LINES.push(`## ${L("Entscheidungen", "Decisions")}`); m.decisions.forEach((d) => LINES.push(`- **${d.title}** (${decisionStatusLabel(d.status)}${d.owner ? ", " + d.owner : ""}${d.date ? ", " + fmtDay(d.date) : ""})${d.desc ? " – " + d.desc : ""}`)); LINES.push(""); }
  if ((m.actionItems || []).length) { LINES.push(`## ${L("Aufgaben", "Tasks")}`); m.actionItems.forEach((a) => LINES.push(`- [ ] ${a.text}`)); LINES.push(""); }
  if (m.openPoints) { LINES.push(`## ${L("Offene Punkte", "Open points")}`, m.openPoints, ""); }
  if (m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) LINES.push(`## ${L("Nächstes Meeting", "Next meeting")}`, `${fmtDay(m.nextMeeting.date)} ${m.nextMeeting.note || ""}`.trim(), "");
  if ((m.images || []).length) { LINES.push(`## ${L("Bilder", "Images")}`); m.images.forEach((im) => LINES.push(`- ${im.name || L("Bild", "Image")}`)); LINES.push(""); }
  if ((m.attachments || []).length) { LINES.push(`## ${L("Anlagen", "Attachments")}`); m.attachments.forEach((f) => LINES.push(`- ${f.name}`)); LINES.push(""); }
  if ((m.voice || []).length) { LINES.push(`## ${L("Sprachmemos", "Voice memos")}`); m.voice.forEach((v) => LINES.push(`- ${v.name}`)); LINES.push(""); }
  LINES.push("", "© Copyright by Patrick Thorn");
  return LINES.join("\n");
}
export function meetingToText(m) { return meetingToMarkdown(m).replace(/[#*>`]/g, "").replace(/\n{3,}/g, "\n\n").trim(); }

export function meetingHTML(m, forWord) {
  const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const meta = meetingMetaRows(m).map(([k, v]) => {
    const isLink = /^https?:\/\//i.test(v || "");
    const cell = isLink ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v);
    return `<tr><td class="k">${esc(k)}</td><td>${cell}</td></tr>`;
  }).join("");
  const parts = (m.participants || []).map((p) => `<li><b>${esc(p.name)}</b>${p.company ? " – " + esc(p.company) : ""}${p.role ? ", " + esc(p.role) : ""}${p.phone ? " · " + esc(p.phone) : ""}${p.email ? " · " + esc(p.email) : ""}</li>`).join("");
  const absent = (m.absentees || []).map((p) => `<li>${esc(p.name)}</li>`).join("");
  const agenda = (m.agenda || []).map((a, i) => `
    <div class="ag"><h3>${i + 1}. ${esc(a.title)}${a.done ? " ✓" : ""}</h3>
    ${a.desc ? `<p class="muted">${esc(a.desc)}</p>` : ""}
    ${a.notesHtml ? `<div class="notes">${sanitizeHtml(a.notesHtml)}</div>` : ""}
    ${[[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]].filter((x) => x[1]).map(([k, v]) => `<p><b>${k}:</b> ${esc(v)}</p>`).join("")}
    </div>`).join("");
  const decisions = (m.decisions || []).map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.owner)}</td><td>${esc(fmtDay(d.date))}</td><td>${esc(decisionStatusLabel(d.status))}</td></tr>`).join("");
  const actions = (m.actionItems || []).map((a) => `<li>☐ ${esc(a.text)}</li>`).join("");
  const imgs = (m.images || []).map((im) => `<a href="${im.dataUrl}" download="${esc(im.name) || "bild"}"><img class="ph" src="${im.dataUrl}" alt="${esc(im.name)}" /></a>`).join("");
  const att = (m.attachments || []).map((f) => `<li><a href="${f.dataUrl}" download="${esc(f.name) || "datei"}">${esc(f.name)}</a></li>`).join("");
  const voc = (m.voice || []).map((v) => `<li>${esc(v.name)}</li>`).join("");
  const style = `
    body{font-family:Calibri,Candara,"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#1f2937;margin:0;padding:${forWord ? "28px 32px" : "14mm 16mm"};}
    *{font-family:inherit;}
    .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid ${C.burgundy};padding-bottom:12px;margin-bottom:16px;}
    .logo{width:40px;height:40px;color:${C.burgundy};}
    .hd h1{font-size:22px;margin:0;color:${C.burgundyDark};letter-spacing:.02em;}
    .hd .sub{font-size:12px;color:#6b7280;}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:${C.burgundy};border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:18px 0 8px;}
    h3{font-size:13px;margin:10px 0 4px;color:${C.ink};}
    table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0;}
    td,th{border:1px solid #e5e7eb;padding:5px 8px;text-align:left;vertical-align:top;}
    td.k{background:#f8f5f7;font-weight:700;width:160px;color:${C.grey};}
    ul{margin:4px 0;padding-left:18px;font-size:12px;}
    p{font-size:12px;margin:4px 0;} .muted{color:#6b7280;}
    .notes{font-size:12px;border-left:3px solid #eee;padding-left:10px;margin:4px 0;}
    .mm-tbl td{border:1px solid #cbd5e1;}
    .ph{max-width:46%;margin:6px 6px 0 0;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;}
    .sign{display:flex;gap:40px;margin-top:36px;} .sign div{flex:1;border-top:1px solid #9ca3af;padding-top:5px;font-size:11px;color:#6b7280;text-align:center;}
    .gen{margin-top:20px;text-align:center;font-size:9px;color:#b9bec7;}
    .cpr{margin-top:6px;text-align:center;font-size:9px;color:#9ca3af;}
    @page{margin:${forWord ? "14mm" : "0"};}
    @media print{@page{margin:${forWord ? "14mm" : "0"};}}
  `;
  const planeSvg = `<svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
  return `<!doctype html><html lang="${getLang() === "en" ? "en" : "de"}"><head><meta charset="utf-8"><title>${L("Protokoll", "Minutes")} ${esc(m.title)}</title>
<style>${style}</style></head>
    <body>
    <div class="hd">${planeSvg}<div><h1>${L("Besprechungsprotokoll", "Meeting minutes")}</h1><div class="sub">${esc(m.title)} · ${esc(fmtDay(m.date))}</div></div></div>
    <h2>${L("Eckdaten", "Key data")}</h2><table>${meta}</table>
    ${parts ? `<h2>${L("Teilnehmer", "Participants")}</h2><ul>${parts}</ul>` : ""}
    ${absent ? `<h2>${L("Abwesend", "Absent")}</h2><ul>${absent}</ul>` : ""}
    ${agenda ? `<h2>${L("Agenda & Mitschrift", "Agenda & minutes")}</h2>${agenda}` : ""}
    ${decisions ? `<h2>${L("Entscheidungen", "Decisions")}</h2><table><tr><th>${L("Titel", "Title")}</th><th>${L("Verantwortlich", "Responsible")}</th><th>${L("Datum", "Date")}</th><th>${L("Status", "Status")}</th></tr>${decisions}</table>` : ""}
    ${actions ? `<h2>${L("Aufgaben", "Tasks")}</h2><ul>${actions}</ul>` : ""}
    ${m.openPoints ? `<h2>${L("Offene Punkte", "Open points")}</h2><p>${esc(m.openPoints)}</p>` : ""}
    ${(m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) ? `<h2>${L("Nächstes Meeting", "Next meeting")}</h2><p>${esc(fmtDay(m.nextMeeting.date))} ${esc(m.nextMeeting.note)}</p>` : ""}
    ${imgs ? `<h2>${L("Bilder", "Images")}</h2>${imgs}` : ""}
    ${att ? `<h2>${L("Anlagen", "Attachments")}</h2><ul>${att}</ul>` : ""}
    ${voc ? `<h2>${L("Sprachmemos", "Voice memos")}</h2><ul>${voc}</ul>` : ""}
    <div class="sign"><div>${L("Organisator", "Organizer")}${m.organizer ? " – " + esc(m.organizer) : ""}</div><div>${L("Protokollführer", "Minute taker")}${m.recorder ? " – " + esc(m.recorder) : ""}</div></div>
    <div class="gen">${L("Erstellt am", "Created on")} ${esc(new Date().toLocaleString(getLang() === "en" ? "en-GB" : "de-DE"))}</div>
    <div class="cpr">© Copyright by Patrick Thorn</div>
    </body></html>`;
}
export function printMeeting(m) {
  const w = window.open("", "_blank");
  if (!w) { alert(L("Bitte Pop-ups erlauben, um zu drucken.", "Please allow pop-ups to print.")); return; }
  w.document.write(meetingHTML(m));
  w.document.close(); w.focus();
  // Erst drucken, wenn die Schrift (Mulish) wirklich geladen ist – sonst werden
  // einzelne Zeichen in einer Ersatzschrift gedruckt (I/l sehen dann anders aus).
  let printed = false;
  const go = () => { if (printed) return; printed = true; try { w.print(); } catch {} };
  try {
    if (w.document.fonts && w.document.fonts.ready) {
      w.document.fonts.ready.then(() => setTimeout(go, 150));
      setTimeout(go, 2500); // Fallback, falls fonts.ready nicht auslöst
    } else setTimeout(go, 800);
  } catch { setTimeout(go, 800); }
}
export function exportWord(m) {
  const html = meetingHTML(m, true);
  downloadFile("﻿" + html, `${(m.date || new Date().toISOString().slice(0, 10)).replace(/-/g, "")}_${L("Protokoll", "Minutes")}_${(m.title || "Meeting").replace(/\s+/g, "_")}.doc`, "application/msword");
}

// Kompaktes, inline-formatiertes HTML-Fragment fürs Einfügen in E-Mails
export function meetingToEmailHtml(m) {
  const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const P = "margin:0 0 7px;font-size:13px;color:#1f2937;";
  const H = "margin:14px 0 4px;font-size:12px;color:#871C54;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;";
  const o = [];
  o.push(`<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:13px;line-height:1.5;">`);
  o.push(`<div style="font-size:18px;font-weight:bold;color:#871C54;">${L("Besprechungsprotokoll", "Meeting minutes")}</div>`);
  if (m.title) o.push(`<div style="font-size:14px;font-weight:bold;margin-top:2px;">${esc(m.title)}</div>`);
  o.push(`<div style="color:#6b7280;font-size:12px;margin-bottom:10px;">${esc(fmtDay(m.date))}${m.start ? " · " + esc(m.start) + (m.end ? "–" + esc(m.end) : "") : ""}${m.type ? " · " + esc(m.type) : ""}${m.status ? " · " + esc(statusLabel(m.status)) : ""}</div>`);
  const extra = meetingMetaRows(m).filter(([k]) => ![L("Datum", "Date"), L("Typ", "Type"), L("Status", "Status"), L("Zeit", "Time")].includes(k));
  if (extra.length) o.push(extra.map(([k, v]) => `<div style="${P}"><b>${esc(k)}:</b> ${esc(v)}</div>`).join(""));
  if ((m.participants || []).length) o.push(`<div style="${H}">${L("Teilnehmer", "Participants")}</div><div style="${P}">${m.participants.map((p) => esc(p.name) + (p.company ? ` (${esc(p.company)})` : "")).join(", ")}</div>`);
  if ((m.absentees || []).length) o.push(`<div style="${H}">${L("Abwesend", "Absent")}</div><div style="${P}">${m.absentees.map((p) => esc(p.name)).join(", ")}</div>`);
  if ((m.agenda || []).length) {
    o.push(`<div style="${H}">${L("Agenda &amp; Mitschrift", "Agenda &amp; minutes")}</div>`);
    m.agenda.forEach((a, i) => {
      o.push(`<div style="margin:0 0 8px;"><div style="font-weight:bold;">${i + 1}. ${esc(a.title)}${a.done ? " ✓" : ""}</div>`);
      if (a.desc) o.push(`<div style="color:#6b7280;font-size:12px;">${esc(a.desc)}</div>`);
      if (a.notesHtml) o.push(`<div style="font-size:13px;margin:3px 0;">${sanitizeHtml(a.notesHtml)}</div>`);
      [[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]]
        .filter((x) => x[1]).forEach(([k, v]) => o.push(`<div style="${P}"><b>${esc(k)}:</b> ${esc(v)}</div>`));
      o.push(`</div>`);
    });
  }
  if ((m.decisions || []).length) { o.push(`<div style="${H}">${L("Entscheidungen", "Decisions")}</div>`); m.decisions.forEach((d) => o.push(`<div style="${P}">• <b>${esc(d.title)}</b> (${esc(decisionStatusLabel(d.status))}${d.owner ? ", " + esc(d.owner) : ""}${d.date ? ", " + esc(fmtDay(d.date)) : ""})${d.desc ? " – " + esc(d.desc) : ""}</div>`)); }
  if ((m.actionItems || []).length) { o.push(`<div style="${H}">${L("Aufgaben", "Tasks")}</div>`); m.actionItems.forEach((a) => o.push(`<div style="${P}">☐ ${esc(a.text)}</div>`)); }
  if (m.openPoints) o.push(`<div style="${H}">${L("Offene Punkte", "Open points")}</div><div style="${P}">${esc(m.openPoints).replace(/\n/g, "<br>")}</div>`);
  if (m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) o.push(`<div style="${H}">${L("Nächstes Meeting", "Next meeting")}</div><div style="${P}">${esc(fmtDay(m.nextMeeting.date))} ${esc(m.nextMeeting.note || "")}</div>`);
  if ((m.attachments || []).length) o.push(`<div style="${H}">${L("Anlagen", "Attachments")}</div><div style="${P}">${m.attachments.map((f) => esc(f.name)).join(", ")}</div>`);
  if ((m.voice || []).length) o.push(`<div style="${H}">${L("Sprachmemos", "Voice memos")}</div><div style="${P}">${m.voice.map((v) => esc(v.name)).join(", ")}</div>`);
  o.push(`<div style="margin-top:16px;color:#9ca3af;font-size:11px;">© Copyright by Patrick Thorn</div>`);
  o.push(`</div>`);
  return o.join("");
}

// Protokoll formatiert (HTML + Text) in die Zwischenablage legen
export async function copyMeetingToClipboard(m) {
  const html = meetingToEmailHtml(m);
  const text = meetingToText(m);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      return true;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea"); ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

// Mailprogramm mit Betreff + Text öffnen
export function emailMeeting(m) {
  const subject = `${L("Protokoll", "Minutes")}: ${m.title || L("Meeting", "Meeting")}${m.date ? " (" + fmtDay(m.date) + ")" : ""}`;
  const body = meetingToText(m);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
