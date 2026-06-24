// ===========================================================================
//  App.jsx – Familien- & Business-Kalender
//  Daten liegen pro Konto in window.storage (Supabase, Echtzeit-Sync).
// ===========================================================================
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  DEFAULT_USERS, DEFAULT_AREAS, DEFAULT_EVENT_TYPES, QUICK_TEMPLATES, REMINDER_OPTIONS,
  PRIORITIES, priorityById, theme, uid,
  todayISO, toISODate, parseISODate, addDays, addMonths, startOfWeek, monthGrid,
  fmtDateLong, fmtDateShort, MONTHS, occurrencesInRange, buildICS, downloadFile, timeToMin,
} from "./cal/data.js";
import { Toast, Btn, Segmented, Dot } from "./cal/components.jsx";
import { DayView, WeekView, MonthView, AgendaView, Dashboard } from "./cal/views.jsx";
import { EventEditor } from "./cal/EventEditor.jsx";
import { Admin } from "./cal/Admin.jsx";
import { Tasks } from "./cal/Tasks.jsx";

// ---- persistente Schlüssel ----------------------------------------------
// Konfiguration als einzelne Blobs (selten/parallel kaum bearbeitet):
const K_USERS = "cal_users", K_AREAS = "cal_areas", K_TYPES = "cal_types",
  K_SETTINGS = "cal_settings";
// Termine & Aufgaben als EINZELNE Zeilen je Element (Präfix) -> robuste
// Mehrgeräte-Sync: gleichzeitige Änderungen an verschiedenen Einträgen
// überschreiben sich NICHT gegenseitig (kein Last-Write-Wins auf der Gesamtliste).
const P_EVENT = "cal_event:", P_TASK = "cal_task:";
// Legacy-Blobs (frühere Versionen) – werden einmalig migriert:
const K_EVENTS_LEGACY = "cal_events", K_TASKS_LEGACY = "cal_tasks";

