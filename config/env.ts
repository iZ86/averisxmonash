// Central place for public environment variables.
// Next.js loads .env / .env.local automatically — no dotenv needed.
//
// NEXT_PUBLIC_* vars are inlined into the browser bundle at build time, and only
// when written out literally as `process.env.NEXT_PUBLIC_X` (not process.env[key]).
// Anything without the prefix is server-only and will be undefined in the browser,
// so server-only vars live in config/server-env.ts instead.

import { required } from "@/lib/utils";

export const supabaseConfig = {
  get url() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get publishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
};
