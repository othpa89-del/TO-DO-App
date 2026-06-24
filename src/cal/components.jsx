// ===========================================================================
//  components.jsx – wiederverwendbare UI-Bausteine
// ===========================================================================
import React from "react";
import { priorityById, timeToMin } from "./data.js";

// --- Modal -------------------------------------------------------------
export function Modal({ t, title, onClose, children, footer, wide }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,10,22,.62)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "max(16px, env(safe-area-inset-top)) 12px 24px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: wide ? 720 : 540, background: t.surface, color: t.text,
        borderRadius: 16, border: `1px solid ${t.border}`, boxShadow: t.shadow,
        marginTop: 24, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: t.navy, color: "#fff",
        }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} aria-label="Schließen" style={{
            background: "rgba(255,255,255,.12)", color: "#fff", border: "none",
            borderRadius: 8, width: 30, height: 30, fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {footer && (
          <div style={{
            padding: "12px 18px", borderTop: `1px solid ${t.border}`, background: t.surface2,
            display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap",
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// --- Formularfeld ------------------------------------------------------
export function Field({ t, label, children, required, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#E53935" }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: t.faint, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function inputStyle(t) {
  return {
    width: "100%", padding: "10px 12px", border: `1px solid ${t.border}`, borderRadius: 9,
    fontSize: 14, fontFamily: "inherit", background: t.input, color: t.text, outline: "none",
  };
}

export function Btn({ t, kind = "ghost", children, ...rest }) {
  const base = {
    padding: "10px 14px", borderRadius: 9, fontSize: 14, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", border: "1px solid transparent", lineHeight: 1.1,
  };
  const styles = {
    primary: { ...base, background: t.accent, color: "#fff" },
    navy: { ...base, background: t.navy, color: "#fff" },
    ghost: { ...base, background: "transparent", color: t.text, border: `1px solid ${t.border}` },
    danger: { ...base, background: "#E53935", color: "#fff" },
    soft: { ...base, background: t.chip, color: t.text, border: `1px solid ${t.borderSoft}` },
  };
  return <button {...rest} style={{ ...(styles[kind] || styles.ghost), ...(rest.style || {}) }}>{children}</button>;
}

// --- Segmented Control -------------------------------------------------
export function Segmented({ t, options, value, onChange, small }) {
  return (
    <div style={{
      display: "inline-flex", background: t.chip, borderRadius: 10, padding: 3,
      border: `1px solid ${t.borderSoft}`, flexWrap: "wrap", gap: 2,
    }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            padding: small ? "5px 9px" : "7px 13px", fontSize: small ? 12 : 13, fontWeight: 700,
            background: active ? t.accent : "transparent", color: active ? "#fff" : t.muted,
            whiteSpace: "nowrap",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// --- Toast -------------------------------------------------------------
export function Toast({ t, toast }) {
  if (!toast) return null;
  const bg = toast.kind === "error" ? "#E53935" : toast.kind === "warn" ? "#FB8C00" : t.navy;
  return (
    <div style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "calc(64px + env(safe-area-inset-bottom))", zIndex: 400,
      background: bg, color: "#fff", padding: "11px 18px", borderRadius: 12,
      fontSize: 14, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,.35)", maxWidth: "90vw",
    }}>{toast.msg}</div>
  );
}

// --- Farbpunkt ---------------------------------------------------------
export function Dot({ color, size = 10 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, flex: "none" }} />;
}

// --- Benutzer-Avatar (farbiger Kreis mit Initiale = wer hat es eingetragen) ---
export function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}
export function UserAvatar({ user, size = 22, title }) {
  if (!user) return null;
  return (
    <span title={title || `Erstellt von ${user.name}`} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%", background: user.color,
      color: "#fff", fontSize: Math.round(size * 0.46), fontWeight: 800,
      flex: "none", border: "1.5px solid rgba(255,255,255,.85)", lineHeight: 1,
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    }}>{user.avatar ? user.avatar : initials(user.name)}</span>
  );
}

// --- Teilnehmer-Punkte (wer muss dabei sein – farbige Punkte je Person) ---
export function ParticipantDots({ ev, ctx, size = 11, max = 4 }) {
  const ids = ev.participants || [];
  if (!ids.length) return null;
  const users = ids.map((id) => ctx.userById(id)).filter(Boolean).slice(0, max);
  if (!users.length) return null;
  return (
    <span title={"Dabei: " + users.map((u) => u.name).join(", ")}
      style={{ display: "inline-flex", alignItems: "center", gap: -2, flex: "none" }}>
      {users.map((u, i) => (
        <span key={u.id} style={{
          display: "inline-block", width: size, height: size, borderRadius: "50%",
          background: u.color, border: "1.5px solid rgba(255,255,255,.9)",
          marginLeft: i === 0 ? 0 : -3, boxShadow: "0 1px 2px rgba(0,0,0,.3)",
        }} />
      ))}
    </span>
  );
}

// =====================================================================
//  EventChip – kompakte Termin-Darstellung (in allen Ansichten genutzt)
// =====================================================================
export function EventChip({ t, ev, ctx, onClick, showDate, dense, conflict }) {
  const type = ctx.typeById(ev.typeId);
  const area = ctx.areaById(ev.areaId);
  const creator = ctx.userById(ev.creatorId);
  const prio = priorityById(ev.priority);
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "stretch", gap: 0, width: "100%", textAlign: "left",
      background: t.surface, border: conflict ? "1.5px solid #E53935" : `1px solid ${t.border}`, borderRadius: 10,
      cursor: "pointer", overflow: "hidden", fontFamily: "inherit", color: t.text,
      marginBottom: dense ? 4 : 0,
    }}>
      <span style={{ width: 5, background: area ? area.color : t.faint, flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0, padding: dense ? "6px 9px" : "9px 11px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          {conflict && <span title="Überschneidung" style={{ flex: "none", fontSize: dense ? 12 : 13 }}>⚠️</span>}
          <span style={{ fontSize: dense ? 14 : 16, flex: "none" }}>{type ? type.icon : "📌"}</span>
          <span style={{
            fontWeight: 700, fontSize: dense ? 13 : 14, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
          }}>{ev.title || "(ohne Titel)"}</span>
          {ev.locked && <span title="Gesperrt" style={{ flex: "none" }}>🔒</span>}
          <span title={prio.name} style={{ flex: "none", fontSize: 11 }}>{prio.dot}</span>
          <UserAvatar user={creator} size={dense ? 20 : 24} />
        </span>
        <span style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap",
          fontSize: 11.5, color: t.muted,
        }}>
          <span style={{ fontWeight: 700, color: t.text }}>
            {showDate ? `${ev.date.slice(8, 10)}.${ev.date.slice(5, 7)}. · ` : ""}
            {ev.start}{ev.end ? `–${ev.end}` : ""}
          </span>
          {area && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color={area.color} size={8} />{area.name}
          </span>}
          {creator && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: creator.color,
            }} />{creator.name}</span>}
          {ev.participants && ev.participants.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 }}>👥</span><ParticipantDots ev={ev} ctx={ctx} size={12} />
            </span>
          )}
          {ev.recurrence && ev.recurrence.freq && ev.recurrence.freq !== "none" && <span title="Wiederkehrend">🔄</span>}
          {(ev.attachments && ev.attachments.length > 0) && <span title="Anhang">📎</span>}
        </span>
      </span>
    </button>
  );
}

