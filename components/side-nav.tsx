"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, Globe, Inbox, LayoutDashboard, Upload } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/batches", label: "Batches", icon: Inbox },
  { href: "/review", label: "Review queue", icon: Flag },
  { href: "/shipments", label: "Shipments", icon: Globe },
  { href: "/upload", label: "Upload data", icon: Upload },
] as const;

export function SideNav({
  reviewCount,
  collapsed = false,
  onNavigate,
}: {
  reviewCount: number;
  /** True when the desktop rail is collapsed to icons. Labels stay in the DOM
   * (so the mobile drawer, which is unaffected by this flag, always shows
   * them) and are hidden with `md:hidden` only in that state. */
  collapsed?: boolean;
  /** Called when a nav item is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hideLabel = collapsed ? "md:hidden" : "";

  return (
    <nav className="nav" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        // Email detail pages belong to Batches.
        const on =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/batches" && pathname.startsWith("/emails/"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`sidebar-nav-link ${on ? "on" : ""} ${collapsed ? "md:justify-center md:gap-0 md:px-0" : ""}`.trim()}
            aria-current={on ? "page" : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              aria-hidden
              style={{ flex: "none" }}
            />
            <span className={`sidebar-collapsible ${hideLabel}`}>{label}</span>
            {href === "/review" && reviewCount > 0 && (
              <span
                className={`sidebar-collapsible count ${hideLabel}`}
                aria-label={`${reviewCount} open cases`}
              >
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
