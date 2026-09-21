import { SidebarShell } from "@/components/sidebar-shell";
import { getInstructionStats, getInvoiceStats } from "@/lib/instruction-requests/stats";
import { createClient } from "@/lib/supabase/server";

/** Shared shell for every signed-in route: collapsible navy sidebar plus a main column. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = meta.full_name ?? meta.name ?? data?.claims?.email ?? "Signed in";

  // Sidebar badges count only cases nobody has handled yet: still open, and no reply sent to the sender.
  const openCases = (status: "NEEDS_REVIEW" | "MISMATCH") =>
    supabase
      .from("processed_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .or("email_sent.is.null,email_sent.eq.false");
  const none = { total: 0, notified: 0 };
  const [{ count }, { count: mismatchCount }, instructions, invoices] = await Promise.all([
    openCases("NEEDS_REVIEW"),
    openCases("MISMATCH"),
    getInstructionStats(supabase).catch(() => none),
    getInvoiceStats(supabase).catch(() => none),
  ]);

  return (
    <SidebarShell reviewCount={count ?? 0} mismatchCount={mismatchCount ?? 0} instructionCount={Math.max(0, instructions.total - instructions.notified)} invoiceCount={Math.max(0, invoices.total - invoices.notified)} userName={String(name)}>
      {children}
    </SidebarShell>
  );
}
