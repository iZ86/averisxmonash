import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/config/env";

export function createClient() {
  return createBrowserClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
  );
}
