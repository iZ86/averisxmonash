import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SideNav } from "@/components/side-nav";
import { getReviewCases } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";

/** Shared shell for every signed-in route: navy sidebar plus a main column. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = meta.full_name ?? meta.name ?? data?.claims?.email ?? "Signed in";

  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="side md:sticky md:top-0 md:h-screen">
        <div className="brand">
          <i />
          <span>Averis x Monash</span>
        </div>
        <SideNav reviewCount={getReviewCases().length} />
        <div className="mt-auto px-2"><ThemeToggle /></div>
        <div className="user" style={{ marginTop: 0 }}>
          <div className="avatar" aria-hidden>
            {String(name).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="title truncate">{name}</div>
            <div className="cap">Signed in with Google</div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex size-8 items-center justify-center rounded-md text-on-brand-muted hover:bg-brand-active"
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
