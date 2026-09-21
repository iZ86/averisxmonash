"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SideNav } from "@/components/side-nav";

const STORAGE_KEY = "sidebar-collapsed";
const EVENT = "sidebar-collapsed-change";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function setDesktopCollapsed(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
  // Keep in sync with the pre-paint script in the root layout (see globals.css),
  // so a reload right after toggling still paints the correct width on frame one.
  if (value)
    document.documentElement.setAttribute("data-sidebar-collapsed", "true");
  else document.documentElement.removeAttribute("data-sidebar-collapsed");
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Sidebar + main column.
 * - Desktop (md and up): a persistent rail, collapsible between 240px and an
 *   icon-only strip via the button next to the logo. Remembered per browser.
 * - Mobile (below md): an off-canvas drawer, opened with the menu button and
 *   closed by the X, the backdrop, Escape, or picking a nav item.
 * Labels/badges/theme toggle stay in the DOM at every width and are hidden
 * with `md:hidden` only when the desktop rail is collapsed — that way the
 * mobile drawer always shows the full nav, independent of the desktop state.
 */
export function SidebarShell({
  reviewCount,
  mismatchCount,
  instructionCount,
  userName,
  children,
}: {
  reviewCount: number;
  mismatchCount: number;
  instructionCount: number;
  userName: string;
  children: React.ReactNode;
}) {
  const desktopCollapsed = useSyncExternalStore(
    subscribe,
    readCollapsed,
    () => false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  // Transitions are enabled only after the first paint has settled, so if
  // useSyncExternalStore corrects `desktopCollapsed` right after hydration
  // (server never knows the saved localStorage value), that correction snaps
  // instantly instead of visibly animating open-then-shut.
  const [transitionsReady, setTransitionsReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setTransitionsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const hideWhenCollapsed = desktopCollapsed ? "md:hidden" : "";

  return (
    <div
      className={`sidebar-shell-grid grid flex-1 grid-cols-1 ${transitionsReady ? "transition-[grid-template-columns] duration-200" : ""} ${
        desktopCollapsed
          ? "md:grid-cols-[88px_1fr]"
          : "md:grid-cols-[240px_1fr]"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-card px-4 py-3 md:hidden">
        <div className="brand">
          <i />
          <span>APRIL Group</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-inset"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`side fixed inset-y-0 left-0 z-50 w-[240px] max-w-[85vw] -translate-x-full transition-transform duration-200 md:static md:z-auto md:w-auto md:translate-x-0 md:sticky md:top-0 md:h-screen ${
          mobileOpen ? "translate-x-0" : ""
        }`}
      >
        <div
          className={`sidebar-brand-row flex items-center justify-between gap-2 ${desktopCollapsed ? "md:justify-center" : ""}`}
        >
          <div
            className={`sidebar-brand brand ${desktopCollapsed ? "md:p-0" : ""}`}
          >
            <i />
            <span className={`sidebar-collapsible ${hideWhenCollapsed}`}>
              APRIL Group
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDesktopCollapsed(!desktopCollapsed)}
            aria-label={
              desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!desktopCollapsed}
            title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-7 shrink-0 items-center justify-center rounded-md text-on-brand-muted hover:bg-brand-active md:flex"
          >
            {desktopCollapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-on-brand-muted hover:bg-brand-active md:hidden"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <SideNav
          reviewCount={reviewCount}
          mismatchCount={mismatchCount}
          instructionCount={instructionCount}
          collapsed={desktopCollapsed}
          onNavigate={() => setMobileOpen(false)}
        />

        <div
          className={`sidebar-collapsible mt-auto px-2 ${hideWhenCollapsed}`}
        >
          <ThemeToggle />
        </div>

        <div
          className={`sidebar-user-row user mt-0 ${desktopCollapsed ? "md:mt-auto md:flex-col md:items-center md:gap-2 md:pt-4" : ""}`}
        >
          <div className="avatar" aria-hidden>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div
            className={`sidebar-collapsible min-w-0 flex-1 ${hideWhenCollapsed}`}
          >
            <div className="title truncate">{userName}</div>
            <div className="cap">Signed in with Google</div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
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
