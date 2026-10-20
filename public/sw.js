// Doorstep service worker. Makes repeat loads instant and keeps the map working in
// rural dead zones: app files and map tiles are served from the phone first.
// API calls always go to the network (the in-app outbox handles offline taps).
const VERSION = "v3";
const APP = `app-${VERSION}`, TILES = "tiles-v1", MAX_TILES = 3000;
const PRECACHE = ["/", "/run", "/earnings", "/playbook", "/login", "/map-style.json", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("app-") && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const c = await caches.open(APP);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req)) || (await c.match("/")) || Response.error();
  }
}
async function trim() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.hostname === "tiles.openfreemap.org" || url.hostname === "server.arcgisonline.com") {
    e.respondWith(cacheFirst(req, TILES));
    return;
  }
  if (url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com") {
    e.respondWith(cacheFirst(req, APP));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || /\.(png|json|webmanifest|css|js)$/.test(url.pathname)) e.respondWith(cacheFirst(req, APP));
    else if (req.mode === "navigate") e.respondWith(networkFirst(req));
  }
});

// The app asks us to download a route's map tiles ahead of time (on Wi-Fi, before driving out).
self.addEventListener("message", (e) => {
  if (e.data?.type !== "prefetch" || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(TILES);
    for (const u of e.data.urls.slice(0, 400)) {
      if (await c.match(u)) continue;
      try { const r = await fetch(u, { mode: "cors" }); if (r.ok) await c.put(u, r); } catch { /* offline: skip */ }
    }
    await trim();
  })());
});

// Phone notifications from Vega (route approved, paid, boosts, new routes).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Doorstep", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Doorstep", { body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
