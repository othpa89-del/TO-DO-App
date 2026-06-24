// ===========================================================================
//  views.jsx – Tag / Woche / Monat / Agenda / Dashboard
// ===========================================================================
import React from "react";
import {
  WEEKDAYS, WEEKDAYS_LONG, MONTHS, PRIORITIES,
  toISODate, parseISODate, addDays, startOfWeek, monthGrid, todayISO,
  timeToMin, fmtDateLong, priorityById, dayConflictSet,
} from "./data.js";
import { EventChip, MiniEvent, Dot, hexA, UserAvatar, ParticipantDots } from "./components.jsx";

// Leeransicht
function Empty({ t, text }) {
  return (
    <div style={{ textAlign: "center", color: t.faint, padding: "40px 16px", fontSize: 14 }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>📅</div>{text}
    </div>
  );
}

// Einfache Spuren-Berechnung für überlappende Termine (Tagesansicht)
// Cluster-basiertes Layout: nur zusammenhängend überlappende Termine teilen
// sich die Breite (jeweils eigene Spalte). Eigenständige Termine bleiben breit.
// conflict = der Termin liegt in einem Cluster mit ≥2 Terminen (Überschneidung).
function layoutDay(items) {
  const sorted = items.slice().sort((a, b) =>
    timeToMin(a.start) - timeToMin(b.start) || timeToMin(a.end) - timeToMin(b.end));
  const placed = [];
  let cluster = [], clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const lanes = []; // Endzeit je Spalte
    const cols = [];
    for (const ev of cluster) {
      const s = timeToMin(ev.start), e = Math.max(timeToMin(ev.end), s + 15);
      let lane = lanes.findIndex((end) => end <= s);
      if (lane === -1) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
      cols.push({ ev, lane, s, e });
    }
    const colCount = Math.max(1, lanes.length);
    const conflict = cluster.length > 1;
    for (const c of cols) placed.push({ ...c, colCount, conflict });
    cluster = []; clusterEnd = -1;
  };

  for (const ev of sorted) {
    const s = timeToMin(ev.start), e = Math.max(timeToMin(ev.end), s + 15);
    if (cluster.length && s < clusterEnd) { cluster.push(ev); clusterEnd = Math.max(clusterEnd, e); }
    else { flush(); cluster = [ev]; clusterEnd = e; }
  }
  flush();
  return placed;
}

