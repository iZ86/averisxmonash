/** Readable text for anything thrown, including Supabase/PostgREST errors (plain objects, not Error). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const { message, details, hint, code } = (error ?? {}) as Record<string, string | undefined>;
  const text = [message, details, hint].filter(Boolean).join(" · ");
  if (text) return code ? `${text} (${code})` : text;
  return typeof error === "string" ? error : JSON.stringify(error);
}
