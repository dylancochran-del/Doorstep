"use client";
// Profile photo cropper: drag to position, slide to zoom, and the circle is exactly
// what gets saved (a 600 x 600 JPEG). Works with touch and mouse.
import { useEffect, useRef, useState } from "react";

const BOX = 260; // on-screen crop circle, px
const OUT = 600; // saved image, px

export default function AvatarCrop({ file, onDone, onCancel }: { file: File; onDone: (f: File, preview: string) => void; onCancel: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setOff({ x: 0, y: 0 }); };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base scale makes the image cover the circle; zoom multiplies it.
  const base = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : BOX, h = img ? img.naturalHeight * base * zoom : BOX;
  // Keep the photo covering the circle: no empty corners.
  const clamp = (o: { x: number; y: number }) => ({ x: Math.min((w - BOX) / 2, Math.max(-(w - BOX) / 2, o.x)), y: Math.min((h - BOX) / 2, Math.max(-(h - BOX) / 2, o.y)) });
  const pos = clamp(off);

  function down(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  }
  async function save() {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = c.height = OUT;
    const g = c.getContext("2d")!;
    const k = OUT / BOX;
    // Image top-left relative to the circle's top-left, in screen px, scaled to output px.
    const left = (BOX - w) / 2 + pos.x, top = (BOX - h) / 2 + pos.y;
    g.drawImage(img, left * k, top * k, w * k, h * k);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.88));
    onDone(new File([blob], "avatar.jpg", { type: "image/jpeg" }), c.toDataURL("image/jpeg", 0.7));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,42,74,.92)", zIndex: 60, display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ display: "grid", gap: 14, justifyItems: "center", maxWidth: 340, width: "100%" }}>
        <h3>Position your photo</h3>
        <div
          onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
          style={{ width: BOX, height: BOX, borderRadius: "50%", overflow: "hidden", position: "relative", touchAction: "none", cursor: "grab", border: "4px solid var(--gold)", background: "#dfe7f0" }}
          aria-label="Drag to position your photo" role="img"
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.src} alt="" draggable={false} style={{ position: "absolute", width: w, height: h, left: (BOX - w) / 2 + pos.x, top: (BOX - h) / 2 + pos.y, maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
          )}
        </div>
        <label style={{ width: "100%", display: "grid", gap: 4, fontWeight: 800, fontSize: ".85rem" }}>
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem", textAlign: "center" }}>Drag the photo so your face fills the circle.</p>
        <div className="grid2" style={{ width: "100%" }}>
          <button type="button" className="btn gray" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={save} disabled={!img}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