// kompakter Balken für die Monatsansicht
export function MiniEvent({ t, ev, ctx, onClick, conflict }) {
  const type = ctx.typeById(ev.typeId);
  const area = ctx.areaById(ev.areaId);
  const prio = priorityById(ev.priority);
  const creator = ctx.userById(ev.creatorId);
  return (
    <button onClick={onClick} title={`${ev.start} ${ev.title}${creator ? " · " + creator.name : ""}${conflict ? " · ⚠️ Überschneidung" : ""}`} style={{
      display: "flex", alignItems: "center", gap: 3, width: "100%", textAlign: "left",
      background: area ? hexA(area.color, t.mode === "dark" ? 0.22 : 0.14) : t.chip,
      borderLeft: `3px solid ${prio.color}`, borderRadius: 4, padding: "2px 4px",
      cursor: "pointer", fontFamily: "inherit", color: t.text, fontSize: 10.5,
      overflow: "hidden", marginBottom: 2, lineHeight: 1.25,
      outline: conflict ? "1.5px solid #E53935" : "none", outlineOffset: -1.5,
    }}>
      {conflict && <span style={{ flex: "none", fontSize: 9 }}>⚠️</span>}
      <span style={{ flex: "none", fontSize: 10 }}>{type ? type.icon : "📌"}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {ev.title}
      </span>
      {ev.locked && <span style={{ flex: "none", fontSize: 9 }}>🔒</span>}
      {/* Teilnehmer (wer muss dabei sein) */}
      {ev.participants && ev.participants.length > 0
        ? <ParticipantDots ev={ev} ctx={ctx} size={8} />
        : /* sonst Ersteller-Farbe (wer hat es eingetragen) */
          (creator && <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: creator.color, border: "1px solid rgba(255,255,255,.7)" }} />)}
    </button>
  );
}

// Hex + Alpha -> rgba
export function hexA(hex, a) {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
