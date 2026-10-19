"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login") && !location.pathname.startsWith("/join")) {
    location.href = "/login";
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong. Try again.");
  return data as T;
}

export function postJSON<T = Record<string, unknown>>(url: string, body: unknown) {
  return api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<T>(url).then(setData).catch((e) => setError(e.message));
  }, [url]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;

export function minutes(m: number | null | undefined) {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return `${h % 1 ? h.toFixed(1) : h} hr`;
}

const I = {
  routes: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />,
  cash: <path d="M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4m12-4v4" />,
  book: <path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Zm0 12a4 4 0 0 1 4-4h9" />,
};
export function Icon({ name }: { name: keyof typeof I }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>;
}

export function Tabs() {
  const path = usePathname();
  const tab = (href: string, label: string, icon: keyof typeof I) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}><Icon name={icon} />{label}</Link>
  );
  return <nav className="tabs" aria-label="Main">{tab("/", "Routes", "routes")}{tab("/earnings", "Earnings", "cash")}{tab("/playbook", "Playbook", "book")}</nav>;
}

export function useMe() {
  const [me, setMe] = useState<{ name: string; avatar: string | null } | null>(null);
  useEffect(() => { api<{ name: string; avatar: string | null }>("/api/me").then(setMe).catch(() => {}); }, []);
  return me;
}

export function useGo() {
  const r = useRouter();
  return (href: string) => r.push(href);
}

/** Shrink a phone photo before upload: 12 MP camera shots become ~300 KB. */
export async function shrink(file: File, max = 1400): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.82));
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
