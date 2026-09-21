# Prompt for Claude Code

Paste the block below into Claude Code, run from the repo root.

```
Build the APRIL Group shipping-document-verification UI in this Next.js app so it looks the same as the wireframes.

Read first, in this order:
1. AGENTS.md and CLAUDE.md (this Next.js version has breaking changes; check node_modules/next/dist/docs/ before writing code).
2. docs/design-handoff.md (routes, per-page specs, tokens, confidence-score rules, data types).
3. design/README.md and design/tokens.json (design-system rules).
4. design/ui.css and every file in design/screens/*.html. These are the visual spec: open each in a browser (or read the markup) and reproduce spacing, colors, copy, and structure exactly. Each has a light/dark toggle bottom-right. Sample data in them is placeholder; replace it with real data.

Rules:
- app/globals.css already contains the tokens (light, dark, Tailwind v4 @theme inline mappings). Use those tokens; do not hard-code hex values.
- The look: solid navy brand surface for the sidebar and the landing hero, cards on surface-card, small orange hints (logo dot, active-nav icon, review count badge, avatar, eyebrow, highlighted bar, entry port and route arc, review callout). Not overwhelming, no large orange areas, no shadows, 1px borders.
- Show a confidence score (meter + number) on Review, Batches, Report, Dashboard, Email detail and Shipments. Thresholds: >=85 high (teal), 60-84 medium (orange), <60 low (red, labelled "Low"). Always show the number.
- Every status uses a word plus an icon, not color alone. Use lucide-react for icons.
- Support light and dark (prefers-color-scheme, plus data-theme override).
- Build the shared signed-in layout (240px navy sidebar + main column) once, then the pages in this order: layout, /dashboard, /batches, /emails/[emailId], /review, /upload (restyle existing form, keep its logic), /shipments (WebGL globe with globe.gl or three; entry port orange, exit port action color, lifted arc), then the landing page / with Supabase Google OAuth (signInWithOAuth, /auth/callback route, redirect to /dashboard).
- Keep existing API and Supabase logic working. Protect all routes except / behind sign-in.
- Where real data does not exist yet, add typed mock data in lib/mock/ behind the same types as docs/design-handoff.md, so pages render now and swap to real data later.

After building each page: run it, take a screenshot in light and dark, compare against the matching design/screens/*.html, and fix differences before moving on. At the end, run lint and a production build, and list anything you could not match.

Backup references if a file is missing: screens https://claude.ai/artifact/6Y9g4FxZ8ha4r1jCDDhedv, design system https://claude.ai/artifact/XLkHSFyfvjVxsraFNmCSpo.
```
