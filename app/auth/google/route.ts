import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginUrl } from "@/lib/google/oauth";
import { NEXT_COOKIE, STATE_COOKIE, cookieOptions, safeNext } from "@/lib/auth/session";

// GET /auth/google — starts sign-in: stores a CSRF `state` (and the page to
// return to) in short-lived cookies, then redirects to Google's consent screen.
export async function GET(request: NextRequest) {
  const state = randomBytes(32).toString("base64url");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const response = NextResponse.redirect(getLoginUrl(state));
  response.cookies.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  response.cookies.set(NEXT_COOKIE, next, { ...cookieOptions, maxAge: 600 });
  return response;
}
