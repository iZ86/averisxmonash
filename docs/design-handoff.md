# Design handoff: APRIL Group

Read this before building any screen. It tells you where the design lives, what each page must do, and how to wire it into this Next.js app (see also `AGENTS.md`: this Next.js version has breaking changes, so read `node_modules/next/dist/docs/` before writing code).

## Where the design lives

- **Static wireframes in this repo (start here):** `design/screens/*.html` (open in a browser; each has a light/dark toggle bottom-right) with shared CSS `design/ui.css` and tokens `design/tokens.json`. These are the visual spec; match them closely. Design-system usage rules: `design/README.md`.
- **Screens (8 artboards):** https://claude.ai/artifact/6Y9g4FxZ8ha4r1jCDDhedv. Read each artboard's markup (Artifact tool, action `read`, `path` e.g. `project/Dashboard.dc.html`) for exact spacing, copy and structure. Shared component CSS is `project/ui.css`.
- **Design system (tokens + usage rules):** https://claude.ai/artifact/XLkHSFyfvjVxsraFNmCSpo. Read `project/README.md` first, then `project/tokens.json`.
- **Data in the mockups is sample data** (invented names, counts and ports). Replace with real data; never ship it.

## Tokens

`app/globals.css` now holds the tokens as CSS variables for light and dark (dark follows `prefers-color-scheme`; set `data-theme="light"` or `"dark"` on `<html>` to force one). Tailwind v4 utilities are mapped in `@theme inline`:

- Surfaces: `bg-surface-page`, `bg-surface-card`, `bg-surface-inset`
- Text: `text-text-strong`, `text-text-label`, `text-text-muted`, `text-text-subtle`
- Borders: `border-border` (hairlines), `border-border-control` (inputs, drop zones, toggles)
- Actions: `bg-action text-on-action` (primary), `bg-accent text-on-accent` (the orange hint), `text-accent-text` (orange as text)
- Status: `text-status-match bg-status-match-soft`, `text-status-mismatch bg-status-mismatch-soft`, `text-status-review bg-accent-soft`
- Brand surface (navy sidebar and landing hero): `bg-brand-surface text-on-brand`, `text-on-brand-muted`, `bg-brand-active` (selected nav item)
- Charts: `bg-chart-bar` (default bars), `bg-accent` (the highlighted bar)
- Confidence: `bg-confidence-high|mid|low` and matching `text-` classes
- Scales: `navy-50..950`, `orange-300..700`

Rules: navy carries structure and appears as a solid brand surface (the sidebar and the landing hero are `brand-surface`, not white or black); orange is used in small, repeated hints: the logo dot, active-nav icon, review count badge, user avatar, eyebrow labels, primary highlight bar, entry port and route arc, the review callout, and mid-confidence meters. Never orange body text or large orange areas. Every status shows a word and an icon, never color alone (`No mismatch detected` + check, `Mismatch found` + warning triangle, `Needs review` + flag). Type is Geist / Geist Mono (already loaded in `app/layout.tsx`); headings 600 weight with -0.025em tracking, body 14px/24px, captions 12px. Radii: `rounded-lg` (8px) for cards, inputs and buttons, `rounded-md` for segments, `rounded-full` for badges. No shadows; separate surfaces with 1px borders. Icons are inline 24px-grid stroke icons (1.75 stroke); use `lucide-react` equivalents (layout-dashboard, inbox, flag, globe, upload, check-circle, alert-triangle, mail, refresh-cw, file, arrow-right, search, x-circle, shield-check).

## Routes and pages

Existing: `/` (currently the create-next-app starter), `/upload`, `/instruments` (debug data dump; keep out of the nav). Add the rest. Every route except `/` requires a signed-in user (extend `proxy.ts` / `lib/supabase/proxy.ts`); signed-in users visiting `/` go to `/dashboard`.

| Route | Artboard | Purpose |
| --- | --- | --- |
| `/` | Landing | Explain the problem and the solution; "Continue with Google" is also the sign-in |
| `/dashboard` | Dashboard | Key metrics for the connected inbox |
| `/upload` | Upload | Zip or folder upload (existing logic in `app/upload/upload-form.tsx`, restyled) |
| `/batches` | Batches | Every email in a batch with category, result, status; filters and retry |
| `/emails/[emailId]` | Report / Email | Comparison report if the email is a document-comparison request; otherwise the classification detail |
| `/review` | Review | Queue of cases needing a person; confirm or correct |
| `/shipments` | Shipments | 3D globe with each shipment traced from entry port to exit port |

App screens share one shell: a 240px sidebar (brand, nav: Dashboard, Batches, Review queue with an orange count badge, Shipments, Upload data; user chip at the bottom) and a main column with a page title, one-line description and right-aligned actions. Build it once as a layout for the signed-in routes.

