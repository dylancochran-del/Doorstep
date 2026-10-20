"use client";
import { use, useEffect, useState } from "react";
import { api, postJSON } from "../../ui";

export default function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [email, setEmail] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ email: string }>(`/api/reset?token=${encodeURIComponent(token)}`).then((d) => setEmail(d.email)).catch((e) => setBad(e.message)); }, [token]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = new FormData(e.currentTarget).get("password");
    setBusy(true); setError(null);
    try { await postJSON("/api/reset", { token, password: pw }); location.href = "/"; }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  if (bad) return <main className="page"><div className="error">{bad}</div></main>;
  return (
    <main className="page" style={{ justifyContent: "center", paddingBottom: 32 }}>
      <div className="hero"><img src="/icon-192.png" alt="" className="avatar" /><div><h1>New password</h1><p>{email ?? "Checking your link…"}</p></div></div>
      <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" disabled={busy || !email}>{busy ? "Saving…" : "Save and sign in"}</button>
      </form>
    </main>
  );
}
