"use client";
import { useState } from "react";
import { postJSON } from "../ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await postJSON("/api/login", { email, password }); location.href = "/"; }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <main className="page" style={{ justifyContent: "center", paddingBottom: 32 }}>
      <div className="hero"><img src="/icon-192.png" alt="" className="avatar" /><div><h1>Doorstep</h1><p>Florida All Risk canvassing</p></div></div>
      <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted" style={{ textAlign: "center", margin: 0 }}>New here? Use the invite link Dylan sent you. Forgot your password? Text Dylan for a reset link.</p>
    </main>
  );
}
