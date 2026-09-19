import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** OAuth return: exchange the code for a session, then land on the dashboard. */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
