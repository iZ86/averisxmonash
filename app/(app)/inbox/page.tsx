"use client";

import { useEffect, useState } from "react";

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

const shortDate = (date: string | null) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

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

  const navButton =
    "rounded px-2 py-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-black/10 px-4 py-2 dark:border-white/15">
        <h1 className="text-xl font-medium">Inbox</h1>
        <form onSubmit={submitSearch} className="flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail (e.g. from:alice has:attachment)"
            className="w-full max-w-2xl rounded-full bg-black/5 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10"
          />
        </form>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex w-full flex-col border-r border-black/10 md:w-[28rem] md:shrink-0 dark:border-white/15">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 text-sm dark:border-white/15">
            <span>
              {search ? `Results for "${search}"` : "Inbox"} · page {page + 1}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0 || listLoading}
                onClick={() => setPages((p) => p.slice(0, -1))}
                className={navButton}
              >
                ← Newer
              </button>
              <button
                disabled={!nextToken || listLoading}
                onClick={() => nextToken && setPages((p) => [...p, nextToken])}
                className={navButton}
              >
                Older →
              </button>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {listLoading && <li className="p-4 text-sm opacity-60">Loading…</li>}
            {listError && <li className="p-4 text-sm text-red-600">{listError}</li>}
            {!listLoading && !listError && emails.length === 0 && (
              <li className="p-4 text-sm opacity-60">No messages.</li>
            )}
            {!listLoading &&
              emails.map((email) => (
                <li key={email.id}>
                  <button
                    onClick={() => setSelectedId(email.id)}
                    className={`block w-full border-b border-black/5 px-4 py-2 text-left text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 ${
                      selectedId === email.id ? "bg-blue-500/10" : ""
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className={`truncate ${email.unread ? "font-bold" : ""}`}>
                        {senderName(email.from)}
                      </span>
                      <span className="shrink-0 text-xs opacity-60">{shortDate(email.date)}</span>
                    </div>
                    <div className={`truncate ${email.unread ? "font-semibold" : ""}`}>
                      {email.subject || "(no subject)"}
                    </div>
                    <div className="truncate text-xs opacity-60">{email.snippet}</div>
                  </button>
                </li>
              ))}
          </ul>
        </section>

        <main className="hidden min-w-0 flex-1 flex-col overflow-y-auto md:flex">
          {!selectedId && <p className="p-6 text-sm opacity-60">Select a message to read it.</p>}
          {messageLoading && <p className="p-6 text-sm opacity-60">Loading…</p>}
          {messageError && <p className="p-6 text-sm text-red-600">{messageError}</p>}
          {message && (
            <article className="flex flex-1 flex-col p-6">
              <h2 className="mb-4 text-2xl">{message.subject || "(no subject)"}</h2>
              <div className="mb-4 text-sm">
                <div>
                  <span className="font-semibold">{senderName(message.from)}</span>{" "}
                  <span className="opacity-60">{message.from?.match(/<.*>/)?.[0]}</span>
                </div>
                {message.to && <div className="opacity-60">to {message.to}</div>}
                {message.cc && <div className="opacity-60">cc {message.cc}</div>}
                {message.date && (
                  <div className="opacity-60">{new Date(message.date).toLocaleString()}</div>
                )}
              </div>

              {message.html ? (
                // No allow-scripts: untrusted email HTML must never run code here.
                <iframe
                  title="Email body"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={`<base target="_blank"><body style="font-family:Arial,sans-serif;color:#222;background:#fff">${message.html}</body>`}
                  className="min-h-96 w-full flex-1 rounded border border-black/10 bg-white"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm">{message.text}</pre>
              )}

              {message.attachments.length > 0 && (
                <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
                  <h3 className="mb-2 text-sm font-semibold">
                    {message.attachments.length} attachment
                    {message.attachments.length > 1 ? "s" : ""}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {message.attachments.map((a) => (
                      <li key={a.downloadUrl}>
                        <a
                          href={a.downloadUrl}
                          className="block rounded border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                        >
                          📎 {a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
