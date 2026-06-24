import React, { useState } from "react";
import { CalendarDays } from "lucide-react";

// muss mit REMEMBER_KEY in main.jsx übereinstimmen
const REMEMBER_KEY = "ctc_remember";

export default function Login({ supabase, recovery = false, onDone, notice = "" }) {
  // signin | signup | forgot | reset
  const [mode, setMode] = useState(recovery ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [remember, setRemember] = useState(() => {
    try { return window.localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
  });

  function toggleRemember(val) {
    setRemember(val);
    try { window.localStorage.setItem(REMEMBER_KEY, val ? "1" : "0"); } catch {}
  }

  async function submit() {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
        if (error) throw error;
        setMsg("Konto erstellt. Du kannst dich jetzt anmelden.");
        setMode("signin");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.href });
        if (error) throw error;
        setMsg("Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte E-Mail prüfen.");
      } else if (mode === "reset") {
        if ((pw || "").length < 6) throw new Error("Passwort muss mindestens 6 Zeichen haben.");
        if (pw !== pw2) throw new Error("Die Passwörter stimmen nicht überein.");
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) throw error;
        setMsg("Passwort geändert. Du bist jetzt angemeldet.");
        if (onDone) setTimeout(() => onDone(), 800);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message || "Vorgang fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const sub = mode === "forgot" ? "Passwort zurücksetzen" : mode === "reset" ? "Neues Passwort" : "Anmeldung";
  const cta = mode === "signin" ? "Anmelden" : mode === "signup" ? "Konto erstellen" : mode === "forgot" ? "Link senden" : "Passwort speichern";

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.brandRow}>
          <CalendarDays size={28} strokeWidth={2.2} color="#FFFFFF" />
          <span style={S.brand}>Kalender</span>
        </div>
        <div style={S.sub}>{sub}</div>

        {notice && <div style={S.err}>{notice}</div>}

        {mode !== "reset" && (
          <input style={S.inp} type="email" placeholder="E-Mail" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        )}

        {mode !== "forgot" && (
          <input style={S.inp} type="password" placeholder={mode === "reset" ? "Neues Passwort" : "Passwort"} value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && mode !== "reset" && submit()} />
        )}

        {mode === "reset" && (
          <input style={S.inp} type="password" placeholder="Neues Passwort wiederholen" value={pw2}
            onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        )}

        {(mode === "signin" || mode === "signup") && (
          <label style={S.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => toggleRemember(e.target.checked)}
              style={{ width: 16, height: 16, margin: 0, accentColor: "#2E5BFF" }} />
            Angemeldet bleiben
          </label>
        )}

        <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "…" : cta}
        </button>

        {err && <div style={S.err}>{err}</div>}
        {msg && <div style={S.msg}>{msg}</div>}

        {mode === "signin" && (
          <button style={S.link} onClick={() => { setErr(""); setMsg(""); setMode("forgot"); }}>
            Passwort vergessen?
          </button>
        )}

        {mode !== "reset" && (
          <button style={S.link} onClick={() => {
            setErr(""); setMsg("");
            setMode(mode === "signin" ? "signup" : "signin");
          }}>
            {mode === "signin" ? "Noch kein Konto? Registrieren"
              : mode === "signup" ? "Schon ein Konto? Anmelden"
              : "Zurück zur Anmeldung"}
          </button>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1426", fontFamily: "Mulish, system-ui, sans-serif", padding: 20 },
  card: { width: "100%", maxWidth: 360, background: "#15233F", border: "1px solid #2A3C5E", borderRadius: 14, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", gap: 12 },
  brandRow: { display: "flex", alignItems: "center", gap: 10 },
  brand: { fontSize: 30, fontWeight: 900, color: "#FFFFFF", letterSpacing: "-0.02em" },
  sub: { fontSize: 13, color: "#9DB0CE", marginBottom: 6, marginTop: -6 },
  inp: { padding: "11px 12px", border: "1px solid #2A3C5E", borderRadius: 8, fontSize: 15, fontFamily: "inherit", background: "#0F1C33", color: "#E8EDF6" },
  btn: { padding: "11px 12px", background: "#2E5BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  remember: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9DB0CE", fontWeight: 600, cursor: "pointer", marginTop: 2 },
  link: { background: "none", border: "none", color: "#7FA0FF", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 },
  err: { color: "#FF6B6B", fontSize: 13, fontWeight: 600 },
  msg: { color: "#5BD68A", fontSize: 13, fontWeight: 600 },
};
