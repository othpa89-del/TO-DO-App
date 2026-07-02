import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { registerSW } from "virtual:pwa-register";

// PWA-Update: neue Version im Hintergrund vorbereiten und dem Nutzer per Banner
// anbieten (statt still zu warten, bis die App irgendwann neu gestartet wird).
const updateSW = registerSW({
  onNeedRefresh() { try { window.dispatchEvent(new CustomEvent("ctc:sw-update")); } catch {} },
});
if (typeof window !== "undefined") window.__ctcUpdateSW = updateSW;

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

// ---------------------------------------------------------------------------
//  Offline-Fähigkeit: lokaler Cache (localStorage) + Sync-Queue.
//  - Schreibvorgänge gehen optimistisch sofort durch und werden lokal gespeichert.
//  - Schlägt der Cloud-Write fehl (offline), landet er in einer Queue und wird
//    automatisch synchronisiert, sobald wieder Verbindung besteht.
//  - Lesevorgänge nutzen offline den lokalen Cache.
// ---------------------------------------------------------------------------
const LS_CACHE = "kv_cache_v1";
const LS_QUEUE = "kv_queue_v1";
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const isOffline = () => (typeof navigator !== "undefined" && navigator.onLine === false);
const cKey = (key) => currentUserId + ":" + key;
const cacheRead = (key) => { const c = lsGet(LS_CACHE, {}); const k = cKey(key); return k in c ? c[k] : null; };
const cacheWrite = (key, value) => { const c = lsGet(LS_CACHE, {}); c[cKey(key)] = value; return lsSet(LS_CACHE, c); };
const cacheDelete = (key) => { const c = lsGet(LS_CACHE, {}); delete c[cKey(key)]; return lsSet(LS_CACHE, c); };

// Zeitstempel des letzten EIGENEN Schreibvorgangs. Eigene Cloud-Writes erzeugen
// ebenfalls ein Realtime-Event (Self-Echo); innerhalb dieses Fensters ignorieren
// wir es, damit nicht nach jeder lokalen Änderung alle Daten neu geladen werden
// (vermeidet Mehrfach-Reloads und das Überschreiben frischer lokaler Änderungen).
let lastSelfWrite = 0;
const markSelfWrite = () => { lastSelfWrite = Date.now(); };

function emitSync(state) {
  const pending = lsGet(LS_QUEUE, []).length;
  window.dispatchEvent(new CustomEvent("ctc:sync", { detail: { state, pending, online: !isOffline() } }));
}
function enqueue(op, key, value) {
  const q = lsGet(LS_QUEUE, []).filter((x) => !(x.userId === currentUserId && x.key === key));
  q.push({ op, key, value, userId: currentUserId });
  const ok = lsSet(LS_QUEUE, q);
  emitSync("pending");
  return ok;
}
let syncing = false;
let rerunQueued = false;
async function flushQueue() {
  // Läuft bereits ein Flush, nicht abbrechen und vergessen, sondern danach
  // einmal nachfeuern (z. B. wenn "online"-Event oder Login während eines
  // laufenden Uploads erneut flushen will).
  if (syncing) { rerunQueued = true; return; }
  if (isOffline()) { emitSync("offline"); return; }
  let q = lsGet(LS_QUEUE, []);
  if (!q.length) { emitSync("synced"); return; }
  syncing = true; emitSync("syncing");
  try {
    while (q.length) {
      const item = q[0];
      try {
        if (item.op === "set") {
          const { error } = await supabase.from("kv").upsert(
            { user_id: item.userId, key: item.key, value: item.value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
          if (error) throw error;
        } else if (item.op === "delete") {
          const { error } = await supabase.from("kv").delete().eq("user_id", item.userId).eq("key", item.key);
          if (error) throw error;
        }
        markSelfWrite();
        q.shift(); lsSet(LS_QUEUE, q);
      } catch { break; } // weiter offline -> später erneut
    }
  } finally {
    syncing = false;
    emitSync(lsGet(LS_QUEUE, []).length ? "pending" : "synced");
    if (rerunQueued && !isOffline() && lsGet(LS_QUEUE, []).length) { rerunQueued = false; flushQueue(); }
    else rerunQueued = false;
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", flushQueue);
  setInterval(() => { if (currentUserId && !isOffline() && lsGet(LS_QUEUE, []).length) flushQueue(); }, 25000);
}

window.storage = {
  async get(key) {
    if (!currentUserId) return null;
    if (isOffline()) { const v = cacheRead(key); return v == null ? null : { key, value: v }; }
    try {
      const { data, error } = await supabase.from("kv").select("value").eq("user_id", currentUserId).eq("key", key).maybeSingle();
      if (error) throw error;
      if (data) { cacheWrite(key, data.value); return { key, value: data.value }; }
      const cv = cacheRead(key); // evtl. lokal angelegt, noch nicht synchronisiert
      return cv == null ? null : { key, value: cv };
    } catch { const v = cacheRead(key); return v == null ? null : { key, value: v }; }
  },
  async set(key, value) {
    if (!currentUserId) throw new Error("Nicht angemeldet");
    const cached = cacheWrite(key, value); // sofort lokal sichern
    try {
      if (isOffline()) throw new Error("offline");
      const { error } = await supabase.from("kv").upsert(
        { user_id: currentUserId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
      if (error) throw error;
      markSelfWrite();
      return { key, value };
    } catch {
      // Offline/Fehler: in Queue legen. Konnten WEDER Cache NOCH Queue gespeichert
      // werden (z. B. localStorage voll wegen großer Base64-Anhänge), ist die
      // Änderung NICHT gesichert -> Fehler werfen, statt Erfolg vorzutäuschen.
      const queued = enqueue("set", key, value);
      if (!cached && !queued) throw new Error("Lokaler Speicher voll – Änderung nicht gesichert. Bitte Anhänge verkleinern oder online speichern.");
      return { key, value }; // optimistischer Erfolg
    }
  },
  async delete(key) {
    if (!currentUserId) return { key, deleted: true };
    cacheDelete(key);
    try {
      if (isOffline()) throw new Error("offline");
      const { error } = await supabase.from("kv").delete().eq("user_id", currentUserId).eq("key", key);
      if (error) throw error;
      markSelfWrite();
    } catch { enqueue("delete", key, null); }
    return { key, deleted: true };
  },
  async list(prefix = "") {
    if (!currentUserId) return { keys: [] };
    try {
      if (isOffline()) throw new Error("offline");
      const { data } = await supabase.from("kv").select("key").eq("user_id", currentUserId);
      return { keys: (data || []).map((r) => r.key).filter((k) => k.startsWith(prefix)) };
    } catch {
      const c = lsGet(LS_CACHE, {}); const pre = currentUserId + ":";
      return { keys: Object.keys(c).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)).filter((k) => k.startsWith(prefix)) };
    }
  },
};

// --- Realtime: Änderungen -> App benachrichtigen (entprellt) ---
let channel = null;
let debounce = null;
function notifyRemote() {
  // Self-Echo unterdrücken: kommt das Realtime-Event direkt nach einem eigenen
  // Schreibvorgang, ist es nur das Echo der eigenen Änderung – kein Reload nötig.
  // Änderungen von ANDEREN Geräten liegen außerhalb dieses Fensters und laden neu.
  if (Date.now() - lastSelfWrite < 4000) return;
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
    if (session) { subscribeRealtime(session.access_token); flushQueue(); }
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
