// Central place for environment variables.
// Next.js loads .env / .env.local automatically — no dotenv needed.
//
// NEXT_PUBLIC_* vars are inlined into the browser bundle at build time, and only
// when written out literally as `process.env.NEXT_PUBLIC_X` (not process.env[key]).
// Anything without the prefix is server-only and will be undefined in the browser.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  // Server-only secrets are getters so this module can be imported by client
  // code (lib/supabase/client.ts) without throwing on their absence in the browser.
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID);
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET);
  },
  get googleRedirectUri() {
    return required("GOOGLE_REDIRECT_URI", process.env.GOOGLE_REDIRECT_URI);
  },
  get googleRefreshToken() {
    return process.env.GOOGLE_REFRESH_TOKEN;
  },
};
