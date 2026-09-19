import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

// POST /auth/signout — clears the session. POST-only so a link can't log users out.
export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/auth/login", request.nextUrl.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
