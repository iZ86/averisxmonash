import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { drainProcessingQueue } from "@/lib/email-processing/drain-queue";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const result = await drainProcessingQueue(supabase, userId);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, processed: result.processed });
}
