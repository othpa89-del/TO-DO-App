// ===========================================================================
//  Tasks.jsx – Aufgaben- / To-do-Modul
// ===========================================================================
import React, { useState } from "react";
import { uid, PRIORITIES, priorityById, todayISO, fmtDateShort } from "./data.js";
import { Field, inputStyle, Btn, Dot } from "./components.jsx";

export function Tasks({ t, ctx, tasks, setTasks }) {
  const [f, setF] = useState(blankTask(ctx));
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("open"); // open | done | all
  const sel = inputStyle(t);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    if (!f.title.trim()) { ctx.flash("Bitte einen Titel eingeben.", "error"); return; }
    if (editId) {
      setTasks(tasks.map((x) => (x.id === editId ? { ...x, ...f } : x)));
    } else {
      setTasks([...tasks, { ...f, id: uid("task"), done: false, createdAt: Date.now() }]);
    }
    setF(blankTask(ctx)); setEditId(null);
  }
  function edit(x) { setF({ ...x }); setEditId(x.id); }
  function toggle(id) { setTasks(tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x))); }
  function remove(id) { setTasks(tasks.filter((x) => x.id !== id)); if (editId === id) { setF(blankTask(ctx)); setEditId(null); } }

  const visible = tasks
    .filter((x) => filter === "all" ? true : filter === "done" ? x.done : !x.done)
    .sort((a, b) => (a.done - b.done) || ((a.due || "9999") < (b.due || "9999") ? -1 : 1));

  return (
    <div>
      {/* Editor */}
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: t.text }}>{editId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</div>
        <Field t={t} label="Titel" required>
          <input style={sel} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. Hotel buchen" />
        </Field>
        <Field t={t} label="Beschreibung">
          <textarea style={{ ...sel, minHeight: 50, resize: "vertical" }} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            <Field t={t} label="Verantwortlich">
              <select style={sel} value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
                <option value="">– niemand –</option>
                {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <Field t={t} label="Fällig am">
              <input type="date" style={sel} value={f.due} onChange={(e) => set("due", e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <Field t={t} label="Priorität">
              <select style={sel} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="">– bitte wählen –</option>
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.dot} {p.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {editId && <Btn t={t} kind="ghost" onClick={() => { setF(blankTask(ctx)); setEditId(null); }}>Abbrechen</Btn>}
          <Btn t={t} kind="primary" onClick={save}>{editId ? "Speichern" : "Hinzufügen"}</Btn>
        </div>
      </div>

      {/* Liste */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>Aufgaben</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...sel, width: "auto", padding: "5px 8px", fontSize: 13 }}>
          <option value="open">Offen</option>
          <option value="done">Erledigt</option>
          <option value="all">Alle</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: t.muted }}>
          {tasks.filter((x) => !x.done).length} offen · {tasks.filter((x) => x.done).length} erledigt
        </span>
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: "center", color: t.faint, padding: 30, fontSize: 14 }}>Keine Aufgaben.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {visible.map((x) => {
            const prio = priorityById(x.priority);
            const who = ctx.userById(x.assigneeId);
            const overdue = x.due && !x.done && x.due < todayISO();
            return (
              <div key={x.id} style={{
                display: "flex", alignItems: "flex-start", gap: 10, background: t.surface,
                border: `1px solid ${overdue ? "#E53935" : t.border}`, borderLeft: `4px solid ${prio.color}`,
                borderRadius: 10, padding: "10px 12px",
              }}>
                <input type="checkbox" checked={x.done} onChange={() => toggle(x.id)}
                  style={{ width: 20, height: 20, accentColor: t.accent, marginTop: 1, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: t.text, textDecoration: x.done ? "line-through" : "none", opacity: x.done ? 0.6 : 1 }}>
                    {x.title}
                  </div>
                  {x.description && <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{x.description}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap", fontSize: 11.5, color: t.muted }}>
                    {x.due && <span style={{ color: overdue ? "#E53935" : t.muted, fontWeight: overdue ? 800 : 600 }}>📅 {fmtDateShort(x.due)}{overdue ? " (überfällig)" : ""}</span>}
                    {who && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Dot color={who.color} size={9} />{who.name}</span>}
                    <span>{prio.dot} {prio.name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flex: "none" }}>
                  <button onClick={() => edit(x)} style={iconBtn(t)} title="Bearbeiten">✏️</button>
                  <button onClick={() => remove(x.id)} style={iconBtn(t)} title="Löschen">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function blankTask(ctx) {
  return { title: "", description: "", assigneeId: "", due: "", priority: "" };
}
const iconBtn = (t) => ({ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 3, borderRadius: 6 });
