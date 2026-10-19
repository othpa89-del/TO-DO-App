// Tagesübersicht für das Dashboard (Abschnitt 4.4) samt Konfliktliste (4.5).
//
// Zeigt alle Termine des Tages chronologisch und quellübergreifend: die
// synchronisierten Fremdtermine, die eigenen Meetings und die heute fälligen
// Aufgaben. Dazu eine Vorschau auf morgen, damit ein früher Start nicht
// übersehen wird, und die Konflikte der nächsten 14 Tage.

import React, { useMemo } from "react";
import { AlertTriangle, ChevronRight, Lock, Pencil } from "lucide-react";
import { L, getLang } from "./i18n.js";
import {
  SOURCE_COMPANY, conflictsInDays, dayKey, dayKeysOf, hhmmToMin, minutesOfDay, shiftDay,
} from "./calendar.js";

const TOMORROW_MAX = 3;

const pad = (n) => String(n).padStart(2, "0");
const minLabel = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(getLang() === "en" ? "en-GB" : "de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna",
  });
}

function fmtDayShort(day) {
  const d = new Date(day + "T12:00:00");
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

/**
 * Einträge eines Tages in eine gemeinsame, sortierbare Form bringen.
 * Ganztägige Einträge kommen nach vorn, danach nach Uhrzeit.
 */
function entriesOf(day, { events, meetings, tasks, conflictIds, companyColor }) {
  const out = [];

  for (const ev of events) {
    if (!dayKeysOf(ev).includes(day)) continue;
    out.push({
      key: ev.id, sort: ev.allDay ? -1 : minutesOfDay(ev.start),
      time: ev.allDay ? L("ganztägig", "all day") : fmtTime(ev.start),
      title: ev.title || "—", meta: ev.location || "",
      tag: SOURCE_COMPANY[ev.source] || ev.source,
      color: companyColor(SOURCE_COMPANY[ev.source]),
      editable: false, conflict: conflictIds.has(ev.id),
    });
  }

  for (const m of meetings) {
    if (m?.date !== day) continue;
    const sMin = hhmmToMin(m.start);
    out.push({
      key: "meeting:" + m.id, sort: sMin === null ? -1 : sMin,
      time: sMin === null ? L("ohne Uhrzeit", "no time") : minLabel(sMin),
      title: m.title || L("Meeting", "Meeting"),
      meta: m.location || m.type || "",
      tag: L("Meeting", "Meeting"), color: companyColor("Eurowings"),
      editable: true, kind: "meeting", ref: m,
    });
  }

  for (const t of tasks) {
    if (t?.due !== day) continue;
    out.push({
      key: "task:" + t.id, sort: 1441, time: L("Aufgabe", "Task"),
      title: t.title || "—", meta: t.category || "",
      tag: t.company || "", color: companyColor(t.company),
      editable: true, kind: "task", ref: t,
    });
  }

  return out.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

function Row({ e, onPick }) {
  const Icon = e.editable ? Pencil : Lock;
  const inner = (
    <>
      <span className="ct-time">{e.time}</span>
      <span className="ct-main">
        <span className="ct-title">
          {e.title}
          {e.conflict && <AlertTriangle size={12} className="ct-clash" />}
          <Icon size={11} />
        </span>
        {e.meta && <span className="ct-meta">{e.meta}</span>}
      </span>
      {e.tag && <span className="ct-tag" style={{ color: e.color, borderColor: e.color }}>{e.tag}</span>}
    </>
  );
  const cls = "ct-row" + (e.conflict ? " clash" : "");
  const style = { borderLeftColor: e.color };
  if (e.editable && onPick) {
    return <button type="button" className={cls} style={style} onClick={() => onPick(e)}>{inner}</button>;
  }
  return <div className={cls} style={style} role="note">{inner}</div>;
}

export default function CalendarToday({
  cal, companyColor, tasks = [], meetings = [], onPickTask, onPickMeeting, onOpenCalendar,
}) {
  const { configured, events } = cal;
  const today = dayKey(Date.now());
  const tomorrow = shiftDay(today, 1);

  const conflictIds = useMemo(
    () => new Set(conflictsInDays(events, 14).flatMap((p) => [p.a.id, p.b.id])),
    [events],
  );

  const ctx = { events, meetings, tasks, conflictIds, companyColor };
  const todayList = useMemo(() => entriesOf(today, ctx), [today, events, meetings, tasks, conflictIds]);
  const tomorrowList = useMemo(() => entriesOf(tomorrow, ctx).slice(0, TOMORROW_MAX), [tomorrow, events, meetings, tasks, conflictIds]);
  const clashes = useMemo(() => conflictsInDays(events, 14), [events]);

  if (!configured) return null;

  function pick(e) {
    if (e.kind === "task") onPickTask?.(e.ref);
    else if (e.kind === "meeting") onPickMeeting?.(e.ref);
  }

  return (
    <section className="ct-wrap">
      <div className="card">
        <div className="ct-head">
          <h2>{L("Heute", "Today")}</h2>
          <button className="link" onClick={onOpenCalendar}>
            {L("ganze Woche", "whole week")} <ChevronRight size={14} />
          </button>
        </div>

        {todayList.length === 0 ? (
          <div className="dash-empty">{L("Heute steht nichts an.", "Nothing scheduled today.")}</div>
        ) : (
          <div className="ct-list">
            {todayList.map((e) => <Row key={e.key} e={e} onPick={pick} />)}
          </div>
        )}

        {tomorrowList.length > 0 && (
          <div className="ct-tom">
            <h3>{L("Morgen", "Tomorrow")}</h3>
            <div className="ct-list">
              {tomorrowList.map((e) => <Row key={e.key} e={e} onPick={pick} />)}
            </div>
          </div>
        )}

        {clashes.length > 0 && (
          <div className="ct-clashes">
            <h3><AlertTriangle size={14} /> {L("Konflikte der nächsten 14 Tage", "Conflicts in the next 14 days")}</h3>
            <ul>
              {clashes.map((p, i) => (
                <li key={p.a.id + p.b.id + i}>
                  <span className="ct-clash-when">
                    {fmtDayShort(dayKey(p.from))} · {fmtTime(new Date(p.from).toISOString())}–{fmtTime(new Date(p.to).toISOString())}
                  </span>
                  <span className="ct-clash-what">
                    {p.a.title || "—"} <em>({SOURCE_COMPANY[p.a.source] || p.a.source})</em>
                    {" ↔ "}
                    {p.b.title || "—"} <em>({SOURCE_COMPANY[p.b.source] || p.b.source})</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
