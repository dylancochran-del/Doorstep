"use client";
// Registers the service worker and reports client crashes to the server log,
// so a glitch on the canvasser's phone shows up in Vega instead of going unseen.
import { useEffect } from "react";

export default function Boot() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const send = (message: string, stack?: string) => {
      try {
        navigator.sendBeacon?.("/api/log", JSON.stringify({ message: String(message).slice(0, 500), stack: String(stack ?? "").slice(0, 2000), path: location.pathname, ua: navigator.userAgent }));
      } catch { /* never let logging break the app */ }
    };
    const onErr = (e: ErrorEvent) => send(e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => send(e.reason?.message ?? String(e.reason), e.reason?.stack);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
