"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type Props = {
  children: React.ReactNode;
  className: string;
};

/** Starts Supabase Google OAuth; the provider redirects back to /auth/callback. */
export function GoogleSignIn({ children, className }: Props) {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(false);
      toast.error("Could not start Google sign-in.", { description: error.message });
    }
  }

  return (
    <button type="button" className={className} onClick={signIn} disabled={pending}>
      <LogIn size={16} strokeWidth={1.75} aria-hidden />
      {pending ? "Redirecting…" : children}
    </button>
  );
}
