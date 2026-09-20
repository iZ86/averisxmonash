import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/config/env";
import { required } from "@/lib/utils";

/**
 * Service-role client for callers with no user session (Gmail push webhook,
 * cron). It bypasses RLS, so only use it after authenticating the caller and
 * always scope queries by an explicit user_id.
 */
export function createAdminClient() {
  return createClient(
    supabaseConfig.url,
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
