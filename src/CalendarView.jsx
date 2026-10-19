// Ansicht „Kalender": Einrichtung des Kalender-Syncs, Stand der letzten
// Aktualisierung und die synchronisierten Termine.
//
// Fremdtermine sind ausdrücklich schreibgeschützt (Abschnitt 4.3): kein
// Bearbeiten, kein Löschen, erkennbar am Schloss-Symbol.

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, RefreshCw, Settings, X } from "lucide-react";
import { L, getLang, useLang } from "./i18n.js";
import { SOURCE_COMPANY, dayKey, groupByDay } from "./calendar.js";
import { SOURCE_KEYS, normalizeSettings } from "./calendarSync.js";

const sourceLabel = (s) => SOURCE_COMPANY[s] || s;

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(getLang() === "en" ? "en-GB" : "de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna",
  });
}

function fmtDayLong(day) {
  const d = new Date(day + "T12:00:00");
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", {
    weekday: "long", day: "2-digit", month: "long",
  });
}

function fmtStand(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = dayKey(Date.now());
  const sameDay = dayKey(d.getTime()) === today;
  const time = d.toLocaleTimeString(getLang() === "en" ? "en-GB" : "de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna",
  });
  if (sameDay) return time;
  return `${fmtDayLong(dayKey(d.getTime()))}, ${time}`;
}

