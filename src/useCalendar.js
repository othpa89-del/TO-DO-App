// React-Hook für die synchronisierten Kalendertermine.
//
// Abschnitt 4.2 der Spezifikation: Abruf beim Start, beim Zurückkehren in die
// App (visibilitychange) und alle 15 Minuten bei geöffneter App. Der letzte
// erfolgreiche Stand wird lokal zwischengespeichert und offline weiter
// angezeigt, mit sichtbarem Zeitpunkt.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cacheClear, cacheLoad, cacheSave, defaultRange, fetchCalendar,
  filterBySources, isConfigured, loadSettings, persistSettings, testConnection,
} from "./calendarSync.js";

const REFRESH_MS = 15 * 60 * 1000;

export function useCalendar(enabled = true) {
  const [settings, setSettings] = useState(null); // null = noch nicht geladen
  const [feed, setFeed] = useState(null);         // { generatedAt, events, errors }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const alive = useRef(true);
  const abortRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      try { abortRef.current?.abort(); } catch { /* egal */ }
    };
  }, []);

  // Einstellungen und letzten Stand laden. Der Zwischenspeicher kommt zuerst,
  // damit auch offline sofort etwas zu sehen ist.
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    (async () => {
      const cached = await cacheLoad();
      if (on && cached) setFeed(cached);
      const s = await loadSettings();
      if (!on) return;
      settingsRef.current = s;
      setSettings(s);
    })();
    return () => { on = false; };
  }, [enabled]);

  const refresh = useCallback(async () => {
    const s = settingsRef.current;
    if (!s || !isConfigured(s)) return false;
    try { abortRef.current?.abort(); } catch { /* egal */ }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const data = await fetchCalendar(s, { range: defaultRange(), signal: ctrl.signal });
      if (!alive.current) return false;
      setFeed(data);
      setError("");
      cacheSave(data).catch(() => {});
      return true;
    } catch (err) {
      if (err?.name === "AbortError" || !alive.current) return false;
      setError(err?.message || String(err));
      return false;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  const configured = isConfigured(settings);

  // Abruf beim Start, beim Zurückkehren in die App, alle 15 Minuten und
  // sobald die Verbindung wieder steht.
  useEffect(() => {
    if (!enabled || !configured) return;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onOnline = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, configured, refresh, settings?.url, settings?.token]);

  const save = useCallback(async (next) => {
    const s = await persistSettings(next);
    settingsRef.current = s;
    setSettings(s);
    setError("");
    if (!isConfigured(s)) {
      setFeed(null);
      await cacheClear();
    }
    return s;
  }, []);

  const test = useCallback((candidate) => testConnection(candidate || settingsRef.current), []);

  // Nur die eingeschalteten Quellen anzeigen; ausgeblendete bleiben im
  // Zwischenspeicher, damit das Umschalten ohne neuen Abruf wirkt.
  const events = useMemo(
    () => filterBySources(feed?.events || [], settings?.sources),
    [feed, settings?.sources],
  );

  const sourceErrors = useMemo(
    () => (feed?.errors || []).filter((e) => settings?.sources?.[e.source] !== false),
    [feed, settings?.sources],
  );

  return {
    settings, settingsLoaded: settings !== null, configured,
    events, allEvents: feed?.events || [], sourceErrors,
    generatedAt: feed?.generatedAt || null,
    loading, error,
    refresh, save, test,
  };
}
