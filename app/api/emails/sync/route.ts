import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runGmailSync } from "@/lib/email-sync/run-sync";

export const runtime = "nodejs";
// Gmail paging + per-attachment fetches can take a while for a large first
// sync; give this route more room than the default.
export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const { body, status } = await runGmailSync(supabase, userId);
  return NextResponse.json(body, { status });
}