export default function CalendarView({ cal, companyColor, flash }) {
  useLang();
  const { settings, settingsLoaded, configured, events, sourceErrors, generatedAt, loading, error } = cal;

  const [form, setForm] = useState(() => normalizeSettings(settings));
  const [open, setOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Gespeicherte Werte übernehmen, sobald sie geladen sind oder sich auf
  // einem anderen Gerät geändert haben.
  useEffect(() => {
    if (settings) setForm(normalizeSettings(settings));
  }, [settings]);

  // Ohne Einrichtung die Eingabefelder gleich aufklappen.
  useEffect(() => {
    if (settingsLoaded && !configured) setOpen(true);
  }, [settingsLoaded, configured]);

  const today = dayKey(Date.now());
  const upcoming = useMemo(
    () => events.filter((e) => (e.end || e.start) >= today),
    [events, today],
  );
  const byDay = useMemo(() => groupByDay(upcoming), [upcoming]);
  const days = useMemo(
    () => [...byDay.keys()].filter((d) => d >= today).sort().slice(0, 14),
    [byDay, today],
  );

  async function onSave(next) {
    try {
      await cal.save(next);
      flash?.(L("Kalender-Sync gespeichert.", "Calendar sync saved."));
    } catch {
      flash?.(L("Speichern fehlgeschlagen.", "Saving failed."));
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    const r = await cal.test(form);
    setTesting(false);
    setTestResult(r);
  }

  function toggleSource(key) {
    const next = { ...form, sources: { ...form.sources, [key]: !form.sources[key] } };
    setForm(next);
    if (configured) onSave(next);
  }

  async function onRemove() {
    if (!window.confirm(L("Einrichtung des Kalender-Syncs entfernen? Die Termine werden dann nicht mehr abgerufen.", "Remove the calendar sync setup? Appointments will no longer be fetched."))) return;
    const cleared = { url: "", token: "", sources: form.sources };
    setForm(cleared);
    setTestResult(null);
    await onSave(cleared);
  }

  return (
    <div className="calwrap">
      {/* ---------------- Stand und Quellen ---------------- */}
      <div className="card">
        <div className="cal-head">
          <h2>{L("Kalender", "Calendar")}</h2>
          <div className="cal-head-right">
            {configured && (
              <span className="cal-stand">
                {generatedAt
                  ? L("Stand: ", "As of: ") + fmtStand(generatedAt)
                  : L("noch nicht abgerufen", "not fetched yet")}
              </span>
            )}
            <button className="btn out" onClick={() => cal.refresh()} disabled={!configured || loading}
              aria-label={L("Termine neu abrufen", "Fetch appointments again")}>
              <RefreshCw size={15} className={loading ? "spin" : ""} /> {L("Aktualisieren", "Refresh")}
            </button>
            <button className="btn out" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <Settings size={15} /> {L("Einstellungen", "Settings")}
            </button>
          </div>
        </div>

        <p className="hint">
          {L("Termine aus Outlook und den anderen Kalendern werden nur angezeigt, nicht verändert. Eigene Aufgaben und Meetings bleiben wie bisher bearbeitbar.",
             "Appointments from Outlook and the other calendars are only displayed, never changed. Your own tasks and meetings stay editable as before.")}
        </p>

        {configured && (
          <div className="cal-sources">
            {SOURCE_KEYS.map((k) => {
              const on = form.sources[k] !== false;
              const col = companyColor(SOURCE_COMPANY[k]);
              const count = events.filter((e) => e.source === k).length;
              return (
                <button key={k} className={"cal-src" + (on ? " on" : "")}
                  style={on ? { borderColor: col, color: col } : undefined}
                  role="checkbox" aria-checked={on} onClick={() => toggleSource(k)}>
                  <span className="cal-dot" style={{ background: on ? col : "#C7C7C7" }} />
                  {sourceLabel(k)}
                  {on && <em>{count}</em>}
                </button>
              );
            })}
          </div>
        )}

        {error && <div className="cal-note warn"><AlertTriangle size={14} /> {error}</div>}
        {sourceErrors.map((e) => (
          <div key={e.source} className="cal-note warn">
            <AlertTriangle size={14} /> {sourceLabel(e.source)}: {e.message}
          </div>
        ))}
        {configured && !loading && !error && !generatedAt && (
          <div className="cal-note">{L("Noch kein Stand vorhanden – „Aktualisieren\" antippen.", "No data yet – tap „Refresh“.")}</div>
        )}
      </div>

      {/* ---------------- Einstellungen ---------------- */}
      {open && (
        <div className="card calset">
          <h2>{L("Kalender-Sync einrichten", "Set up calendar sync")}</h2>
          <p className="hint">
            {L("Die Adresse der Supabase-Function und das Token. Beides wird nur in deinem eigenen Konto gespeichert und steht nirgends im Programmcode. Die Kalender-Links selbst liegen ausschließlich als Supabase-Secrets auf dem Server.",
               "The address of the Supabase function and the token. Both are stored only in your own account and appear nowhere in the program code. The calendar links themselves live exclusively as Supabase secrets on the server.")}
          </p>
          <label className="cal-field">
            <span>{L("Proxy-Adresse", "Proxy address")}</span>
            <input type="url" inputMode="url" autoComplete="off" spellCheck="false"
              placeholder="https://…supabase.co/functions/v1/calendar-feed"
              value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </label>
          <label className="cal-field">
            <span>{L("Token", "Token")}</span>
            <span className="cal-token">
              <input type={showToken ? "text" : "password"} autoComplete="off" spellCheck="false"
                placeholder={L("langer Zufallswert", "long random value")}
                value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
              <button className="link" onClick={() => setShowToken((v) => !v)}>
                {showToken ? L("verbergen", "hide") : L("anzeigen", "show")}
              </button>
            </span>
          </label>
          <div className="data-row">
            <button className="btn out" onClick={onTest} disabled={testing || !form.url || !form.token}>
              {testing ? L("prüfe …", "testing …") : L("Verbindung testen", "Test connection")}
            </button>
            <button className="btn" onClick={() => onSave(form)} disabled={!form.url || !form.token}>
              <Check size={15} /> {L("Speichern", "Save")}
            </button>
            {configured && (
              <button className="link" onClick={onRemove}>
                <X size={14} /> {L("Einrichtung entfernen", "Remove setup")}
              </button>
            )}
          </div>
          {testResult && (
            <div className={"cal-note" + (testResult.ok ? " good" : " warn")}>
              {testResult.ok ? (
                <>
                  <Check size={14} /> {L("Verbindung steht. Termine in den nächsten 7 Tagen: ", "Connection works. Appointments in the next 7 days: ")}{testResult.events}
                  {testResult.errors?.length ? " · " + testResult.errors.map((e) => `${sourceLabel(e.source)}: ${e.message}`).join(" · ") : ""}
                </>
              ) : (
                <><AlertTriangle size={14} /> {testResult.message}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Termine ---------------- */}
      {configured && (
        <div className="card">
          <h2>{L("Nächste Termine", "Upcoming appointments")}</h2>
          {days.length === 0 ? (
            <div className="empty">{L("Keine Termine im abgerufenen Zeitraum.", "No appointments in the fetched period.")}</div>
          ) : (
            <ul className="cal-list">
              {days.map((day) => (
                <li key={day} className="cal-day">
                  <h3 className={"cal-dayhead" + (day === today ? " today" : "")}>
                    {fmtDayLong(day)}{day === today ? " · " + L("heute", "today") : ""}
                  </h3>
                  <ul className="cal-events">
                    {byDay.get(day).map((ev) => {
                      const col = companyColor(SOURCE_COMPANY[ev.source]);
                      return (
                        <li key={ev.id + day} className={"cal-ev" + (ev.allDay ? " allday" : "")}
                          style={{ borderLeftColor: col }}>
                          <span className="cal-ev-time">
                            {ev.allDay ? L("ganztägig", "all day") : `${fmtTime(ev.start)}–${fmtTime(ev.end)}`}
                          </span>
                          <span className="cal-ev-main">
                            <span className="cal-ev-title">
                              {ev.title || "—"}
                              <Lock size={12} aria-label={L("schreibgeschützt", "read-only")} />
                            </span>
                            {ev.location && <span className="cal-ev-loc">{ev.location}</span>}
                          </span>
                          <span className="cal-ev-src" style={{ color: col, borderColor: col }}>
                            {sourceLabel(ev.source)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
