"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const KEY = "theme";
const EVENT = "theme-change";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
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

function apply(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new Event(EVENT));
}

/** Light / system / dark switch. The choice is stored locally and applied before paint by the script in the root layout. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex gap-0.5 rounded-lg border border-on-brand-muted/40 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label} theme`}
            aria-pressed={on}
            title={`${label} theme`}
            onClick={() => apply(value)}
            className={`flex size-8 items-center justify-center rounded-md ${
              on ? "bg-brand-active text-on-brand" : "text-on-brand-muted hover:bg-brand-active"
            }`}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
