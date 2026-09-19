import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/config/env";

export const SESSION_COOKIE = "session";
export const STATE_COOKIE = "oauth_state";
export const NEXT_COOKIE = "oauth_next";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Session = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp: number; // unix seconds
};

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const sign = (payload: string) =>
  createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");

// Cookie value: base64url(JSON payload) + "." + HMAC-SHA256 signature.
export function createSessionToken(user: Omit<Session, "exp">) {
  const session: Session = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}

// Current logged-in user (from Server Components / Route Handlers), or null.
export async function getSession() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

// Only allow same-site relative paths as post-login destinations.
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
