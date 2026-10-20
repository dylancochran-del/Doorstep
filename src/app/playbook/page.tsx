import { Tabs } from "../ui";

export const metadata = { title: "Playbook · Doorstep" };

const SCRIPTS = [
  { t: "Someone opens the door", s: "Hi! I'm a college student doing a marketing internship with Florida All Risk. Just leaving this for you. If you ever want a second look at your insurance, scan the code and the agent will reach out. Have a good one!" },
  { t: "They ask who you are with", s: "Florida All Risk, an independent agency in St. Pete. We work with 40+ carriers and cover everything except health insurance." },
  { t: "They ask about prices or coverage", s: "I'm not the agent, so I can't quote anything. If you want, I can have the agent give you a call. What's the best number?" },
  { t: "They want a call", s: "Perfect. Tap Talked, enter their name and number, and pick what they're interested in. Dylan gets it right away." },
  { t: "They're not interested or annoyed", s: "No problem at all, sorry to bother you. Have a great day! (Then mark it Skipped → Other and move on.)" },
];
const RULES = [
  "Never walk through yards. Stay on the driveway, the front walkway, or the sidewalk. No cutting across lawns, gardens, or between houses.",
  "Daylight only. Routes open at sunrise and close 45 minutes before sunset.",
  "Hang on the door handle. Never in or on a mailbox (federal law).",
  "Skip any house with a No Soliciting or No Handbills sign, a closed gate, or a loose dog. Mark it Skipped. You still get paid for the route.",
  "Never go into a fenced yard or past a closed gate.",
  "Don't quote prices or talk about coverage. You're not the agent.",
  "The house card may show the owner's name. Don't greet people by it; let them introduce themselves.",
  "Wear the Florida All Risk shirt and hat.",
  "Count your hangers before you start and bring the leftovers back.",
  "Keep Doorstep open while you walk so your route saves. Tap each house as you go.",
];

export default function Playbook() {
  return (
    <main className="page">
      <div className="hero"><img src="/icon-192.png" alt="" className="avatar" /><div style={{ position: "relative", zIndex: 1 }}><h1>Playbook</h1><p>What to say and the rules of the road</p></div></div>
      <section className="city">
        <h2>Scripts</h2>
        {SCRIPTS.map((x) => (
          <div className="card" key={x.t}><b>{x.t}</b><p style={{ margin: "6px 0 0" }}>&ldquo;{x.s}&rdquo;</p></div>
        ))}
      </section>
      <section className="city">
        <h2>Rules</h2>
        <div className="card"><ul style={{ margin: 0, paddingLeft: "1.1em", display: "grid", gap: 8 }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ul></div>
      </section>
      <section className="city">
        <h2>Quick answers</h2>
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div><b>Carriers:</b> 40+ in-house</div>
          <div><b>What we sell:</b> everything except health (home, auto, flood, boat, business, life)</div>
          <div><b>Where:</b> Florida All Risk, St. Petersburg</div>
        </div>
      </section>
      <Tabs />
    </main>
  );
}
