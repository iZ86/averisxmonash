"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, Globe, Inbox, LayoutDashboard, Mail, Upload } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Gmail inbox", icon: Mail },
  { href: "/batches", label: "Batches", icon: Inbox },
  { href: "/review", label: "Review queue", icon: Flag },
  { href: "/shipments", label: "Shipments", icon: Globe },
  { href: "/upload", label: "Upload data", icon: Upload },
] as const;

export function SideNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        // Email detail pages belong to Batches.
        const on =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/batches" && pathname.startsWith("/emails/"));
        return (
          <Link key={href} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
            <Icon size={18} strokeWidth={1.75} aria-hidden style={{ flex: "none" }} />
            <span>{label}</span>
            {href === "/review" && reviewCount > 0 && (
              <span className="count" aria-label={`${reviewCount} open cases`}>
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
