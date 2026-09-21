import type { SupabaseClient } from "@supabase/supabase-js";
import { SI_FIELDS, type SiValues } from "./bl-text";

/** Saves the SI values (and optionally the generated BL file name) on a request's details row.
 * Update-or-insert rather than upsert: the table has no unique constraint on processed_email_id to conflict on. */
export async function saveRequestDetails(
  supabase: SupabaseClient,
  processedEmailId: string,
  values: SiValues,
  blFilename?: string,
): Promise<{ message: string } | null> {
  const row = {
    ...Object.fromEntries(SI_FIELDS.map((f) => [f, values[f].trim() || null])),
    ...(blFilename ? { bl_filename: blFilename } : {}),
  };
  const { data: existing, error: findError } = await supabase
    .from("shipping_instructions_request_details")
    .select("id")
    .eq("processed_email_id", processedEmailId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (findError) return findError;

  const { error } = existing
    ? await supabase.from("shipping_instructions_request_details").update(row).eq("id", existing.id)
    : await supabase.from("shipping_instructions_request_details").insert({ processed_email_id: processedEmailId, ...row });
  return error;
}