async function loadJSON(key, fallback) {
  try { const r = await window.storage.get(key, true); return r && r.value ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function saveJSON(key, val) {
  try { await window.storage.set(key, JSON.stringify(val), true); } catch {}
}

// Sammlung (Termine/Aufgaben) aus den Einzelzeilen laden.
async function loadCollection(prefix) {
  try {
    const r = await window.storage.getAll(prefix);
    const out = [];
    for (const it of r.items || []) {
      try { const o = JSON.parse(it.value); if (o && o.id) out.push(o); } catch {}
    }
    return out;
  } catch { return []; }
}

// Diff-Persistenz: nur geänderte/neue Elemente schreiben, entfernte löschen.
function persistDiff(prefix, prev, next) {
  const prevById = new Map((prev || []).map((x) => [x.id, x]));
  for (const x of next) {
    if (x.id == null) continue;
    const p = prevById.get(x.id);
    if (!p || JSON.stringify(p) !== JSON.stringify(x)) saveJSON(prefix + x.id, x);
    prevById.delete(x.id);
  }
  for (const id of prevById.keys()) { try { window.storage.delete(prefix + id); } catch {} }
}

function blankEvent(ctx) {
  return {
    id: null, title: "", date: todayISO(), start: "09:00", end: "10:00",
    creatorId: ctx.activeUserId || "", areaId: "",
    priority: "", typeId: "", participants: [], description: "", location: "",
    address: "", notes: "", link: "", attachments: [], reminder: "none",
    locked: false, recurrence: { freq: "none", interval: 1 },
  };
}

export default function App() {
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [areas, setAreas] = useState(DEFAULT_AREAS);
  const [types, setTypes] = useState(DEFAULT_EVENT_TYPES);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ themeMode: "light", activeUserId: "u_patrick" });
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState("dashboard"); // dashboard|day|week|month|agenda|tasks
  const [cursor, setCursor] = useState(todayISO());
  const [agendaPeriod, setAgendaPeriod] = useState("month");

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fUser, setFUser] = useState("all");
  const [fArea, setFArea] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fType, setFType] = useState("all");
  const [fPart, setFPart] = useState("all"); // Teilnehmer: all | userId | "both"

  const [editor, setEditor] = useState(null); // {draft, isNew}
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  // letzter persistierter Stand (für Diff-Persistenz pro Element)
  const eventsRef = useRef([]);
  const tasksRef = useRef([]);

  const t = theme(settings.themeMode);

  const flash = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ---------- Laden ----------
  useEffect(() => {
    let on = true;
    (async () => {
      const [u, a, ty, st] = await Promise.all([
        loadJSON(K_USERS, null), loadJSON(K_AREAS, null), loadJSON(K_TYPES, null), loadJSON(K_SETTINGS, null),
      ]);
      let ev = await loadCollection(P_EVENT);
      let tk = await loadCollection(P_TASK);
      // Einmalige Migration aus früheren Einzel-Blobs in Einzelzeilen
      if (ev.length === 0) {
        const legacy = await loadJSON(K_EVENTS_LEGACY, []);
        if (Array.isArray(legacy) && legacy.length) {
          ev = legacy; for (const x of legacy) if (x.id) saveJSON(P_EVENT + x.id, x);
          try { window.storage.delete(K_EVENTS_LEGACY); } catch {}
        }
      }
      if (tk.length === 0) {
        const legacy = await loadJSON(K_TASKS_LEGACY, []);
        if (Array.isArray(legacy) && legacy.length) {
          tk = legacy; for (const x of legacy) if (x.id) saveJSON(P_TASK + x.id, x);
          try { window.storage.delete(K_TASKS_LEGACY); } catch {}
        }
      }
      if (!on) return;
      if (u && u.length) setUsers(u); else saveJSON(K_USERS, DEFAULT_USERS);
      if (a && a.length) setAreas(a); else saveJSON(K_AREAS, DEFAULT_AREAS);
      if (ty && ty.length) setTypes(ty); else saveJSON(K_TYPES, DEFAULT_EVENT_TYPES);
      eventsRef.current = ev; setEvents(ev);
      tasksRef.current = tk; setTasks(tk);
      if (st) setSettings((s) => ({ ...s, ...st }));
      setLoaded(true);
    })();
    return () => { on = false; };
  }, []);

  // ---------- Realtime: bei Remote-Änderung neu laden ----------
  useEffect(() => {
    const h = async () => {
      const [u, a, ty, st] = await Promise.all([
        loadJSON(K_USERS, null), loadJSON(K_AREAS, null), loadJSON(K_TYPES, null), loadJSON(K_SETTINGS, null),
      ]);
      const ev = await loadCollection(P_EVENT);
      const tk = await loadCollection(P_TASK);
      if (u && u.length) setUsers(u);
      if (a && a.length) setAreas(a);
      if (ty && ty.length) setTypes(ty);
      eventsRef.current = ev; setEvents(ev);
      tasksRef.current = tk; setTasks(tk);
      if (st) setSettings((s) => ({ ...s, ...st }));
    };
    window.addEventListener("ctc:remote", h);
    return () => window.removeEventListener("ctc:remote", h);
  }, []);

  // ---------- Persistenz-Wrapper ----------
  // Termine & Aufgaben: pro Element eine eigene Zeile (Diff) -> kein Clobbering.
  const persist = {
    users: (next) => { setUsers(next); saveJSON(K_USERS, next); },
    areas: (next) => { setAreas(next); saveJSON(K_AREAS, next); },
    types: (next) => { setTypes(next); saveJSON(K_TYPES, next); },
    events: (next) => { persistDiff(P_EVENT, eventsRef.current, next); eventsRef.current = next; setEvents(next); },
    tasks: (next) => { persistDiff(P_TASK, tasksRef.current, next); tasksRef.current = next; setTasks(next); },
    settings: (next) => { setSettings(next); saveJSON(K_SETTINGS, next); },
  };

  // ---------- Lookups ----------
  const typeById = useCallback((id) => types.find((x) => x.id === id), [types]);
  const areaById = useCallback((id) => areas.find((x) => x.id === id), [areas]);
  const userById = useCallback((id) => users.find((x) => x.id === id), [users]);
  const activeUser = userById(settings.activeUserId) || users[0];
  const isAdmin = activeUser?.role === "admin";

  function canEditEvent(ev) {
    if (!ev || ev.id == null) return true;
    if (!ev.locked) return true;
    return isAdmin || ev.creatorId === settings.activeUserId;
  }

  // ---------- ctx für Kindkomponenten ----------
  const ctx = {
    users, areas, types, events,
    activeUserId: settings.activeUserId,
    quickTemplates: QUICK_TEMPLATES,
    typeById, areaById, userById, flash,
    setUsers: persist.users, setAreas: persist.areas, setTypes: persist.types,
  };

  // ---------- Filter auf Basis-Termine ----------
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (fUser !== "all" && ev.creatorId !== fUser) return false;
      if (fArea !== "all" && ev.areaId !== fArea) return false;
      if (fPrio !== "all" && ev.priority !== fPrio) return false;
      if (fType !== "all" && ev.typeId !== fType) return false;
      if (fPart === "both") {
        if (!users.every((u) => (ev.participants || []).includes(u.id))) return false;
      } else if (fPart !== "all" && !(ev.participants || []).includes(fPart)) return false;
      if (q) {
        const hay = `${ev.title} ${ev.description || ""} ${ev.location || ""} ${ev.address || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, fUser, fArea, fPrio, fType, fPart, search, users]);

  // ---------- sichtbarer Zeitraum ----------
  const range = useMemo(() => {
    const c = parseISODate(cursor);
    if (view === "day") return [cursor, cursor];
    if (view === "week") { const ws = startOfWeek(c); return [toISODate(ws), toISODate(addDays(ws, 6))]; }
    if (view === "month") { const g = monthGrid(c.getFullYear(), c.getMonth()); return [toISODate(g[0]), toISODate(g[41])]; }
    if (view === "agenda") {
      const start = todayISO();
      const end = agendaPeriod === "today" ? start
        : agendaPeriod === "week" ? toISODate(addDays(parseISODate(start), 6))
        : agendaPeriod === "custom" ? cursor
        : toISODate(addMonths(parseISODate(start), 1));
      return [start, end < start ? start : end];
    }
    // dashboard
    return [todayISO(), toISODate(addDays(parseISODate(todayISO()), 6))];
  }, [view, cursor, agendaPeriod]);

  const occ = useMemo(() => occurrencesInRange(filteredEvents, range[0], range[1]), [filteredEvents, range]);

  // ---------- Erinnerungen (Push, solange App geöffnet) ----------
  const notified = useRef(new Set());
  useEffect(() => {
    if (!("Notification" in window)) return;
    const tick = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      const todays = occurrencesInRange(events, todayISO(), toISODate(addDays(now, 1)));
      for (const ev of todays) {
        const opt = REMINDER_OPTIONS.find((r) => r.id === ev.reminder);
        if (!opt || !opt.minutes) continue;
        const evTime = new Date(`${ev.date}T${ev.start || "00:00"}:00`);
        const fireAt = evTime.getTime() - opt.minutes * 60000;
        const key = `${ev.id}|${ev.date}|${ev.reminder}`;
        if (now.getTime() >= fireAt && now.getTime() < evTime.getTime() && !notified.current.has(key)) {
          notified.current.add(key);
          const ty = typeById(ev.typeId);
          try { new Notification(`${ty ? ty.icon : "📅"} ${ev.title}`, { body: `${ev.start} – ${opt.name}`, tag: key }); } catch {}
        }
      }
    };
    const iv = setInterval(tick, 30000);
    tick();
    return () => clearInterval(iv);
  }, [events, typeById]);

  // ---------- Aktionen ----------
  function openNew(prefill = {}) {
    const base = blankEvent({ areas, types, users, activeUserId: settings.activeUserId });
    setEditor({ draft: { ...base, ...prefill }, isNew: true });
  }
  function openQuick(q) {
    openNew({ typeId: q.typeId, areaId: q.areaId, priority: q.priority, title: q.label });
  }
  function openEvent(ev) {
    // ev kann ein Vorkommen sein -> Basis-Termin laden
    const base = events.find((x) => x.id === ev.id) || ev;
    setEditor({ draft: { ...base }, isNew: false, occDate: ev.date });
  }
  function saveEvent(draft) {
    let next;
    if (draft.id == null) {
      next = [...events, { ...draft, id: uid("ev"), createdAt: Date.now(), updatedAt: Date.now() }];
      flash("Termin erstellt.");
    } else {
      next = events.map((x) => (x.id === draft.id ? { ...draft, updatedAt: Date.now() } : x));
      flash("Termin gespeichert.");
    }
    persist.events(next);
    setEditor(null);
  }
  function deleteEvent(ev) { setConfirmDel(ev); }
  function reallyDelete() {
    persist.events(events.filter((x) => x.id !== confirmDel.id));
    setConfirmDel(null); setEditor(null);
    flash("Termin gelöscht.");
  }

  function changeView(v) { setView(v); setMenuOpen(false); }
  function navStep(dir) {
    const c = parseISODate(cursor);
    if (view === "day" || view === "agenda") setCursor(toISODate(addDays(c, dir)));
    else if (view === "week") setCursor(toISODate(addDays(c, dir * 7)));
    else if (view === "month") setCursor(toISODate(addMonths(c, dir)));
  }
  function goToday() { setCursor(todayISO()); }

  async function requestNotifications() {
    if (!("Notification" in window)) { flash("Benachrichtigungen werden hier nicht unterstützt.", "warn"); return; }
    const p = await Notification.requestPermission();
    flash(p === "granted" ? "Benachrichtigungen aktiviert." : "Benachrichtigungen nicht erlaubt.", p === "granted" ? "info" : "warn");
    setMenuOpen(false);
  }
  function exportICS() {
    if (filteredEvents.length === 0) { flash("Keine Termine zum Export.", "warn"); return; }
    const ics = buildICS(filteredEvents,
      (id) => (typeById(id)?.name || ""), (id) => (areaById(id)?.name || ""), (id) => (userById(id)?.name || ""));
    downloadFile("kalender.ics", ics, "text/calendar");
    flash("ICS-Datei exportiert (Outlook / Google / Apple).");
    setMenuOpen(false);
  }
  function exportJSON() {
    downloadFile("kalender-backup.json", JSON.stringify({ users, areas, types, events, tasks }, null, 2), "application/json");
    flash("JSON-Backup exportiert.");
    setMenuOpen(false);
  }

  if (!loaded) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: t.bg, color: t.muted, fontFamily: FONT }}>Kalender lädt …</div>;
  }

  const headerTitle = (() => {
    const c = parseISODate(cursor);
    if (view === "day") return fmtDateShort(cursor);
    if (view === "week") { const ws = startOfWeek(c); return `${fmtDateShort(toISODate(ws))} – ${fmtDateShort(toISODate(addDays(ws, 6)))}`; }
    if (view === "month") return `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    if (view === "agenda") return "Agenda";
    return "Dashboard";
  })();

  const VIEW_TABS = [
    { id: "dashboard", label: "Start" },
    { id: "day", label: "Tag" },
    { id: "week", label: "Woche" },
    { id: "month", label: "Monat" },
    { id: "agenda", label: "Agenda" },
    { id: "tasks", label: "Aufgaben" },
  ];
  const showNav = ["day", "week", "month", "agenda"].includes(view);

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: FONT, paddingBottom: 90 }}>
      {/* ===== Header ===== */}
      <header style={{ background: t.navy, color: "#fff", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,.25)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "10px 14px max(10px, env(safe-area-inset-top))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-.01em" }}>Kalender</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {/* aktiver Benutzer */}
              <select value={settings.activeUserId} onChange={(e) => persist.settings({ ...settings, activeUserId: e.target.value })}
                title="Aktiver Benutzer" style={{
                  background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.2)",
                  borderRadius: 8, padding: "6px 8px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                }}>
                {users.map((u) => <option key={u.id} value={u.id} style={{ color: "#111" }}>{u.name}{u.role === "admin" ? " ★" : ""}</option>)}
              </select>
              <button onClick={() => persist.settings({ ...settings, themeMode: settings.themeMode === "dark" ? "light" : "dark" })}
                title="Hell/Dunkel" style={hBtn}>{settings.themeMode === "dark" ? "☀️" : "🌙"}</button>
              {isAdmin && <button onClick={() => setAdminOpen(true)} title="Verwaltung" style={hBtn}>⚙️</button>}
              <div style={{ position: "relative" }}>
                <button onClick={() => setMenuOpen((o) => !o)} title="Menü" style={hBtn}>⋯</button>
                {menuOpen && (
                  <div style={{
                    position: "absolute", right: 0, top: 40, background: t.surface, color: t.text,
                    border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.shadow, padding: 6, width: 232, zIndex: 130,
                  }}>
                    {[
                      ["🔔 Benachrichtigungen aktivieren", requestNotifications],
                      ["📤 Export ICS (Outlook/Google/Apple)", exportICS],
                      ["💾 JSON-Backup", exportJSON],
                    ].map(([label, fn]) => (
                      <button key={label} onClick={fn} style={menuItem(t)}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ansicht-Tabs */}
          <div style={{ marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            <div style={{ display: "inline-flex", gap: 4 }}>
              {VIEW_TABS.map((v) => (
                <button key={v.id} onClick={() => changeView(v.id)} style={{
                  border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  padding: "7px 13px", fontSize: 13.5, fontWeight: 700,
                  background: view === v.id ? "#fff" : "rgba(255,255,255,.10)",
                  color: view === v.id ? t.navy : "#fff",
                }}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "14px 12px" }}>
        {/* ===== Schnellanlage ===== */}
        {view !== "tasks" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: t.muted, letterSpacing: ".03em" }}>SCHNELLANLAGE</span>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {QUICK_TEMPLATES.map((q) => {
                const ty = typeById(q.typeId);
                return (
                  <button key={q.id} onClick={() => openQuick(q)} style={{
                    display: "flex", alignItems: "center", gap: 6, background: t.surface, color: t.text,
                    border: `1px solid ${t.border}`, borderRadius: 22, padding: "8px 13px",
                    fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>{ty ? ty.icon : "📌"} {q.label}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== Suche & Filter ===== */}
        {view !== "tasks" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Suche in Titel, Beschreibung, Ort…"
                style={{ flex: 1, padding: "10px 12px", border: `1px solid ${t.border}`, borderRadius: 10, background: t.input, color: t.text, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
              <Btn t={t} kind={showFilters ? "primary" : "ghost"} onClick={() => setShowFilters((o) => !o)}>Filter</Btn>
            </div>
            {showFilters && (
              <div style={{ marginTop: 10, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
                <FilterSelect t={t} label="Benutzer" value={fUser} onChange={setFUser}
                  options={[["all", "Alle"], ...users.map((u) => [u.id, u.name])]} />
                <FilterSelect t={t} label="Bereich" value={fArea} onChange={setFArea}
                  options={[["all", "Alle"], ...areas.map((a) => [a.id, a.name])]} />
                <FilterSelect t={t} label="Priorität" value={fPrio} onChange={setFPrio}
                  options={[["all", "Alle"], ...PRIORITIES.map((p) => [p.id, p.name])]} />
                <FilterSelect t={t} label="Terminart" value={fType} onChange={setFType}
                  options={[["all", "Alle"], ...types.filter((x) => x.active !== false).map((x) => [x.id, `${x.icon} ${x.name}`])]} />
                <FilterSelect t={t} label="Dabei" value={fPart} onChange={setFPart}
                  options={[["all", "Alle"], ["both", "Beide dabei"], ...users.map((u) => [u.id, `${u.name} dabei`])]} />
                {(fUser !== "all" || fArea !== "all" || fPrio !== "all" || fType !== "all" || fPart !== "all") && (
                  <button onClick={() => { setFUser("all"); setFArea("all"); setFPrio("all"); setFType("all"); setFPart("all"); }}
                    style={{ alignSelf: "flex-end", background: "none", border: "none", color: t.accent, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Zurücksetzen
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Datums-Navigation ===== */}
        {showNav && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {view !== "agenda" && <>
              <Btn t={t} kind="soft" onClick={() => navStep(-1)}>‹</Btn>
              <Btn t={t} kind="soft" onClick={goToday}>Heute</Btn>
              <Btn t={t} kind="soft" onClick={() => navStep(1)}>›</Btn>
            </>}
            <span style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{headerTitle}</span>
            {view === "agenda" && (
              <div style={{ marginLeft: "auto" }}>
                <Segmented t={t} small value={agendaPeriod} onChange={setAgendaPeriod} options={[
                  { id: "today", label: "Heute" }, { id: "week", label: "Woche" }, { id: "month", label: "Monat" },
                ]} />
              </div>
            )}
          </div>
        )}

        {/* ===== Ansicht ===== */}
        {view === "dashboard" && (
          <Dashboard t={t} ctx={ctx} allEvents={events} occ7={occ} tasks={tasks}
            onSelect={openEvent} onGoAgenda={() => setView("agenda")} />
        )}
        {view === "day" && <DayView t={t} ctx={ctx} dateISO={cursor} occ={occ} onSelect={openEvent} />}
        {view === "week" && <WeekView t={t} ctx={ctx} dateISO={cursor} occ={occ} onSelect={openEvent}
          onPickDay={(iso) => { setCursor(iso); setView("day"); }} />}
        {view === "month" && <MonthView t={t} ctx={ctx} dateISO={cursor} occ={occ} onSelect={openEvent}
          onPickDay={(iso) => { setCursor(iso); setView("day"); }} />}
        {view === "agenda" && <AgendaView t={t} ctx={ctx} occ={occ} onSelect={openEvent} />}
        {view === "tasks" && <Tasks t={t} ctx={ctx} tasks={tasks} setTasks={persist.tasks} />}
      </main>

      {/* ===== Neuer-Termin-Button ===== */}
      {view !== "tasks" && (
        <button onClick={() => openNew()} aria-label="Neuer Termin" style={{
          position: "fixed", right: "calc(16px + env(safe-area-inset-right))",
          bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 90,
          width: 58, height: 58, borderRadius: "50%", background: t.accent, color: "#fff",
          border: "none", fontSize: 30, cursor: "pointer", boxShadow: "0 8px 24px rgba(46,91,255,.5)", lineHeight: 1,
        }}>+</button>
      )}

      {/* ===== Modals ===== */}
      {editor && (
        <EventEditor t={t} ctx={ctx} draft={editor.draft} isNew={editor.isNew}
          canEdit={canEditEvent(editor.draft)} onSave={saveEvent} onDelete={deleteEvent} onClose={() => setEditor(null)} />
      )}
      {adminOpen && <Admin t={t} ctx={ctx} onClose={() => setAdminOpen(false)} />}
      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,10,22,.62)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: t.surface, color: t.text, borderRadius: 14, border: `1px solid ${t.border}`, padding: 22, maxWidth: 360, width: "100%", boxShadow: t.shadow }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Termin löschen?</div>
            <div style={{ fontSize: 14, color: t.muted, marginBottom: 18 }}>„{confirmDel.title}" wird dauerhaft gelöscht.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn t={t} kind="ghost" onClick={() => setConfirmDel(null)}>Abbrechen</Btn>
              <Btn t={t} kind="danger" onClick={reallyDelete}>Löschen</Btn>
            </div>
          </div>
        </div>
      )}

      <Toast t={t} toast={toast} />
      {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 110 }} />}
    </div>
  );
}

const FONT = "Mulish, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const hBtn = {
  background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 8, width: 34, height: 34, fontSize: 16, cursor: "pointer", lineHeight: 1,
};
const menuItem = (t) => ({
  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
  padding: "9px 10px", fontSize: 13.5, fontWeight: 600, color: t.text, cursor: "pointer",
  borderRadius: 7, fontFamily: "inherit",
});

function FilterSelect({ t, label, value, onChange, options }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        padding: "8px 10px", border: `1px solid ${t.border}`, borderRadius: 9, background: t.input,
        color: t.text, fontSize: 13, fontFamily: "inherit", minWidth: 130,
      }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
