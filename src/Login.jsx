import React, { useState } from "react";

export default function Login({ supabase }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
        if (error) throw error;
        setMsg("Konto erstellt. Du kannst dich jetzt anmelden.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message || "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.brand}>TO DO APP</div>
        <div style={S.sub}>CTC Aufgaben · Anmeldung</div>
        <input style={S.inp} type="email" placeholder="E-Mail" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input style={S.inp} type="password" placeholder="Passwort" value={pw}
          onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "signin" ? "Anmelden" : "Konto erstellen"}
        </button>
        {err && <div style={S.err}>{err}</div>}
        {msg && <div style={S.msg}>{msg}</div>}
        <button style={S.link} onClick={() => { setErr(""); setMsg(""); setMode(mode === "signin" ? "signup" : "signin"); }}>
          {mode === "signin" ? "Noch kein Konto? Registrieren" : "Schon ein Konto? Anmelden"}
        </button>
      </div>
    </div>
  );
}

const S = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F9FA", fontFamily: "Mulish, system-ui, sans-serif", padding: 20 },
  card: { width: "100%", maxWidth: 360, background: "#fff", border: "1px solid #D7D7D7", borderRadius: 14, padding: 28, boxShadow: "0 8px 30px rgba(0,0,0,.06)", display: "flex", flexDirection: "column", gap: 12 },
  brand: { fontSize: 30, fontWeight: 900, color: "#AF1E65", letterSpacing: "-0.02em" },
  sub: { fontSize: 13, color: "#787878", marginBottom: 6, marginTop: -6 },
  inp: { padding: "11px 12px", border: "1px solid #D7D7D7", borderRadius: 8, fontSize: 15, fontFamily: "inherit" },
  btn: { padding: "11px 12px", background: "#AF1E65", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  link: { background: "none", border: "none", color: "#871C54", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 },
  err: { color: "#D32F2F", fontSize: 13, fontWeight: 600 },
  msg: { color: "#1A7F45", fontSize: 13, fontWeight: 600 },
};
