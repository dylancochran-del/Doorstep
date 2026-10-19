// Signed session cookie, same shape as Vega and bindradar-platform.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const COOKIE = "doorstep_session";
const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-insecure-secret-change-me");
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Session = { cid: string; name: string };

export async function setSession(s: Session): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { cid: String(payload.cid), name: String(payload.name) };
  } catch {
    return null;
  }
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [, saltHex, keyHex] = stored.split("$");
  if (!saltHex || !keyHex) return false;
  const key = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64);
  const want = Buffer.from(keyHex, "hex");
  return want.length === key.length && timingSafeEqual(want, key);
}
