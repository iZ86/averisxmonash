import type { SupabaseClient } from "@supabase/supabase-js";

export type InstructionStats = { total: number; notified: number };

/** Instruction requests (SI_REQUEST emails) in total, and how many have already had a BL sent back to the sender.
 * Shared by the sidebar badge (server) and the Instructions Requests page (browser). */
export async function getCategoryReplyStats(supabase: SupabaseClient, category: string): Promise<InstructionStats> {
  const { data: rows, error } = await supabase
    .from("batch_emails")
    .select("processed_id")
    .eq("category", category)
    .not("processed_id", "is", null);
  if (error) throw error;
  const ids = (rows ?? []).map((r: { processed_id: string }) => r.processed_id);
  if (ids.length === 0) return { total: 0, notified: 0 };

  const { data: sent, error: sentError } = await supabase.from("processed_emails").select("id").in("id", ids).eq("email_sent", true);
  if (sentError) throw sentError;
  return { total: ids.length, notified: sent?.length ?? 0 };
}

export const getInstructionStats = (supabase: SupabaseClient) => getCategoryReplyStats(supabase, "new_si_request");
export const getInvoiceStats = (supabase: SupabaseClient) => getCategoryReplyStats(supabase, "invoice_query");
