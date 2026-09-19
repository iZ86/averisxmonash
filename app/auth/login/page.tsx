import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
};

const ERRORS: Record<string, string> = {
  access_denied: "You declined access. Please try again.",
  invalid_state: "The sign-in session expired or was invalid. Please try again.",
  email_not_verified: "Your Google email address is not verified.",
  token_exchange_failed: "Could not complete sign-in with Google. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-sm flex-col gap-6 px-6 py-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Sign in
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Continue with your Google account.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {ERRORS[error] ?? "Something went wrong. Please try again."}
          </p>
        )}

        <a
          href={`/auth/google?next=${encodeURIComponent(target)}`}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-white/8"
        >
          <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </a>
      </main>
    </div>
  );
}
