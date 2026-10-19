// Map tile URLs covering a route, so the service worker can download them ahead of time.
let template: string | null = null;

async function tileTemplate(): Promise<string | null> {
  if (template) return template;
  try {
    const tj = await (await fetch("https://tiles.openfreemap.org/planet")).json();
    template = tj.tiles?.[0] ?? null;
  } catch { /* offline */ }
  return template;
}

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export async function prefetchRoute(points: { lat: number; lon: number }[]) {
  if (!points.length || !navigator.serviceWorker?.controller) return;
  const t = await tileTemplate();
  if (!t) return;
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const pad = 0.004;
  const urls: string[] = [];
  for (const z of [11, 12, 13, 14]) {
    const x0 = lon2x(Math.min(...lons) - pad, z), x1 = lon2x(Math.max(...lons) + pad, z);
    const y0 = lat2y(Math.max(...lats) + pad, z), y1 = lat2y(Math.min(...lats) - pad, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(t.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
  }
  navigator.serviceWorker.controller.postMessage({ type: "prefetch", urls });
}