### `/` Landing
Header with brand and a small "Sign in with Google". Hero: eyebrow "Shipping document verification", headline "Catch mismatched shipping details before the draft is final.", lead paragraph, primary button "Continue with Google", caption "Signing in with Google also connects the inbox to check." Right: a static example comparison report (container count SI: 3 / BL: 4). Then "What slows shipping teams down" (three problem cards: finding the right emails takes time; manual comparison is repetitive and error-prone; the same information looks different, e.g. Port of Loading vs Load Port), "How it works" (Classify, Extract, Compare, Ask for help), and a closing call to action. Use Supabase OAuth: `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}/auth/callback` } })` and add an `/auth/callback` route that exchanges the code and redirects to `/dashboard`. Decide with the team whether the inbox connection needs Gmail read scopes at this step.

### `/dashboard`
KPI cards: emails processed, comparison requests (and share of emails), reports with a mismatch (and share of requests), awaiting review (orange), shipments on the map. Cards: emails by category (bars: document comparison, general message, invoice query, spam, new SI request), mismatches by field (7 fields; count differing fields, note "N differing fields across M reports"), and one stacked bar of results (no mismatch / mismatch / needs review). Below: "Needs your review" list with a link to `/review`. Date-range chip (last 30 days) filters all numbers. Empty state: no batches yet, link to `/upload`.

### `/upload`
Keep existing behavior (zip or two folders `inbox/` and `attachments/`, `POST /api/upload`, Sonner toasts). Restyle: segmented toggle, dashed drop zone with `border-border-control`, primary "Upload" button, success summary with batch ID and a link to `/batches`.

### `/batches`
Segmented filters (All, Comparison, Needs review, Failed) with counts, a search input, and a table: email (subject + sender, subject links to `/emails/[id]`), category chip, result badge, status, received. Failed rows show a "Retry" button that re-runs processing for that email and shows progress. Paginate.

### `/emails/[emailId]`
**Document-comparison request:** breadcrumb, subject, sender and time. A verdict card at the top: "Mismatch found: 1 of 7 fields differ, container count, SI: 3 / BL: 4" (red soft ground) or "No mismatch detected" (teal). A table of the seven fields (shipper, consignee, notify party, port of loading, port of discharge, container count, gross weight in kg) with Shipping Instruction (reference) and draft BL columns and a per-row result; only differing rows are highlighted; when the BL used a different label ("Load Port"), show it as a caption under the field. Side column: category and the two attachments, and "Source evidence" excerpts of the lines the values came from. Actions: "Send to review", "Export result".
**Other categories:** message body, classification chip, a plain explanation that it did not continue to checking, and a "Reclassify" control that re-runs the pipeline if changed to a comparison request.

### `/review`
Left: list of open cases (subject + reason), selected case highlighted. Right: a "Why this needs a person" callout (orange soft), source evidence (rendered scan or text with the relevant area outlined in orange), the reference value, an editable field for the value as the person reads it, and actions: "Confirm and update report", "Value is different", "Mark as unreadable" (requests a new copy). Confirming re-runs the comparison and updates `/emails/[id]`. Never guess silently: unreadable, missing or uncertain values always land here with the evidence and reason.

### `/shipments`
Three columns: list of shipments (route, distance, weight, result badge), globe, detail panel (entry port, exit port, distance, containers, gross weight, shipper, consignee, link to the report). The mockup's globe is a pre-rendered SVG per shipment; in the app, build a client component with a WebGL globe (for example `globe.gl` or `three`) using: sea in `surface-inset`, land as dots in `navy-500` (`navy-300` in dark), a faint graticule, a lifted great-circle arc in `accent` with a dotted ground track, the entry port marked with an orange dot and the exit port with an `action`-colored dot, both labeled "Entry · Port" / "Exit · Port". Selecting a shipment recenters the globe on the route midpoint. Provide a text/table alternative for the route (the list and detail panel already do) and `aria-label`s on the globe. Ports need coordinates: keep a lookup table (UN/LOCODE to lat/lon) and show a "location unknown" state when a port cannot be resolved.

## Data the screens need (suggested types)

```ts
type Category = "document_comparison" | "new_si_request" | "invoice_query" | "general" | "spam";
type Result = "no_mismatch" | "mismatch" | "needs_review" | "not_compared" | "failed";
type Field = "shipper" | "consignee" | "notify_party" | "port_of_loading" | "port_of_discharge" | "container_count" | "gross_weight_kg";
interface FieldComparison { field: Field; si: string | number | null; bl: string | number | null; match: boolean; blLabel?: string }
interface EmailResult { emailId: string; batchId: string; category: Category; result: Result; fields?: FieldComparison[]; reviewReason?: string; status: "processed" | "processing" | "failed" }
```

The self-evaluation shape (`sample_submission.json`, keyed by `email_id`, with category, whether a mismatch was found and the differing fields) can be exported from the same records.

## Accessibility and quality bar

Use real `<button>`, `<a>`, `<label>` + `<input>`; icon-only buttons need `aria-label`. All text tokens already meet 4.5:1 on `surface-page`, `surface-card` and `surface-inset` in both themes; do not put `text-subtle` on `surface-inset` for essential text. Test every screen in light and dark. Touch targets at least 40px high (buttons are 40px, small 32px is for dense tables only).

## Confidence score (Review, Batches, Report, Dashboard, Email, Shipments)

The pipeline gives every classification, extracted value and comparison a confidence from 0 to 100. Always show the number, never only a color. Thresholds: 85 and above is high (`confidence-high`, teal meter), 60 to 84 is medium (`confidence-mid`, orange), below 60 is low (`confidence-low`, red, labelled "Low"). Auto-accept threshold is 85%: anything below goes to `/review`. Rendering: a 6px meter (`.meter` in `design/ui.css`) plus the percentage in tabular numerals; not-compared rows show "n/a".

- `/review`: each case in the list and the case header shows its confidence; the evidence panel shows per-value confidence for the extracted SI and BL values and why it fell below 85.
- `/batches`: a Confidence column in the table (meter + number); optional filter "Low confidence"; batch summary shows the average confidence.
- `/emails/[emailId]` report: overall confidence in the verdict card and a per-field confidence column; email detail shows classification confidence.
- `/dashboard`: "Average confidence" KPI and the auto-accept threshold; `/shipments`: confidence in the detail panel.
