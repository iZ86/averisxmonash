import { SidebarShell } from "@/components/sidebar-shell";
import { createClient } from "@/lib/supabase/server";

/** Shared shell for every signed-in route: collapsible navy sidebar plus a main column. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = meta.full_name ?? meta.name ?? data?.claims?.email ?? "Signed in";

  const { count } = await supabase
    .from("batch_emails")
    .select("id", { count: "exact", head: true })
    .eq("result", "needs_review");

  return (
    <SidebarShell reviewCount={count ?? 0} userName={String(name)}>
      {children}
    </SidebarShell>
  );
}
