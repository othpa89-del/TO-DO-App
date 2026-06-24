// ===========================================================================
//  Admin.jsx – Verwaltung: Benutzer, Bereiche, Terminarten
// ===========================================================================
import React, { useState } from "react";
import { uid, ICON_CHOICES } from "./data.js";
import { Modal, Field, inputStyle, Btn, Segmented, Dot } from "./components.jsx";

export function Admin({ t, ctx, onClose }) {
  const [tab, setTab] = useState("users");
  const sel = inputStyle(t);

  return (
    <Modal t={t} wide title="Verwaltung (Administrator)" onClose={onClose}
      footer={<Btn t={t} kind="primary" onClick={onClose}>Fertig</Btn>}>
      <div style={{ marginBottom: 16 }}>
        <Segmented t={t} value={tab} onChange={setTab} options={[
          { id: "users", label: "Benutzer" },
          { id: "areas", label: "Bereiche" },
          { id: "types", label: "Terminarten" },
        ]} />
      </div>
      {tab === "users" && <UsersAdmin t={t} ctx={ctx} sel={sel} />}
      {tab === "areas" && <AreasAdmin t={t} ctx={ctx} sel={sel} />}
      {tab === "types" && <TypesAdmin t={t} ctx={ctx} sel={sel} />}
    </Modal>
  );
}

// --- Benutzer ----------------------------------------------------------
function UsersAdmin({ t, ctx, sel }) {
  const [newName, setNewName] = useState("");
  function update(id, patch) { ctx.setUsers(ctx.users.map((u) => (u.id === id ? { ...u, ...patch } : u))); }
  function add() {
    if (!newName.trim()) return;
    ctx.setUsers([...ctx.users, { id: uid("u"), name: newName.trim(), role: "user", color: "#42A5F5", avatar: "" }]);
    setNewName("");
  }
  function remove(id) {
    if (ctx.users.length <= 1) { ctx.flash("Mindestens ein Benutzer ist erforderlich.", "warn"); return; }
    ctx.setUsers(ctx.users.filter((u) => u.id !== id));
  }
  return (
    <div>
      <p style={{ fontSize: 12.5, color: t.muted, marginTop: 0 }}>Namen, Farben und Rollen sind frei änderbar. Die Benutzerfarbe erscheint überall am Termin.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ctx.users.map((u) => (
          <div key={u.id} style={row(t)}>
            <input type="color" value={u.color} onChange={(e) => update(u.id, { color: e.target.value })} style={colorInp} />
            <input value={u.name} onChange={(e) => update(u.id, { name: e.target.value })} style={{ ...sel, flex: "1 1 120px" }} />
            <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value })} style={{ ...sel, flex: "0 0 130px" }}>
              <option value="">– bitte wählen –</option>
              <option value="admin">Administrator</option>
              <option value="user">Benutzer</option>
            </select>
            <Btn t={t} kind="ghost" onClick={() => remove(u.id)} style={{ flex: "none" }}>Löschen</Btn>
          </div>
        ))}
      </div>
      <div style={{ ...row(t), marginTop: 12, background: t.surface2 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Neuer Benutzer" style={{ ...sel, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Btn t={t} kind="primary" onClick={add}>Hinzufügen</Btn>
      </div>
    </div>
  );
}

