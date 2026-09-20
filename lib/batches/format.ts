function dayIndex(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "Today, 14:22" / "Yesterday, 14:22" / "3 Sep, 14:22" */
export function fmtFull(iso: string): string {
  const diff = dayIndex(new Date()) - dayIndex(new Date(iso));
  if (diff === 0) return `Today, ${hhmm(iso)}`;
  if (diff === 1) return `Yesterday, ${hhmm(iso)}`;
  return `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${hhmm(iso)}`;
}

/** "14:22" / "Yesterday" / "3 Sep" — for the list row's compact time column. */
export function fmtShort(iso: string): string {
  const diff = dayIndex(new Date()) - dayIndex(new Date(iso));
  if (diff === 0) return hhmm(iso);
  if (diff === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "3 min ago" / "2 hours ago" / falls back to fmtFull beyond a day. */
export function fmtRel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return fmtFull(iso);
}
