import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { createOAuthClient } from "@/lib/google/oauth";
import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  cookieOptions,
  createSessionToken,
  safeNext,
} from "@/lib/auth/session";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// GET /auth/callback — Google redirects here after consent. Verifies `state`,
// exchanges the code, verifies the ID token and starts a signed-cookie session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const fail = (error: string) => {
    const url = new URL("/auth/login", origin);
    url.searchParams.set("error", error);
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(NEXT_COOKIE);
    return res;
  };

  const denied = searchParams.get("error");
  if (denied) return fail(denied);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return fail("invalid_state");
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return fail("token_exchange_failed");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.googleClientId,
    });
    const claims = ticket.getPayload();
    if (!claims?.sub || !claims.email || !claims.email_verified) {
      return fail("email_not_verified");
    }

    const next = safeNext(request.cookies.get(NEXT_COOKIE)?.value);
    const res = NextResponse.redirect(new URL(next, origin));
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken({
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      }),
      { ...cookieOptions, maxAge: SESSION_MAX_AGE },
    );
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(NEXT_COOKIE);
    return res;
  } catch {
    return fail("token_exchange_failed");
  }
}
