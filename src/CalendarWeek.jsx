// Wochenansicht: Montag bis Sonntag, ganztägige Termine in einer eigenen
// Zeile oben, darunter das Zeitraster.
//
// Fremdtermine aus dem Kalender-Sync sind schreibgeschützt (Schloss-Symbol,
// kein Klickziel). Eigene Aufgaben und Meetings sind gestrichelt umrandet,
// tragen ein Stift-Symbol und öffnen beim Antippen den Eintrag.

import React, { useMemo } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Pencil } from "lucide-react";
import { L, getLang } from "./i18n.js";
import { assignLanes, dayKeysOf, daySpanOf, hourRange, isoWeek } from "./calendar.js";

const PX_PER_HOUR = 46;
const MIN_BLOCK = 22;

const touchesDay = (item, day) =>
  item.day ? item.day === day : dayKeysOf(item).includes(day);

/** Zeitspanne als Text. Eigene Einträge liefern sie wörtlich mit. */
const timeRange = (item) =>
  item.timeLabel || `${fmtTime(item.start)}–${fmtTime(item.end)}`;

/** Beginn als Text, für die knappe Anzeige im Block. */
const timeStart = (item) =>
  item.timeLabel ? item.timeLabel.split("–")[0] : fmtTime(item.start);

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(getLang() === "en" ? "en-GB" : "de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna",
  });
}

function dayHead(day) {
  const d = new Date(day + "T12:00:00");
  const loc = getLang() === "en" ? "en-GB" : "de-DE";
  return {
    dow: d.toLocaleDateString(loc, { weekday: "short" }),
    num: d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" }),
  };
}

function weekLabel(days) {
  if (!days.length) return "";
  const loc = getLang() === "en" ? "en-GB" : "de-DE";
  const a = new Date(days[0] + "T12:00:00");
  const b = new Date(days[6] + "T12:00:00");
  const sameMonth = a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString(loc, sameMonth ? { day: "2-digit" } : { day: "2-digit", month: "short" });
  const right = b.toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric" });
  return `${L("KW", "Week")} ${isoWeek(days[0])} · ${left}.–${right}`;
}

/** Ein Eintrag im Raster oder in der Ganztagszeile. */
function Entry({ item, className, style, onPick }) {
  const title = item.title || "—";
  const Icon = item.editable ? Pencil : Lock;
  const label = [
    item.allDay ? L("ganztägig", "all day") : timeRange(item),
    title, item.location, item.sourceLabel,
    item.conflict ? L("Konflikt mit einem anderen Termin", "Conflict with another appointment") : "",
  ].filter(Boolean).join(" · ");

  const inner = (
    <>
      {!item.allDay && <span className="wk-time">{timeStart(item)}</span>}
      <span className="wk-title">{title}</span>
      {item.location && <span className="wk-loc">{item.location}</span>}
      <span className="wk-icons">
        {item.conflict && <AlertTriangle size={11} />}
        <Icon size={11} />
      </span>
    </>
  );

  const cls = [className, "wk-e", item.editable ? "own" : "sync", item.conflict ? "clash" : ""]
    .filter(Boolean).join(" ");
  const css = { ...style, borderColor: item.color, "--ec": item.color };

  if (item.editable && onPick) {
    return (
      <button type="button" className={cls} style={css} title={label} aria-label={label}
        onClick={() => onPick(item)}>{inner}</button>
    );
  }
  return <div className={cls} style={css} title={label} aria-label={label} role="note">{inner}</div>;
}

export default function CalendarWeek({ days, items, today, onPick, onShift, onToday }) {
  const perDay = useMemo(() => days.map((day) => {
    const allDay = items.filter((it) => it.allDay && touchesDay(it, day));
    const timed = assignLanes(
      items
        .filter((it) => !it.allDay)
        .map((it) => {
          const span = daySpanOf(it, day);
          return span ? { ...span, item: it } : null;
        })
        .filter(Boolean),
    );
    return { day, allDay, timed };
  }), [days, items]);

  const range = useMemo(
    () => hourRange(perDay.flatMap((d) => d.timed)),
    [perDay],
  );
  const hours = [];
  for (let h = range.from; h < range.to; h++) hours.push(h);
  const bodyHeight = (range.to - range.from) * PX_PER_HOUR;

  // Markierung der aktuellen Uhrzeit, wenn die laufende Woche gezeigt wird.
  const nowTop = useMemo(() => {
    if (!days.includes(today)) return null;
    const n = new Date();
    const min = n.getHours() * 60 + n.getMinutes();
    if (min < range.from * 60 || min > range.to * 60) return null;
    return ((min - range.from * 60) / 60) * PX_PER_HOUR;
  }, [days, today, range.from, range.to]);

  const hasAllDay = perDay.some((d) => d.allDay.length > 0);

  return (
    <div className="wk">
      <div className="wk-nav">
        <button className="btn out" onClick={() => onShift(-7)} aria-label={L("Vorige Woche", "Previous week")}>
          <ChevronLeft size={15} />
        </button>
        <button className="btn out" onClick={onToday}>{L("Diese Woche", "This week")}</button>
        <button className="btn out" onClick={() => onShift(7)} aria-label={L("Nächste Woche", "Next week")}>
          <ChevronRight size={15} />
        </button>
        <span className="wk-label">{weekLabel(days)}</span>
      </div>

      <div className="wk-grid">
        <div className="wk-corner" />
        {perDay.map(({ day }) => {
          const h = dayHead(day);
          return (
            <div key={day} className={"wk-head" + (day === today ? " today" : "")}>
              <span className="wk-dow">{h.dow}</span><span className="wk-num">{h.num}</span>
            </div>
          );
        })}

        {hasAllDay && <div className="wk-allday-lbl">{L("ganztägig", "all day")}</div>}
        {hasAllDay && perDay.map(({ day, allDay }) => (
          <div key={"a" + day} className={"wk-allday" + (day === today ? " today" : "")}>
            {allDay.map((it) => (
              <Entry key={it.key + day} item={it} className="wk-chip" onPick={onPick} />
            ))}
          </div>
        ))}

        <div className="wk-hours" style={{ height: bodyHeight }}>
          {hours.map((h) => (
            <span key={h} className="wk-hour" style={{ top: (h - range.from) * PX_PER_HOUR }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {perDay.map(({ day, timed }) => (
          <div key={"b" + day} className={"wk-col" + (day === today ? " today" : "")} style={{ height: bodyHeight }}>
            {hours.map((h) => (
              <span key={h} className="wk-line" style={{ top: (h - range.from) * PX_PER_HOUR }} />
            ))}
            {nowTop !== null && day === today && <span className="wk-now" style={{ top: nowTop }} />}
            {timed.map((b) => {
              const top = ((b.startMin - range.from * 60) / 60) * PX_PER_HOUR;
              const height = Math.max(MIN_BLOCK, ((b.endMin - b.startMin) / 60) * PX_PER_HOUR);
              const width = 100 / b.lanes;
              return (
                <Entry key={b.item.key + day} item={b.item} className="wk-block" onPick={onPick}
                  style={{ top, height, left: `${b.lane * width}%`, width: `calc(${width}% - 3px)` }} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
