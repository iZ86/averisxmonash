import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/config/env";

export function createClient() {
  return createBrowserClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey,
  );
}
