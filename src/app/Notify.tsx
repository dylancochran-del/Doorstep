"use client";
// "Turn on notifications" card. iPhones only allow this inside the home-screen app,
// so in plain Safari it explains the one step he's missing instead of failing silently.
import { useEffect, useState } from "react";
import { postJSON } from "./ui";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function Notify() {
  const [state, setState] = useState<"hidden" | "ask" | "install" | "denied">("hidden");
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) { setState(/iPhone|iPad/.test(navigator.userAgent) && !standalone ? "install" : "hidden"); return; }
    if (Notification.permission === "granted") { navigator.serviceWorker.ready.then(subscribe).catch(() => {}); setState("hidden"); }
    else if (Notification.permission === "denied") setState("denied");
    else setState("ask");
  }, []);
  async function subscribe(reg: ServiceWorkerRegistration) {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
    await postJSON("/api/push/subscribe", sub.toJSON());
  }
  async function turnOn() {
    const p = await Notification.requestPermission();
    if (p === "granted") { await subscribe(await navigator.serviceWorker.ready); setState("hidden"); }
    else setState("denied");
  }
  if (state === "hidden") return null;
  if (state === "install") return <div className="sunbar">📲 Tap Share → <b>Add to Home Screen</b> to get alerts for new routes, boosts and pay.</div>;
  if (state === "denied") return null;
  return (
    <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ fontSize: "1.6rem" }} aria-hidden="true">🔔</span>
      <span style={{ flex: 1, fontWeight: 700 }}>Get alerts for new routes, boosts, and when you get paid.</span>
      <button className="btn" style={{ padding: "10px 14px", fontSize: "1rem" }} onClick={turnOn}>Turn on</button>
    </div>
  );
}
