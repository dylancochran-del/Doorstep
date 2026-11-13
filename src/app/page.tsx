"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "./ui";
import { RoutesView } from "./RoutesView";

// "/" is the canvasser home. Managers get their own side (Team), so they're sent there.
export default function Home() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => { if (me?.admin) router.replace("/team"); }, [me, router]);
  if (!me || me.admin) return <main className="page"><p className="muted">Loading…</p></main>;
  return <RoutesView mode="canvasser" />;
}

