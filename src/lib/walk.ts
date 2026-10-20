// Suggested walking order for a route: street by street, up one side and back down
// the other, then on to the closest unfinished street. Cheap enough to run on the
// phone for a 450-house route, so it re-plans from wherever he actually is.
export type Pt = { id: number; lat: number; lon: number; address?: string | null };

const M_LAT = 111_000, M_LON = 96_500;

export function streetOf(address?: string | null) {
  return (address ?? "").replace(/^\d+\S*\s+/, "").trim().toUpperCase();
}

function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.hypot((a.lat - b.lat) * M_LAT, (a.lon - b.lon) * M_LON);
}

/** Order one street's houses: one side going, the other side coming back. */
function orderStreet(hs: Pt[]): Pt[] {
  if (hs.length < 3) return hs;
  const cx = hs.reduce((a, h) => a + h.lon, 0) / hs.length, cy = hs.reduce((a, h) => a + h.lat, 0) / hs.length;
  // Principal direction of the street (2x2 covariance, closed form).
  let sxx = 0, syy = 0, sxy = 0;
  for (const h of hs) { const x = (h.lon - cx) * M_LON, y = (h.lat - cy) * M_LAT; sxx += x * x; syy += y * y; sxy += x * y; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  const proj = hs.map((h) => {
    const x = (h.lon - cx) * M_LON, y = (h.lat - cy) * M_LAT;
    return { h, t: x * ux + y * uy, o: -x * uy + y * ux };
  });
  const sideA = proj.filter((p) => p.o >= 0).sort((a, b) => a.t - b.t);
  const sideB = proj.filter((p) => p.o < 0).sort((a, b) => b.t - a.t);
  // A curvy street can put most houses on one "side"; then just walk it end to end.
  if (Math.min(sideA.length, sideB.length) < 2) return proj.sort((a, b) => a.t - b.t).map((p) => p.h);
  return [...sideA, ...sideB].map((p) => p.h);
}

export function walkOrder(houses: Pt[], start?: { lat: number; lon: number } | null): Pt[] {
  if (!houses.length) return [];
  const groups = new Map<string, Pt[]>();
  for (const h of houses) {
    // Houses without a street name get a ~150 m grid cell so they still group sensibly.
    const key = streetOf(h.address) || `grid:${Math.round(h.lat / 0.0014)}:${Math.round(h.lon / 0.0015)}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const streets = [...groups.values()].map(orderStreet);
  const out: Pt[] = [];
  let here = start ?? streets[0][0];
  const left = new Set(streets.map((_, i) => i));
  while (left.size) {
    let best = -1, bestD = Infinity, flip = false;
    for (const i of left) {
      const s = streets[i];
      const d0 = dist(here, s[0]), d1 = dist(here, s[s.length - 1]);
      if (d0 < bestD) { bestD = d0; best = i; flip = false; }
      if (d1 < bestD) { bestD = d1; best = i; flip = true; }
    }
    const s = flip ? [...streets[best]].reverse() : streets[best];
    out.push(...s);
    here = s[s.length - 1];
    left.delete(best);
  }
  return out;
}

/** Path as line pieces: walking segments only. Jumps over ~120 m (driving or cutting
 *  across a block to the next street) are left out so the map doesn't show diagonals. */
export function pathPieces(order: { lat: number; lon: number }[], maxJump = 120): [number, number][][] {
  const pieces: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    if (i && dist(order[i - 1], p) > maxJump) { if (cur.length > 1) pieces.push(cur); cur = []; }
    cur.push([p.lon, p.lat]);
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}