// ---------------------------------------------------------------------
//  TAGESANSICHT
// ---------------------------------------------------------------------
export function DayView({ t, ctx, dateISO, occ, onSelect }) {
  const dayItems = occ.filter((e) => e.date === dateISO);
  const HOUR = 52;
  const startHour = 0, endHour = 24;
  const placed = layoutDay(dayItems);
  const hasConflict = placed.some((p) => p.conflict);
  const nowMin = todayISO() === dateISO
    ? new Date().getHours() * 60 + new Date().getMinutes() : null;

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: t.text }}>
        {fmtDateLong(dateISO)}
        <span style={{ fontWeight: 600, color: t.muted, fontSize: 13, marginLeft: 8 }}>
          {dayItems.length} {dayItems.length === 1 ? "Termin" : "Termine"}
        </span>
        {hasConflict && (
          <span style={{
            marginLeft: 8, fontSize: 12, fontWeight: 800, color: "#fff", background: "#E53935",
            borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap",
          }}>⚠️ Überschneidung</span>
        )}
      </div>
      {dayItems.length === 0 && <Empty t={t} text="Keine Termine an diesem Tag." />}
      <div style={{ position: "relative", borderTop: `1px solid ${t.border}` }}>
        {Array.from({ length: endHour - startHour }).map((_, i) => {
          const h = startHour + i;
          return (
            <div key={h} style={{ display: "flex", height: HOUR, borderBottom: `1px solid ${t.borderSoft}` }}>
              <div style={{ width: 46, flex: "none", fontSize: 11, color: t.faint, paddingTop: 2, fontWeight: 600 }}>
                {String(h).padStart(2, "0")}:00
              </div>
              <div style={{ flex: 1 }} />
            </div>
          );
        })}
        {/* Jetzt-Linie */}
        {nowMin != null && (
          <div style={{
            position: "absolute", left: 46, right: 0, top: (nowMin / 60) * HOUR,
            height: 2, background: "#E53935", zIndex: 3,
          }}>
            <span style={{ position: "absolute", left: -6, top: -4, width: 8, height: 8, borderRadius: "50%", background: "#E53935" }} />
          </div>
        )}
        {/* Termine */}
        <div style={{ position: "absolute", left: 50, right: 2, top: 0, bottom: 0 }}>
          {placed.map(({ ev, lane, s, e, colCount, conflict }, idx) => {
            const top = (s / 60) * HOUR;
            const height = Math.max(((e - s) / 60) * HOUR - 3, 26);
            const w = 100 / colCount;
            const type = ctx.typeById(ev.typeId);
            const area = ctx.areaById(ev.areaId);
            const prio = priorityById(ev.priority);
            const creator = ctx.userById(ev.creatorId);
            return (
              <button key={ev.id + idx} onClick={() => onSelect(ev)} style={{
                position: "absolute", top, height, left: `${lane * w}%`, width: `calc(${w}% - 4px)`,
                background: area ? hexA(area.color, t.mode === "dark" ? 0.26 : 0.15) : t.chip,
                borderLeft: `4px solid ${prio.color}`,
                border: conflict ? "2px solid #E53935" : `1px solid ${t.border}`,
                borderRadius: 8, padding: "4px 7px", cursor: "pointer", overflow: "hidden",
                textAlign: "left", fontFamily: "inherit", color: t.text,
                boxShadow: conflict ? "0 0 0 1px #E53935 inset" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                  {conflict && <span title="Überschneidung" style={{ fontSize: 11, flex: "none" }}>⚠️</span>}
                  <span style={{ flex: "none" }}>{type ? type.icon : "📌"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
                  {ev.locked && <span style={{ fontSize: 10 }}>🔒</span>}
                  <UserAvatar user={creator} size={18} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: t.muted, marginTop: 1 }}>
                  <span>{ev.start}–{ev.end}</span>
                  {ev.participants && ev.participants.length > 0 && <ParticipantDots ev={ev} ctx={ctx} size={9} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  WOCHENANSICHT
// ---------------------------------------------------------------------
export function WeekView({ t, ctx, dateISO, occ, onSelect, onPickDay }) {
  const ws = startOfWeek(parseISODate(dateISO));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = todayISO();
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {days.map((d) => {
          const iso = toISODate(d);
          const items = occ.filter((e) => e.date === iso);
          const conflicts = dayConflictSet(items);
          const isToday = iso === today;
          return (
            <div key={iso} style={{
              background: isToday ? t.todayBg : t.surface, border: `1px solid ${isToday ? t.accent : t.border}`,
              borderRadius: 10, padding: 6, minHeight: 90, display: "flex", flexDirection: "column",
            }}>
              <button onClick={() => onPickDay(iso)} style={{
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
                marginBottom: 6, textAlign: "center", fontFamily: "inherit",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.muted }}>{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? t.accent : t.text }}>{d.getDate()}</div>
              </button>
              <div style={{ flex: 1, overflow: "hidden" }}>
                {items.slice(0, 6).map((ev, i) => (
                  <MiniEvent key={ev.id + i} t={t} ev={ev} ctx={ctx} conflict={conflicts.has(ev.id)} onClick={() => onSelect(ev)} />
                ))}
                {items.length > 6 && (
                  <button onClick={() => onPickDay(iso)} style={{
                    background: "none", border: "none", color: t.muted, fontSize: 10, cursor: "pointer", padding: 2,
                  }}>+{items.length - 6} mehr</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  MONATSANSICHT
// ---------------------------------------------------------------------
export function MonthView({ t, ctx, dateISO, occ, onSelect, onPickDay }) {
  const cur = parseISODate(dateISO);
  const year = cur.getFullYear(), month = cur.getMonth();
  const grid = monthGrid(year, month);
  const today = todayISO();
  // schnelle Lookup-Map
  const byDay = {};
  for (const e of occ) (byDay[e.date] = byDay[e.date] || []).push(e);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: t.muted, padding: "2px 0" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {grid.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === month;
          const isToday = iso === today;
          const items = byDay[iso] || [];
          const conflicts = dayConflictSet(items);
          return (
            <div key={iso} onClick={() => onPickDay(iso)} style={{
              background: isToday ? t.todayBg : inMonth ? t.surface : t.surface2,
              border: `1px solid ${isToday ? t.accent : t.border}`, borderRadius: 8,
              minHeight: 78, padding: 4, cursor: "pointer", overflow: "hidden",
              opacity: inMonth ? 1 : 0.55,
            }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 800 : 600,
                color: isToday ? t.accent : t.text, textAlign: "right", marginBottom: 2,
              }}>{d.getDate()}</div>
              {items.slice(0, 3).map((ev, i) => (
                <MiniEvent key={ev.id + i} t={t} ev={ev} ctx={ctx} conflict={conflicts.has(ev.id)} onClick={(e) => { e.stopPropagation(); onSelect(ev); }} />
              ))}
              {items.length > 3 && (
                <div style={{ fontSize: 9.5, color: t.muted, fontWeight: 700, paddingLeft: 2 }}>+{items.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  AGENDA-ANSICHT (kommende Termine)
// ---------------------------------------------------------------------
export function AgendaView({ t, ctx, occ, onSelect }) {
  // gruppiere nach Datum
  const groups = {};
  for (const e of occ) (groups[e.date] = groups[e.date] || []).push(e);
  const dates = Object.keys(groups).sort();
  if (dates.length === 0) return <Empty t={t} text="Keine kommenden Termine im gewählten Zeitraum." />;
  return (
    <div>
      {dates.map((d) => (
        <div key={d} style={{ marginBottom: 18 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
            position: "sticky", top: 0, background: t.bg, padding: "4px 0", zIndex: 2,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 800, color: d === todayISO() ? t.accent : t.text,
            }}>{fmtDateLong(d)}</span>
            {d === todayISO() && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: t.accent, borderRadius: 6, padding: "1px 7px" }}>Heute</span>}
            {dayConflictSet(groups[d]).size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#E53935", borderRadius: 6, padding: "1px 7px" }}>⚠️ Überschneidung</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => { const cf = dayConflictSet(groups[d]); return groups[d].map((ev, i) => (
              <EventChip key={ev.id + i} t={t} ev={ev} ctx={ctx} conflict={cf.has(ev.id)} onClick={() => onSelect(ev)} />
            )); })()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
//  DASHBOARD / STARTSEITE
// ---------------------------------------------------------------------
export function Dashboard({ t, ctx, allEvents, occ7, tasks, onSelect, onGoAgenda }) {
  const today = todayISO();
  const todays = occ7.filter((e) => e.date === today);
  const next7 = occ7.filter((e) => e.date > today);
  const critical = occ7.filter((e) => e.priority === "kritisch");
  const locked = occ7.filter((e) => e.locked);

  // Statistik
  const perArea = {};
  for (const e of occ7) perArea[e.areaId] = (perArea[e.areaId] || 0) + 1;
  const privArea = ctx.areas.find((a) => /privat/i.test(a.name));
  const privCount = occ7.filter((e) => privArea && e.areaId === privArea.id).length;
  const bizCount = occ7.length - privCount;
  const tasksOpen = tasks.filter((x) => !x.done).length;
  const tasksDone = tasks.filter((x) => x.done).length;

  const Card = ({ title, count, icon, sub }) => (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 14px", flex: "1 1 130px" }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.text, lineHeight: 1.1, marginTop: 2 }}>{count}</div>
      <div style={{ fontSize: 12, color: t.muted, fontWeight: 600 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: t.faint }}>{sub}</div>}
    </div>
  );

  const Section = ({ title, items, empty, badge }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{title}</h3>
        {badge != null && <span style={{ fontSize: 12, fontWeight: 700, color: t.muted }}>({badge})</span>}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: t.faint, padding: "6px 0" }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((ev, i) => <EventChip key={ev.id + i} t={t} ev={ev} ctx={ctx} onClick={() => onSelect(ev)} showDate />)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <Card title="Heute" count={todays.length} icon="📅" />
        <Card title="Nächste 7 Tage" count={next7.length} icon="🗓️" />
        <Card title="Geschäftlich" count={bizCount} icon="🏢" sub={`Privat: ${privCount}`} />
        <Card title="Aufgaben offen" count={tasksOpen} icon="✅" sub={`Erledigt: ${tasksDone}`} />
      </div>

      <Section title="Heute" items={todays} empty="Heute keine Termine." badge={todays.length} />
      <Section title="Wichtig – Kritisch & Gesperrt"
        items={[...critical, ...locked.filter((l) => !critical.some((c) => c.id === l.id && c.date === l.date))].slice(0, 8)}
        empty="Keine kritischen oder gesperrten Termine." />
      <Section title="Nächste 7 Tage" items={next7.slice(0, 10)} empty="Keine Termine in den nächsten 7 Tagen." badge={next7.length} />

      {/* Statistik je Bereich */}
      <div style={{ marginTop: 6 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800, color: t.text }}>Termine pro Bereich (7 Tage)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ctx.areas.map((a) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 7, background: t.surface,
              border: `1px solid ${t.border}`, borderRadius: 9, padding: "7px 11px", fontSize: 13, color: t.text,
            }}>
              <Dot color={a.color} /><span style={{ fontWeight: 700 }}>{a.name}</span>
              <span style={{ color: t.muted }}>{perArea[a.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
