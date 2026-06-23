import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
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

  // WICHTIG: synchron im Render setzen. React führt die Effects von <App>
  // (Kind) VOR den Effects von Root (Eltern) aus – würde currentUserId erst
  // im Effect gesetzt, lädt App beim Öffnen mit user_id=null und die
  // Cloud-Daten erscheinen "weg". Hier ist die id garantiert vorher gesetzt.
  currentUserId = session?.user?.id || null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) subscribeRealtime(session.access_token);
    else unsubscribeRealtime();
  }, [session]);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Mulish, system-ui, sans-serif", color: "#787878" }}>Lädt …</div>;
  }
  if (!session) return <Login supabase={supabase} />;

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
