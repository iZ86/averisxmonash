import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/config/env";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;

  // Signed-in users skip the landing page.
  if (user && pathname === "/") {
    const redirect = NextResponse.redirect(new URL("/dashboard", request.url));
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Everything except the landing page, the auth routes and the public
  // instruments pages needs a session.
  const isPublic =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/instruments" ||
    pathname.startsWith("/instruments/") ||
    // Email processing API is open while testing
    pathname === "/api/process-email" ||
    // Gmail push + its renewal cron have no user session; each route verifies
    // its own credential (Pub/Sub OIDC token / CRON_SECRET).
    pathname.startsWith("/api/gmail/");

  if (!user && !isPublic) {
    const redirect = pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));
    // Keep any cookies Supabase just refreshed.
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
