"use client";
import { use, useEffect, useState } from "react";
import { api } from "../../ui";
import AvatarCrop from "../../AvatarCrop";

export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [email, setEmail] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ email: string }>(`/api/join?token=${encodeURIComponent(token)}`).then((d) => setEmail(d.email)).catch((e) => setBad(e.message)); }, [token]);

  function pick(f: File | undefined) {
    if (f) setRaw(f);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("token", token);
    if (photo) form.set("photo", photo);
    setBusy(true); setError(null);
    try { await api("/api/join", { method: "POST", body: form }); location.href = "/"; }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  if (bad) return <main className="page"><div className="error">{bad}</div></main>;
  return (
    <main className="page" style={{ paddingBottom: 32 }}>
      <div className="hero"><img src="/icon-192.png" alt="" className="avatar" /><div><h1>Join the team</h1><p>{email ?? "Loading your invite…"}</p></div></div>
      <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label htmlFor="photo" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <span className="avatar" style={{ width: 104, height: 104, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, backgroundImage: preview ? `url(${preview})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>{preview ? "" : "+ Photo"}</span>
          <b>Profile photo</b>
          <span className="muted" style={{ fontSize: ".85rem" }}>This shows on the map as you walk your route.</span>
        </label>
        <input id="photo" type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {raw && <AvatarCrop file={raw} onCancel={() => setRaw(null)} onDone={(f, url) => { setPhoto(f); setPreview(url); setRaw(null); }} />}
        <div className="field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" autoComplete="name" required /></div>
        <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
        <div className="field"><label htmlFor="password">Create a password</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" disabled={busy || !email}>{busy ? "Setting up…" : "Start canvassing"}</button>
      </form>
    </main>
  );
}
