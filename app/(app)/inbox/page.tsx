"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox as InboxIcon,
  Mail,
  Paperclip,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

type Summary = {
  id: string;
  from: string | null;
  subject: string | null;
  date: string | null;
  snippet: string;
  unread: boolean;
};

type Message = {
  id: string;
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string | null;
  text: string;
  html: string;
  attachments: { filename: string; mimeType: string; downloadUrl: string }[];
};

// "Jane Doe <jane@x.com>" -> "Jane Doe"
const senderName = (from: string | null) =>
  from?.replace(/<.*>/, "").replace(/"/g, "").trim() || from || "(unknown)";

const initial = (from: string | null) => senderName(from).charAt(0).toUpperCase() || "?";

const shortDate = (date: string | null) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  // Read as text first: proxy/server failures can return an empty or non-JSON body.
  const body = await res.text();
  let json: { error?: string } | null = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {}
  if (!res.ok || !json) {
    throw new Error(json?.error ?? `Request failed (${res.status} ${res.statusText || "empty response"})`);
  }
  return json as T;
}

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export default function Inbox() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(""); // submitted query
  // pages[i] is the Gmail page token used to load page i (the first is empty).
  const [pages, setPages] = useState<string[]>([""]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Results are stored with the request they belong to, so "loading" is simply
  // "the latest result isn't for the current request yet".
  const [list, setList] = useState<{
    key: string;
    emails: Summary[];
    next: string | null;
    error: string | null;
  } | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    message: Message | null;
    error: string | null;
  } | null>(null);

  const page = pages.length - 1;
  const pageToken = pages[page];
  const listKey = `${search}|${pageToken}`;
  const listLoading = list?.key !== listKey;
  const emails = listLoading ? [] : (list?.emails ?? []);
  const nextToken = listLoading ? null : (list?.next ?? null);
  const listError = listLoading ? null : (list?.error ?? null);

  const messageLoading = selectedId !== null && detail?.id !== selectedId;
  const message = detail?.id === selectedId ? detail.message : null;
  const messageError = detail?.id === selectedId ? detail.error : null;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (pageToken) params.set("pageToken", pageToken);
    getJson<{ emails: Summary[]; nextPageToken: string | null }>(`/api/emails?${params}`)
      .then((json) => ({ emails: json.emails, next: json.nextPageToken, error: null }))
      .catch((e: Error) => ({ emails: [], next: null, error: e.message }))
      .then((result) => !cancelled && setList({ key: `${search}|${pageToken}`, ...result }));
    return () => {
      cancelled = true;
    };
  }, [search, pageToken]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getJson<Message>(`/api/emails/${selectedId}`)
      .then((message) => ({ message, error: null }))
      .catch((e: Error) => ({ message: null, error: e.message }))
      .then((result) => !cancelled && setDetail({ id: selectedId, ...result }));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPages([""]);
    setSelectedId(null);
    setSearch(query.trim());
  }

  const showDetail = selectedId !== null;

  return (
    <>
      <PageHeader
        eyebrow="Gmail inbox"
        title="Inbox"
        description="Browse and search the connected Gmail inbox."
        actions={
          <form onSubmit={submitSearch} role="search" className="input w-72 max-w-full">
            <Search {...ICON} className="shrink-0 text-text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search mail"
              placeholder="Search mail, e.g. from:alice"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-subtle"
            />
          </form>
        }
      />

      <div className="card flex h-[calc(100vh-13rem)] min-h-[480px] overflow-hidden">
        <section
          className={`${showDetail ? "hidden md:flex" : "flex"} w-full flex-col border-border md:w-[26rem] md:shrink-0 md:border-r`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="lbl truncate">
              {search ? `Results for “${search}”` : "All mail"} · page {page + 1}
            </span>
            <div className="flex gap-1">
              <button
                aria-label="Newer messages"
                disabled={page === 0 || listLoading}
                onClick={() => setPages((p) => p.slice(0, -1))}
                className="btn ghost sm !px-2"
              >
                <ChevronLeft {...ICON} />
              </button>
              <button
                aria-label="Older messages"
                disabled={!nextToken || listLoading}
                onClick={() => nextToken && setPages((p) => [...p, nextToken])}
                className="btn ghost sm !px-2"
              >
                <ChevronRight {...ICON} />
              </button>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {listLoading && <li className="p-4 text-sm text-text-muted">Loading…</li>}
            {listError && <li className="p-4 text-sm text-status-mismatch">{listError}</li>}
            {!listLoading && !listError && emails.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-10 text-center text-sm text-text-muted">
                <InboxIcon size={24} strokeWidth={1.75} aria-hidden />
                No messages.
              </li>
            )}
            {!listLoading &&
              emails.map((email) => {
                const active = selectedId === email.id;
                return (
                  <li key={email.id}>
                    <button
                      onClick={() => setSelectedId(email.id)}
                      aria-current={active}
                      className={`flex w-full gap-3 border-b border-l-2 border-b-border px-4 py-3 text-left hover:bg-surface-inset ${
                        active ? "border-l-accent bg-surface-inset" : "border-l-transparent"
                      }`}
                    >
                      <span className="avatar !bg-surface-inset !text-text-label" aria-hidden>
                        {initial(email.from)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {email.unread && <span className="dot" role="img" aria-label="Unread" />}
                            <span className={`title truncate ${email.unread ? "" : "!font-medium text-text-muted"}`}>
                              {senderName(email.from)}
                            </span>
                          </span>
                          <span className="cap shrink-0">{shortDate(email.date)}</span>
                        </span>
                        <span className={`block truncate text-sm ${email.unread ? "font-semibold" : ""}`}>
                          {email.subject || "(no subject)"}
                        </span>
                        <span className="cap block truncate">{email.snippet}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>

        <div className={`${showDetail ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-y-auto`}>
          {showDetail && (
            <button onClick={() => setSelectedId(null)} className="btn ghost sm m-4 mb-0 self-start md:hidden">
              <ArrowLeft {...ICON} /> Back to inbox
            </button>
          )}
          {!selectedId && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-text-muted">
              <span className="dropicon">
                <Mail size={24} strokeWidth={1.75} aria-hidden />
              </span>
              Select a message to read it.
            </div>
          )}
          {messageLoading && <p className="p-6 text-sm text-text-muted">Loading…</p>}
          {messageError && <p className="p-6 text-sm text-status-mismatch">{messageError}</p>}
          {message && (
            <article className="flex flex-1 flex-col gap-4 p-6">
              <h2 className="h2">{message.subject || "(no subject)"}</h2>
              <div className="flex items-start gap-3">
                <span className="avatar" aria-hidden>
                  {initial(message.from)}
                </span>
                <div className="min-w-0 text-sm">
                  <div>
                    <span className="title">{senderName(message.from)}</span>{" "}
                    <span className="cap">{message.from?.match(/<.*>/)?.[0]}</span>
                  </div>
                  {message.to && <div className="cap truncate">to {message.to}</div>}
                  {message.cc && <div className="cap truncate">cc {message.cc}</div>}
                  {message.date && <div className="cap">{new Date(message.date).toLocaleString()}</div>}
                </div>
              </div>
              <hr className="divider" />

              {message.html ? (
                // No allow-scripts: untrusted email HTML must never run code here.
                <iframe
                  title="Email body"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={`<base target="_blank"><body style="font-family:Arial,sans-serif;color:#222;background:#fff">${message.html}</body>`}
                  className="min-h-96 w-full flex-1 rounded-lg border border-border bg-white"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-text-strong">{message.text}</pre>
              )}

              {message.attachments.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="lbl mb-2">
                    {message.attachments.length} attachment{message.attachments.length > 1 ? "s" : ""}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {message.attachments.map((a) => (
                      <li key={a.downloadUrl}>
                        <a href={a.downloadUrl} className="btn ghost sm">
                          <Paperclip {...ICON} /> {a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </>
  );
}