// --- Bereiche / Firmen -------------------------------------------------
function AreasAdmin({ t, ctx, sel }) {
  const [newName, setNewName] = useState("");
  function update(id, patch) { ctx.setAreas(ctx.areas.map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  function add() {
    if (!newName.trim()) return;
    ctx.setAreas([...ctx.areas, { id: uid("a"), name: newName.trim(), color: "#26A69A", active: true }]);
    setNewName("");
  }
  function remove(id) {
    if (ctx.areas.length <= 1) { ctx.flash("Mindestens ein Bereich ist erforderlich.", "warn"); return; }
    ctx.setAreas(ctx.areas.filter((a) => a.id !== id));
  }
  return (
    <div>
      <p style={{ fontSize: 12.5, color: t.muted, marginTop: 0 }}>Bereiche/Firmen anlegen, umbenennen, einfärben oder löschen. Die Farbe markiert den Termin im Kalender.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ctx.areas.map((a) => (
          <div key={a.id} style={row(t)}>
            <input type="color" value={a.color} onChange={(e) => update(a.id, { color: e.target.value })} style={colorInp} />
            <input value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} style={{ ...sel, flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: t.muted, flex: "none" }}>
              <input type="checkbox" checked={a.active !== false} onChange={(e) => update(a.id, { active: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: t.accent }} /> aktiv
            </label>
            <Btn t={t} kind="ghost" onClick={() => remove(a.id)} style={{ flex: "none" }}>Löschen</Btn>
          </div>
        ))}
      </div>
      <div style={{ ...row(t), marginTop: 12, background: t.surface2 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Neuer Bereich / Firma" style={{ ...sel, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Btn t={t} kind="primary" onClick={add}>Hinzufügen</Btn>
      </div>
    </div>
  );
}

// --- Terminarten -------------------------------------------------------
function TypesAdmin({ t, ctx, sel }) {
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📌");
  function update(id, patch) { ctx.setTypes(ctx.types.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  function add() {
    if (!newName.trim()) return;
    ctx.setTypes([...ctx.types, { id: uid("t"), name: newName.trim(), icon: newIcon, active: true, aviation: false }]);
    setNewName(""); setNewIcon("📌");
  }
  function remove(id) { ctx.setTypes(ctx.types.filter((x) => x.id !== id)); }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: t.muted, marginTop: 0 }}>Eigene Terminarten erstellen, Icons wählen, umbenennen oder deaktivieren. Deaktivierte Arten erscheinen nicht mehr in der Auswahl.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
        {ctx.types.map((x) => (
          <div key={x.id} style={row(t)}>
            <IconPicker t={t} value={x.icon} onChange={(ic) => update(x.id, { icon: ic })} />
            <input value={x.name} onChange={(e) => update(x.id, { name: e.target.value })} style={{ ...sel, flex: 1 }} />
            {x.aviation && <span style={{ fontSize: 10, fontWeight: 800, color: t.accent, flex: "none" }}>AVIATION</span>}
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: t.muted, flex: "none" }}>
              <input type="checkbox" checked={x.active !== false} onChange={(e) => update(x.id, { active: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: t.accent }} /> aktiv
            </label>
            <Btn t={t} kind="ghost" onClick={() => remove(x.id)} style={{ flex: "none" }}>×</Btn>
          </div>
        ))}
      </div>
      <div style={{ ...row(t), marginTop: 12, background: t.surface2 }}>
        <IconPicker t={t} value={newIcon} onChange={setNewIcon} />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Neue Terminart" style={{ ...sel, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Btn t={t} kind="primary" onClick={add}>Hinzufügen</Btn>
      </div>
    </div>
  );
}

function IconPicker({ t, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        width: 42, height: 40, fontSize: 20, background: t.input, border: `1px solid ${t.border}`,
        borderRadius: 8, cursor: "pointer",
      }}>{value}</button>
      {open && (
        <div style={{
          position: "absolute", top: 44, left: 0, zIndex: 10, background: t.surface,
          border: `1px solid ${t.border}`, borderRadius: 10, padding: 8, width: 252,
          display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, boxShadow: t.shadow,
        }}>
          {ICON_CHOICES.map((ic) => (
            <button key={ic} onClick={() => { onChange(ic); setOpen(false); }} style={{
              fontSize: 18, padding: 4, background: ic === value ? t.chip : "transparent",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}>{ic}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const row = (t) => ({
  display: "flex", alignItems: "center", gap: 8, background: t.surface,
  border: `1px solid ${t.border}`, borderRadius: 10, padding: 8, flexWrap: "wrap",
});
const colorInp = { width: 42, height: 40, padding: 0, border: "none", background: "none", borderRadius: 8, cursor: "pointer", flex: "none" };
