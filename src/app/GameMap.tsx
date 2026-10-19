"use client";
// The game board: a free vector map restyled with bright game colors, every door a
// little house sprite that changes when it's checked off, and the canvasser's
// face moving along the streets. Satellite toggle for spotting gates and fences.
import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";

export type House = { id: number; lat: number; lon: number; address?: string | null; kind?: string };
export type Status = Record<string, { kind: string; reason?: string | null }>;

// Pre-baked, trimmed game style (data/bake_style.py): one small file, no runtime recoloring.
const STYLE = "/map-style.json";
const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SPRITES: Record<string, { roof: string; body: string; mark?: "check" | "x" | "star" | "plus" }> = {
  todo: { roof: "#0b2a4a", body: "#fffaf0" },
  hung: { roof: "#1e7a37", body: "#2fa84f", mark: "check" },
  skipped: { roof: "#5b6573", body: "#a3acb8", mark: "x" },
  talked: { roof: "#c98f00", body: "#f5b301", mark: "star" },
  added: { roof: "#12406e", body: "#8cc8ff", mark: "plus" },
  picked: { roof: "#c98f00", body: "#fff3c4", mark: "check" },
};

function drawHouse(roof: string, body: string, mark?: string): ImageData {
  const s = 96; // 48px at 2x
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.lineJoin = "round";
  // ground shadow
  g.fillStyle = "rgba(0,0,0,.22)";
  g.beginPath(); g.ellipse(48, 86, 30, 7, 0, 0, Math.PI * 2); g.fill();
  // body
  g.fillStyle = body; g.strokeStyle = "#0b2a4a"; g.lineWidth = 5;
  g.beginPath(); g.rect(22, 44, 52, 38); g.fill(); g.stroke();
  // roof
  g.fillStyle = roof;
  g.beginPath(); g.moveTo(14, 48); g.lineTo(48, 14); g.lineTo(82, 48); g.closePath(); g.fill(); g.stroke();
  // door
  g.fillStyle = "#0b2a4a"; g.fillRect(42, 60, 13, 22);
  // badge
  if (mark) {
    g.fillStyle = "#fff"; g.strokeStyle = "#0b2a4a"; g.lineWidth = 4;
    g.beginPath(); g.arc(74, 24, 17, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = mark === "x" ? "#5b6573" : mark === "star" ? "#c98f00" : mark === "plus" ? "#12406e" : "#1e7a37";
    g.fillStyle = g.strokeStyle; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath();
    if (mark === "check") { g.moveTo(66, 24); g.lineTo(72, 30); g.lineTo(83, 18); g.stroke(); }
    if (mark === "x") { g.moveTo(67, 17); g.lineTo(81, 31); g.moveTo(81, 17); g.lineTo(67, 31); g.stroke(); }
    if (mark === "plus") { g.moveTo(74, 16); g.lineTo(74, 32); g.moveTo(66, 24); g.lineTo(82, 24); g.stroke(); }
    if (mark === "star") {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 5 : 11, a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = 74 + r * Math.cos(a), y = 24 + r * Math.sin(a);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill();
    }
  }
  return g.getImageData(0, 0, s, s);
}

function toGeoJSON(houses: House[], status: Status, picked?: Set<number>) {
  return {
    type: "FeatureCollection" as const,
    features: houses.map((h) => ({
      type: "Feature" as const,
      id: h.id,
      properties: { id: h.id, icon: picked?.has(h.id) ? "picked" : status[h.id]?.kind ?? (h.kind === "added" ? "added" : "todo") },
      geometry: { type: "Point" as const, coordinates: [h.lon, h.lat] },
    })),
  };
}

export default function GameMap(props: {
  houses: House[];
  status?: Status;
  me?: { lat: number; lon: number } | null;
  avatar?: string | null;
  track?: [number, number][];
  satellite?: boolean;
  fit?: { lat: number; lon: number }[];
  focus?: { lat: number; lon: number; zoom?: number } | null;
  picked?: Set<number>;
  onHouse?: (id: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: latest.current.fit?.length ? [latest.current.fit[0].lon, latest.current.fit[0].lat] : [-82.8, 29.6],
      zoom: latest.current.fit?.length ? 15 : 10,
      fadeDuration: 0,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.current = m;
    // "style.load" fires once the style is parsed, well before every tile arrives,
    // so the houses show up immediately instead of after the whole basemap loads.
    m.once("style.load", () => {
      for (const [name, s] of Object.entries(SPRITES)) m.addImage(name, drawHouse(s.roof, s.body, s.mark), { pixelRatio: 2 });
      m.addSource("sat", { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri" });
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.getCanvas().style.background = "#b5e08f";
      m.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } }, firstSymbol);
      m.addSource("track", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
      m.addLayer({ id: "track", type: "line", source: "track", paint: { "line-color": "#f5b301", "line-width": 5, "line-dasharray": [1, 1.5], "line-opacity": 0.9 } });
      m.addSource("houses", { type: "geojson", data: toGeoJSON(latest.current.houses, latest.current.status ?? {}, latest.current.picked) });
      m.addLayer({
        id: "houses", type: "symbol", source: "houses",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-allow-overlap": true,
          "icon-anchor": "bottom",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.18, 14, 0.3, 16, 0.6, 18, 1.1],
        },
      });
      m.on("click", "houses", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id != null) latest.current.onHouse?.(Number(id));
      });
      m.on("mouseenter", "houses", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "houses", () => (m.getCanvas().style.cursor = ""));
      ready.current = true;
      sync(true);
    });
    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the map last drew, so a GPS tick (about once a second) only moves the
  // avatar instead of rebuilding every house pin and the whole trail.
  const drawn = useRef<{ houses?: unknown; status?: unknown; picked?: unknown; trackLen?: number; sat?: boolean; avatar?: string | null }>({});

  function sync(first = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    const p = latest.current;
    const w = drawn.current;
    if (first || w.houses !== p.houses || w.status !== p.status || w.picked !== p.picked) {
      (m.getSource("houses") as GeoJSONSource | undefined)?.setData(toGeoJSON(p.houses, p.status ?? {}, p.picked));
      w.houses = p.houses; w.status = p.status; w.picked = p.picked;
    }
    const tl = p.track?.length ?? 0;
    if (first || w.trackLen !== tl) {
      (m.getSource("track") as GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: p.track ?? [] } });
      w.trackLen = tl;
    }
    if (first || w.sat !== !!p.satellite) {
      m.setLayoutProperty("sat", "visibility", p.satellite ? "visible" : "none");
      w.sat = !!p.satellite;
    }
    if (p.me) {
      if (!meMarker.current) {
        const d = document.createElement("div");
        d.className = "me";
        meMarker.current = new maplibregl.Marker({ element: d }).setLngLat([p.me.lon, p.me.lat]).addTo(m);
      } else meMarker.current.setLngLat([p.me.lon, p.me.lat]);
      if (p.avatar && w.avatar !== p.avatar) {
        meMarker.current.getElement().style.backgroundImage = `url("${p.avatar}")`;
        w.avatar = p.avatar;
      }
    }
    if (first && p.fit && p.fit.length) {
      const b = new maplibregl.LngLatBounds();
      p.fit.forEach((f) => b.extend([f.lon, f.lat]));
      m.fitBounds(b, { padding: { top: 140, bottom: 220, left: 40, right: 40 }, maxZoom: 17, duration: 0 });
    }
  }

  useEffect(() => { sync(); });

  useEffect(() => {
    const f = props.focus;
    if (f && map.current) map.current.easeTo({ center: [f.lon, f.lat], zoom: f.zoom ?? Math.max(map.current.getZoom(), 17), duration: 600 });
  }, [props.focus]);

  return <div ref={el} className="map" style={{ width: "100%", height: "100%" }} />;
}
