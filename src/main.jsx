import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// "Angemeldet bleiben": Bei aktiviertem Flag wird die Session in localStorage
// gespeichert (bleibt dauerhaft erhalten), sonst nur in sessionStorage (gilt bis
// der Browser/Tab geschlossen wird). Das Flag setzt der Login-Bildschirm.
export const REMEMBER_KEY = "ctc_remember";
const rememberStorage = {
  getItem(k) {
    try { return window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k); }
    catch { return null; }
  },
  setItem(k, v) {
    let remember = true;
    try { remember = window.localStorage.getItem(REMEMBER_KEY) !== "0"; } catch {}
    try {
      if (remember) { window.localStorage.setItem(k, v); window.sessionStorage.removeItem(k); }
      else { window.sessionStorage.setItem(k, v); window.localStorage.removeItem(k); }
    } catch {}
  },
  removeItem(k) {
    try { window.localStorage.removeItem(k); } catch {}
    try { window.sessionStorage.removeItem(k); } catch {}
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Implicit Flow: Reset-/Bestätigungslinks tragen die Sitzung im URL-Hash und
  // funktionieren so in JEDEM Browser (auch wenn die Mail-App einen anderen
  // Browser öffnet). PKCE würde denselben Browser wie beim Anfordern verlangen.
  auth: { storage: rememberStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
});

// ---------------------------------------------------------------------------
//  Cloud-Speicher (Supabase) als Ersatz für die Claude-interne window.storage.
//  Jede Zeile gehört dem angemeldeten Nutzer (user_id). Über Realtime werden
//  Änderungen an alle Geräte desselben Kontos live verteilt.
// ---------------------------------------------------------------------------
let currentUserId = null;

window.storage = {
  async get(key) {
    if (!currentUserId) return null;
    const { data, error } = await supabase
      .from("kv").select("value")
      .eq("user_id", currentUserId).eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? { key, value: data.value } : null;
  },
  async set(key, value) {
    if (!currentUserId) throw new Error("Nicht angemeldet");
    const { error } = await supabase.from("kv").upsert(
      { user_id: currentUserId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    if (error) throw error;
    return { key, value };
  },
  async delete(key) {
    if (!currentUserId) return { key, deleted: true };
    await supabase.from("kv").delete().eq("user_id", currentUserId).eq("key", key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    if (!currentUserId) return { keys: [] };
    const { data } = await supabase.from("kv").select("key").eq("user_id", currentUserId);
    return { keys: (data || []).map((r) => r.key).filter((k) => k.startsWith(prefix)) };
  },
  // Alle Zeilen mit gemeinsamem Präfix in EINER Abfrage (für Sammlungen, die
  // pro Element als eigene Zeile gespeichert werden -> robuste Mehrgeräte-Sync).
  async getAll(prefix = "") {
    if (!currentUserId) return { items: [] };
    let q = supabase.from("kv").select("key,value").eq("user_id", currentUserId);
    if (prefix) q = q.like("key", `${prefix}%`);
    const { data, error } = await q;
    if (error) throw error;
    return { items: (data || []).map((r) => ({ key: r.key, value: r.value })) };
  },
};

// --- Realtime: Änderungen -> App benachrichtigen (entprellt) ---
let channel = null;
let debounce = null;
function notifyRemote() {
  clearTimeout(debounce);
  debounce = setTimeout(() => window.dispatchEvent(new CustomEvent("ctc:remote")), 150);
}
function subscribeRealtime(token) {
  unsubscribeRealtime();
  if (token) supabase.realtime.setAuth(token);
  channel = supabase
    .channel("kv-sync")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "kv", filter: `user_id=eq.${currentUserId}` },
      () => notifyRemote())
    .subscribe();
}
function unsubscribeRealtime() {
  if (channel) { try { supabase.removeChannel(channel); } catch {} channel = null; }
}

// --- Auth-Gate ---
function Root() {
  const [session, setSession] = useState(undefined); // undefined = lädt
  const [recovery, setRecovery] = useState(false);   // Passwort-Zurücksetzen-Flow
  const [authNotice, setAuthNotice] = useState("");  // Fehler/Hinweis aus Reset-Link

  // WICHTIG: synchron im Render setzen. React führt die Effects von <App>
  // (Kind) VOR den Effects von Root (Eltern) aus – würde currentUserId erst
  // im Effect gesetzt, lädt App beim Öffnen mit user_id=null und die
  // Cloud-Daten erscheinen "weg". Hier ist die id garantiert vorher gesetzt.
  currentUserId = session?.user?.id || null;

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });

    // Reset-Link auswerten: type=recovery, ?code=… (PKCE) und Fehler sichtbar machen
    (async () => {
      try {
        const h = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
        const hp = new URLSearchParams(h);
        const qp = new URLSearchParams(window.location.search);
        const errDesc = hp.get("error_description") || qp.get("error_description");
        if (errDesc) setAuthNotice(decodeURIComponent(errDesc.replace(/\+/g, " ")));
        if (hp.get("type") === "recovery" || qp.get("type") === "recovery") setRecovery(true);
        const code = qp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) setAuthNotice(error.message);
          else setRecovery(true);
        }
      } catch (e) {
        setAuthNotice(e?.message || String(e));
      } finally {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) subscribeRealtime(session.access_token);
    else unsubscribeRealtime();
  }, [session]);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Mulish, system-ui, sans-serif", color: "#787878" }}>Lädt …</div>;
  }
  if (recovery) return <Login supabase={supabase} recovery notice={authNotice} onDone={() => setRecovery(false)} />;
  if (!session) return <Login supabase={supabase} notice={authNotice} />;

  // key = userId -> bei Anmeldung lädt App frisch aus der Cloud
  return (
    <div>
      <App key={currentUserId} />
      <button onClick={() => supabase.auth.signOut()}
        style={{ position: "fixed", bottom: "calc(12px + env(safe-area-inset-bottom))", right: "calc(12px + env(safe-area-inset-right))", zIndex: 50, fontFamily: "Mulish, sans-serif", fontSize: 12, fontWeight: 700, color: "#575757", background: "#fff", border: "1px solid #D7D7D7", borderRadius: 8, padding: "6px 10px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
        Abmelden
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
