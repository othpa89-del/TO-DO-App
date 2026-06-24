// ===========================================================================
//  EventEditor.jsx – Termin erstellen / bearbeiten / ansehen
// ===========================================================================
import React, { useState, useMemo } from "react";
import {
  PRIORITIES, RECUR_FREQS, REMINDER_OPTIONS, WEEKDAYS,
  findConflicts, googleMapsLink, appleMapsLink, googleCalendarLink, uid,
} from "./data.js";
import { Modal, Field, inputStyle, Btn, Dot } from "./components.jsx";

const MAX_FILE = 800 * 1024; // 800 KB pro Anhang (Cloud-Sync)

export function EventEditor({ t, ctx, draft, onSave, onDelete, onClose, canEdit, isNew }) {
  const [f, setF] = useState(draft);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setRec = (k, v) => setF((p) => ({ ...p, recurrence: { ...(p.recurrence || {}), [k]: v } }));

  const activeTypes = ctx.types.filter((x) => x.active || x.id === f.typeId);
  const activeAreas = ctx.areas.filter((x) => x.active || x.id === f.areaId);

  const conflicts = useMemo(() => {
    if (!f.date || !f.start || !f.end) return [];
    return findConflicts(f, ctx.events);
  }, [f.date, f.start, f.end, f.id, ctx.events]);

  const rec = f.recurrence || { freq: "none" };
  const readOnly = !canEdit;

  function validate() {
    if (!f.title.trim()) return "Bitte einen Titel eingeben.";
    if (!f.date) return "Bitte ein Datum wählen.";
    if (!f.start || !f.end) return "Bitte Start- und Endzeit angeben.";
    if (f.end <= f.start) return "Die Endzeit muss nach der Startzeit liegen.";
    if (!f.creatorId) return "Bitte einen Ersteller wählen.";
    if (!f.areaId) return "Bitte einen Bereich wählen.";
    if (!f.priority) return "Bitte eine Priorität wählen.";
    if (!f.typeId) return "Bitte eine Terminart wählen.";
    return null;
  }

  function trySave() {
    const err = validate();
    if (err) { ctx.flash(err, "error"); return; }
    if (conflicts.length > 0 && !confirmConflict) { setConfirmConflict(true); return; }
    onSave(f);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const next = [...(f.attachments || [])];
    for (const file of files) {
      if (file.size > MAX_FILE) { ctx.flash(`„${file.name}" ist größer als 800 KB und wurde übersprungen.`, "warn"); continue; }
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      next.push({ id: uid("att"), kind: "file", name: file.name, mime: file.type, dataUrl });
    }
    set("attachments", next);
  }
  function addLinkAttachment() {
    const url = (f.link || "").trim();
    if (!url) return;
    set("attachments", [...(f.attachments || []), { id: uid("att"), kind: "link", name: url, url }]);
    set("link", "");
  }
  function removeAtt(id) { set("attachments", (f.attachments || []).filter((a) => a.id !== id)); }

  const sel = inputStyle(t);

  return (
    <Modal t={t} wide title={isNew ? "Neuer Termin" : readOnly ? "Termin (gesperrt)" : "Termin bearbeiten"} onClose={onClose}
      footer={
        <>
          {!isNew && canEdit && <Btn t={t} kind="danger" onClick={() => onDelete(f)} style={{ marginRight: "auto" }}>Löschen</Btn>}
          <Btn t={t} kind="ghost" onClick={onClose}>Schließen</Btn>
          {canEdit && <Btn t={t} kind="primary" onClick={trySave}>{confirmConflict ? "Trotzdem speichern" : "Speichern"}</Btn>}
        </>
      }>

      {readOnly && (
        <div style={{ background: "#FB8C0022", border: "1px solid #FB8C00", color: t.text, padding: "8px 11px", borderRadius: 9, fontSize: 13, marginBottom: 14 }}>
          🔒 Dieser Termin ist gesperrt. Nur der Ersteller oder ein Administrator kann ihn ändern.
        </div>
      )}

      {/* Schnellanlage-Vorlagen nur bei neuem Termin */}
      {isNew && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, marginBottom: 6 }}>Schnellanlage</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ctx.quickTemplates.map((q) => {
              const type = ctx.typeById(q.typeId);
              return (
                <button key={q.id} onClick={() => setF((p) => ({
                  ...p, typeId: q.typeId, areaId: q.areaId, priority: q.priority,
                  title: p.title || q.label,
                }))} style={{
                  display: "flex", alignItems: "center", gap: 5, background: t.chip, color: t.text,
                  border: `1px solid ${t.borderSoft}`, borderRadius: 20, padding: "6px 11px",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{type ? type.icon : "📌"} {q.label}</button>
              );
            })}
          </div>
        </div>
      )}

      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, opacity: readOnly ? 0.85 : 1 }}>
        <Field t={t} label="Titel" required>
          <input style={sel} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. Flight VIE–FRA" />
        </Field>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <Field t={t} label="Datum" required>
              <input type="date" style={sel} value={f.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <Field t={t} label="Start" required>
              <input type="time" style={sel} value={f.start} onChange={(e) => set("start", e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <Field t={t} label="Ende" required>
              <input type="time" style={sel} value={f.end} onChange={(e) => set("end", e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Konfliktwarnung */}
        {conflicts.length > 0 && (
          <div style={{ background: "#E5393522", border: "1px solid #E53935", borderRadius: 9, padding: "9px 12px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: "#E53935", fontSize: 13, marginBottom: 4 }}>⚠️ Terminüberschneidung erkannt</div>
            {conflicts.slice(0, 4).map((c) => (
              <div key={c.id} style={{ fontSize: 12.5, color: t.text }}>• {c.start}–{c.end} {c.title}</div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <Field t={t} label="Ersteller" required>
              <select style={sel} value={f.creatorId} onChange={(e) => set("creatorId", e.target.value)}>
                <option value="">– bitte wählen –</option>
                {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <Field t={t} label="Bereich / Firma" required>
              <select style={sel} value={f.areaId} onChange={(e) => set("areaId", e.target.value)}>
                <option value="">– bitte wählen –</option>
                {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <Field t={t} label="Priorität" required>
              <select style={sel} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="">– bitte wählen –</option>
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.dot} {p.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <Field t={t} label="Terminart" required>
              <select style={sel} value={f.typeId} onChange={(e) => set("typeId", e.target.value)}>
                <option value="">– bitte wählen –</option>
                {activeTypes.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Teilnehmer – wer muss dabei sein */}
        <Field t={t} label="Teilnehmer – wer muss dabei sein?" hint="Markierte Personen müssen beim Termin dabei sein; erscheinen als farbige Punkte am Termin.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ctx.users.map((u) => {
              const on = (f.participants || []).includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => {
                  const s = new Set(f.participants || []);
                  s.has(u.id) ? s.delete(u.id) : s.add(u.id);
                  set("participants", Array.from(s));
                }} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 22,
                  cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                  background: on ? u.color : t.chip, color: on ? "#fff" : t.text,
                  border: `1.5px solid ${on ? u.color : t.border}`,
                }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: u.color, border: "1.5px solid rgba(255,255,255,.9)" }} />
                  {u.name}{on ? " ✓" : ""}
                </button>
              );
            })}
            {ctx.users.length > 1 && (() => {
              const all = ctx.users.every((u) => (f.participants || []).includes(u.id));
              return (
                <button type="button" onClick={() => set("participants", all ? [] : ctx.users.map((u) => u.id))} style={{
                  padding: "7px 12px", borderRadius: 22, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: 800, background: t.surface2, color: t.text, border: `1.5px solid ${t.borderSoft}`,
                }}>{all ? "Keine" : "Alle / Beide"}</button>
              );
            })()}
          </div>
        </Field>

        {/* Änderbarkeit */}
        <Field t={t} label="Änderbarkeit">
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: t.text, cursor: "pointer" }}>
            <input type="checkbox" checked={!!f.locked} onChange={(e) => set("locked", e.target.checked)}
              style={{ width: 18, height: 18, accentColor: t.accent }} />
            🔒 Gesperrt – nur Ersteller oder Administrator dürfen ändern/löschen
          </label>
        </Field>

        {/* Wiederholung */}
        <Field t={t} label="Wiederholung">
          <select style={sel} value={rec.freq || "none"} onChange={(e) => setRec("freq", e.target.value)}>
            {RECUR_FREQS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {rec.freq && rec.freq !== "none" && (
          <div style={{ background: t.surface2, border: `1px solid ${t.borderSoft}`, borderRadius: 9, padding: 11, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 100px" }}>
                <Field t={t} label="Alle">
                  <input type="number" min={1} style={sel} value={rec.interval || 1} onChange={(e) => setRec("interval", Number(e.target.value))} />
                </Field>
              </div>
              {rec.freq === "custom" && (
                <div style={{ flex: "1 1 120px" }}>
                  <Field t={t} label="Einheit">
                    <select style={sel} value={rec.unit || "day"} onChange={(e) => setRec("unit", e.target.value)}>
                      <option value="">– bitte wählen –</option>
                      <option value="day">Tage</option>
                      <option value="week">Wochen</option>
                      <option value="month">Monate</option>
                      <option value="year">Jahre</option>
                    </select>
                  </Field>
                </div>
              )}
              <div style={{ flex: "1 1 140px" }}>
                <Field t={t} label="Bis (optional)">
                  <input type="date" style={sel} value={rec.until || ""} onChange={(e) => setRec("until", e.target.value)} />
                </Field>
              </div>
            </div>
            {(rec.freq === "weekly" || (rec.freq === "custom" && rec.unit === "week")) && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, marginBottom: 5 }}>Wochentage</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {WEEKDAYS.map((w, i) => {
                    const on = (rec.weekdays || []).includes(i);
                    return (
                      <button key={w} onClick={() => {
                        const wd = new Set(rec.weekdays || []);
                        on ? wd.delete(i) : wd.add(i);
                        setRec("weekdays", Array.from(wd));
                      }} style={{
                        width: 36, height: 32, borderRadius: 7, border: `1px solid ${on ? t.accent : t.border}`,
                        background: on ? t.accent : t.input, color: on ? "#fff" : t.text, fontSize: 12,
                        fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>{w}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optionale Felder */}
        <div style={{ borderTop: `1px solid ${t.border}`, margin: "6px 0 12px", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.muted, marginBottom: 10, letterSpacing: ".03em" }}>OPTIONAL</div>

          <Field t={t} label="Beschreibung">
            <textarea style={{ ...sel, minHeight: 60, resize: "vertical" }} value={f.description || ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <Field t={t} label="Ort">
                <input style={sel} value={f.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="z. B. Büro, Terminal 3" />
              </Field>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <Field t={t} label="Adresse (für Navigation)">
                <input style={sel} value={f.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Straße, PLZ Ort" />
              </Field>
            </div>
          </div>
          {f.address && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <a href={googleMapsLink(f.address)} target="_blank" rel="noreferrer" style={navLink(t)}>🗺️ Google Maps</a>
              <a href={appleMapsLink(f.address)} target="_blank" rel="noreferrer" style={navLink(t)}>🍎 Apple Maps</a>
            </div>
          )}

          <Field t={t} label="Notizen">
            <textarea style={{ ...sel, minHeight: 48, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          <Field t={t} label="Erinnerung">
            <select style={sel} value={f.reminder || "none"} onChange={(e) => set("reminder", e.target.value)}>
              {REMINDER_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>

          {/* Anhänge & Links */}
          <Field t={t} label="Anhänge & Links" hint="PDF, Bilder, Word, Excel (max. 800 KB) oder Web-Link.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input style={{ ...sel, flex: "1 1 160px" }} value={f.link || ""} onChange={(e) => set("link", e.target.value)}
                placeholder="https://… (Link)" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLinkAttachment())} />
              <Btn t={t} kind="soft" onClick={addLinkAttachment} type="button">Link +</Btn>
              <label style={{ ...navLink(t), cursor: "pointer" }}>
                📎 Datei
                <input type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>
            {(f.attachments || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {f.attachments.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: t.surface2, border: `1px solid ${t.borderSoft}`, borderRadius: 8, padding: "6px 9px" }}>
                    <span>{a.kind === "link" ? "🔗" : "📎"}</span>
                    <a href={a.kind === "link" ? a.url : a.dataUrl} target="_blank" rel="noreferrer" download={a.kind === "file" ? a.name : undefined}
                      style={{ flex: 1, fontSize: 13, color: t.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</a>
                    {!readOnly && <button onClick={() => removeAtt(a.id)} style={{ background: "none", border: "none", color: t.faint, cursor: "pointer", fontSize: 16 }}>×</button>}
                  </div>
                ))}
              </div>
            )}
          </Field>

          {!isNew && (
            <a href={googleCalendarLink(f)} target="_blank" rel="noreferrer" style={{ ...navLink(t), display: "inline-block" }}>📅 Zu Google Kalender hinzufügen</a>
          )}
        </div>
      </fieldset>
    </Modal>
  );
}

function navLink(t) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
    background: t.chip, color: t.text, border: `1px solid ${t.borderSoft}`,
    borderRadius: 8, padding: "8px 11px", fontSize: 13, fontWeight: 700,
  };
}
