// Smoke test against the live app (or BASE=http://localhost:3210). Run: npm run smoke
// Checks the pieces a canvasser hits first and how fast they answer. Exits non-zero on failure.
const BASE = process.env.BASE || "https://doorstep-far.vercel.app";
const checks = [
  ["Login page", "/login", (r) => r.status === 200],
  ["Health (DB + live routes)", "/api/health", async (r) => r.status === 200 && (await r.json()).ok === true],
  ["Map style", "/map-style.json", async (r) => r.status === 200 && (await r.json()).layers?.length > 20],
  ["Service worker", "/sw.js", (r) => r.status === 200],
  ["Routes API locked without login", "/api/routes", (r) => r.status === 401],
  ["Map tiles reachable", "https://tiles.openfreemap.org/planet", (r) => r.status === 200],
];
let bad = 0;
for (const [name, path, ok] of checks) {
  const t = Date.now();
  try {
    const r = await fetch(path.startsWith("http") ? path : BASE + path, { redirect: "manual" });
    const pass = await ok(r);
    const ms = Date.now() - t;
    console.log(`${pass ? "PASS" : "FAIL"}  ${String(ms).padStart(5)} ms  ${name}${ms > 2000 ? "  (slow)" : ""}`);
    if (!pass) bad++;
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`); bad++;
  }
}
process.exit(bad ? 1 : 0);
