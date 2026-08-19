# Expense Tracking

A personal expense tracker where the primary input is **paste free text and let an LLM
structure it**. Built mobile-first for one thumb on an iPhone, in Indonesian, in rupiah.

Live at **[expensetracking.online](https://expensetracking.online)** · v0.1.0

```
paste free text  ──►  POST /api/parse (GLM-5.2)  ──►  editable review table
                                                            │
                                        attach photos ──────┤
                                                            ▼
                                                   createExpense() ──► /e/[id]
```

Paste this:

```
bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k
```

…and get back the title `bakar duit tuesday`, the date `2026-08-18`, six categorised items
and a total of `Rp 266.350`, in an editable table you can fix with one tap before saving.

<p align="center">
  <img src="docs/media/parse.gif" width="300" alt="Pasting seven lines of Indonesian expense notes and tapping Rapikan; a skeleton appears while GLM-5.2 parses, then an editable table with six categorised items and a Rp 266.350 total.">
</p>

<p align="center"><em>Real capture: a real GLM-5.2 round trip against the fixture corpus, not a mockup.</em></p>

---

## Demo

Everything below is captured from the running app at 414×896 — the iPhone XS Max the design
targets — with seeded fixture data.

<table>
<tr>
<td width="33%" align="center">
  <img src="docs/media/category.gif" width="230" alt="Tapping an item row opens a bottom sheet; tapping the category chip opens a two-column picker; choosing Tempat Tinggal updates the row.">
  <br><strong>Fix a category</strong><br>
  <sub>Row → bottom sheet → 2-col picker.<br>The LLM guesses; you override in one tap.</sub>
</td>
<td width="33%" align="center">
  <img src="docs/media/stats.gif" width="230" alt="Tapping bars in the 12-month chart moves the readout to that month, then scrolling reveals the category bar list.">
  <br><strong>Twelve months</strong><br>
  <sub>Tap a bar, the readout follows.<br>April is empty on purpose — zero months are drawn, not closed.</sub>
</td>
<td width="33%" align="center">
  <img src="docs/media/04-month.png" width="230" alt="Month view: Agustus 2026, Rp 1.661.826 total, expense groups sub-grouped by day.">
  <br><strong>The month</strong><br>
  <sub>Total in the header, groups<br>sub-grouped by day, newest first.</sub>
</td>
</tr>
<tr>
<td width="33%" align="center">
  <img src="docs/media/05-detail.png" width="230" alt="Expense detail: title, date, note, six inline-editable item rows with category codes, and the total.">
  <br><strong>Detail</strong><br>
  <sub><code>/e/[id]</code> — everything inline-editable.</sub>
</td>
<td width="33%" align="center">
  <img src="docs/media/07-share.png" width="230" alt="Public share page: title, date, note, items and total, with no owner identity and no edit affordances.">
  <br><strong>Shared, read-only</strong><br>
  <sub><code>/s/[token]</code> — no login. Note the<br>absence: no raw text, no edit, no identity.</sub>
</td>
<td width="33%" align="center">
  <img src="docs/media/08-month-dark.png" width="230" alt="The same month view rendered in dark mode.">
  <br><strong>Dark</strong><br>
  <sub>From <code>prefers-color-scheme</code>.<br>There is no toggle, on purpose.</sub>
</td>
</tr>
</table>

<details>
<summary>Sign-in and the parsed review table</summary>
<p align="center">
  <img src="docs/media/01-signin.png" width="260" alt="Sign-in landing: the wordmark, the tagline, and a single Lanjut dengan Google button.">
  &nbsp;&nbsp;
  <img src="docs/media/03-new-review.png" width="260" alt="The review stage: editable title, date, and six item rows each with a category chip and amount, above a sticky total and Simpan button.">
</p>
</details>

---

## What it does

- **Paste → parse.** One textarea, one *Rapikan* button. GLM-5.2 handles Indonesian money
  notation (`45k`, `45rb`, `1,5jt`, `Rp 38.500` where `.` is a thousands separator),
  `DD/MM/YYYY` dates, day names, title extraction and per-item categorisation.
- **Never hard-blocked.** Zod-validate the model's tool output → one repair round trip → a
  deterministic regex fallback parser. A 25 s timeout or an LLM outage degrades to the
  fallback rather than losing the paste. Drafts also survive a mis-tap via `localStorage`.
- **Photos as opaque attachments.** Food, tickets, BCA QRIS screenshots. Compressed
  client-side to ≤1600 px / ~300 KB / JPEG q0.8 (EXIF stripped) and uploaded straight to
  Vercel Blob, so the 4.5 MB serverless body limit never comes into play.
- **Monthly rollups.** `/m/[month]` lists groups newest-first, sub-grouped by day, with the
  month total in the header. `/stats` gives a 12-month bar chart, a month-over-month delta,
  a category bar list and the biggest-single-expense callout — all aggregated in SQL.
- **Read-only sharing.** Any group can be shared at `/s/<token>` (`nanoid(12)`, ~71 bits):
  no login, no indexing, no caching, revocable by deleting the row.
- **Eight categories**, each with an Indonesian label and a two-letter mono code —
  `MJ` Makan & Jajan, `BH` Belanja Harian, `TR` Transport, `TG` Tagihan, `TT` Tempat
  Tinggal, `HB` Hiburan, `KS` Kesehatan, `LN` Lainnya. Exactly eight, so the picker fits a
  2×4 tap grid in a bottom sheet.

**Not** in v0.1.0: budgets, recurring expenses, multi-currency, export, receipt OCR,
search, tags beyond the eight categories, household accounts, offline writes, push
notifications, editing on the shared page.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.1 App Router, RSC, Server Actions, Node runtime everywhere |
| UI | React 19.2.8, Tailwind CSS v4 (CSS-first `@theme`), Recharts 3 |
| Auth | Auth.js v5 (`next-auth@5.0.0-beta.32`), Google provider only, JWT sessions + Drizzle adapter |
| Database | Neon Postgres via `@neondatabase/serverless`, Drizzle ORM 0.45 |
| Files | Vercel Blob client uploads |
| LLM | GLM-5.2 through z.ai's Anthropic-compatible endpoint, via `@anthropic-ai/sdk` |
| Validation | Zod 4 |
| Tests | Vitest 4 |
| Host | Vercel Hobby, region `sin1` |

> **On the LLM SDK.** z.ai exposes an *Anthropic-compatible* endpoint, so
> `@anthropic-ai/sdk` is the right client — constructed with `baseURL` + `apiKey`
> overrides. GLM-5.2 is **not** a Claude model: never send `thinking`, `output_config`,
> `effort`, `speed` or any `betas`. Structured output comes from **tool use with a single
> forced tool**, which is the portable mechanism across Anthropic-compatible servers.

---

## Getting started

Requires **Node ≥ 22**, a Neon project, a Google OAuth client and a z.ai API key.

```bash
npm install
cp .env.example .env.local     # then fill in every blank
npm run db:migrate             # apply drizzle/ to Neon (uses the UNPOOLED URL)
npm run dev                    # http://localhost:3000
```

Register `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI on
the Google OAuth client, or sign-in will fail three redirects later with an opaque error.

### Environment

Every variable is **server-only**. None may ever be prefixed `NEXT_PUBLIC_` — that prefix
inlines the value into the client bundle. `lib/env.ts` validates them with Zod at import
time, so a missing value is a loud crash with a readable message, never a silent
`undefined`.

| Variable | Notes |
|---|---|
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | `LLM_BASE_URL` takes no trailing slash and no `/v1` suffix — the SDK appends `/v1/messages` itself, and a doubled `/v1` 404s in a way that reads like an auth failure |
| `DATABASE_URL` | **Pooled** Neon string (host contains `-pooler`). Runtime only |
| `DATABASE_URL_UNPOOLED` | **Direct** Neon string. `drizzle-kit` migrate/studio only; migrating through the pooler fails confusingly |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud Console OAuth 2.0 client |
| `AUTH_URL` | Production only. Auth.js infers the origin locally and on preview |
| `BLOB_READ_WRITE_TOKEN` | Auto-injected by Vercel; locally use `vercel env pull .env.local` |

### Scripts

```bash
npm run dev            # next dev (predev copies the compression worker into public/vendor/)
npm run build          # next build (Turbopack; no linting — Next 16 dropped that)
npm run typecheck      # next typegen && tsc --noEmit
npm run lint           # eslint          (lint:fix to autofix)
npm run format         # prettier        (format:check in CI)

npm test               # vitest run — unit suite, no network, no database
npm run test:int       # integration suite against a real Neon database (opt-in)
npm run test:live      # hits the real GLM-5.2 endpoint over the fixture corpus (costs money)

npm run db:generate    # generate a migration from lib/db/schema.ts
npm run db:migrate     # apply migrations
npm run db:studio      # drizzle studio
npm run db:smoke       # connection smoke test
npm run blob:usage     # report blob storage usage    (blob:sweep --delete to reap orphans)
npm run icons:generate # regenerate PWA icons from public/brand/mark.svg
```

Plus the mechanical gates, kept in the repo because every one of these fails *silently* —
Tailwind emits nothing for a class it cannot resolve, and a sub-17 px input re-introduces a
Safari zoom that tapping away does not undo:

```bash
bash scripts/f05-audit.sh      # /new
bash scripts/f07-audit.sh      # /m/[month] and /e/[id]
bash scripts/f08-audit.sh      # /stats bundle, palette and honesty checks
bash scripts/f09-audit.sh      # is the public share page actually public-safe
python3 scripts/palette-check.py   # WCAG contrast + categorical separation
```

`/dev/ui` is a kitchen-sink page rendering every primitive in both themes at 414×896. It
404s in production.

---

## Architecture

```
app/
  (bare)/          # no tab bar: /, /new, /e/[id], /s/[token]
  (shell)/         # tab bar via AppShell: /m/[month], /stats, /dev/ui
  actions/         # every mutation — expenses, items, photos, share
  api/             # parse, photos/upload, auth/[...nextauth], health
components/        # ui/ primitives, photos/, share/, auth/
lib/
  db/              # schema, client, queries (the userId-scoping invariant lives here)
  llm/             # client, prompt, parseExpense, fallbackParse, fixture corpus
  photos/          # compression, pathname, boundary types
  stats/ share/ auth/ scroll/ hooks/
  categories.ts format.ts env.ts schema/expense.ts id.ts
drizzle/           # generated migrations — never hand-edited
docs/              # roadmap, reconciliation record, ten feature plans, design integration
tests/             # cross-cutting suites; feature suites are co-located in __tests__/
```

### Routes

| Path | Auth | Purpose |
|---|:--:|---|
| `/` | — | Signed out: landing + Google button. Signed in: redirect to `/m/<current month>` |
| `/new` | ✅ | Paste → parse → review → photos → save |
| `/m/[month]` | ✅ | `YYYY-MM`. Month total, per-day grouped list, prev/next month |
| `/e/[id]` | ✅ | Group detail: inline-editable items, photo gallery, share, delete |
| `/stats` | ✅ | 12-month growth chart, category bar list, delta, biggest expense |
| `/s/[token]` | ❌ | Public read-only group view, `noindex`, uncacheable |
| `POST /api/parse` | ✅ | `{ rawText, todayISO }` → `ParsedExpense`. 8 000-char cap, 10 req/min burst limit |
| `POST /api/photos/upload` | ✅ | Vercel Blob `handleUpload` callback |
| `GET /api/health` | ❌ | Liveness probe. Deliberately minimal payload: `{ ok, db, commit }` |

The bottom tab bar has three destinations — **Bulan Ini**, **Tambah** (centre, raised) and
**Statistik** — and is rendered only by the `(shell)` group. A detail view is a pushed view
with a back chevron, not a tab destination; `/new` ends in a full-width *Simpan* exactly
where the bar would otherwise sit.

### Data model

`expense_groups` → `expense_items` / `expense_photos` / `share_links`, all cascading from
the group, and the group cascading from the Auth.js `users` row. Amounts are **whole
rupiah** stored as `bigint` (D5: no cents, no FX). Dates are `date`, not timestamps —
day-granular, fixed to `Asia/Jakarta` (D9, D10). Group totals are always computed with SQL
`SUM`, never denormalised onto a column (D7), so there is nothing to drift or invalidate.
Revoking a share is `DELETE FROM share_links`; re-sharing mints a fresh token, and a UNIQUE
constraint on `group_id` keeps it to one live link per group.

### Mutations

Every mutation is a **Server Action** in `app/actions/`. Route Handlers exist only for the
three cases that cannot be actions: `/api/parse`, `/api/photos/upload`, and the Auth.js
handler.

Two constraints worth knowing before adding one:

- **No interactive transactions.** The `neon-http` driver has no `db.transaction()`.
  Multi-statement atomic writes (`createExpense`, `createShareLink`) use `db.batch([...])`,
  which Neon runs as one transaction in one HTTP request.
- **Photo rows cannot precede their group.** `expense_photos.group_id` is `NOT NULL` with an
  FK, so `createExpense` takes staged `photos: NewPhotoInput[]` and inserts group + items +
  photos in that one batch. Bytes upload while the user is still editing the table.

---

## The one security invariant

**Every Server Action opens with `const userId = await requireUserId()`, and every query is
filtered by that `userId` — including nested ones.** An item update must reach back to
`expense_groups.user_id` to prove ownership. `lib/db/queries.ts` owns that primitive and
exports the correlated `EXISTS` predicates (`itemOwnedBy`, `photoOwnedBy`,
`shareLinkOwnedBy`) plus the ownership anchors; callers **import, never re-declare** them,
because the failure mode of a second copy is silent — the day one is hardened, the other is
not.

`NotFoundError` deliberately cannot distinguish "does not exist" from "belongs to someone
else". Distinguishing them would be an ownership oracle for enumerating other users' ids.

**`proxy.ts` is not the security boundary.** Next.js routes Server Actions as POST requests
to the page they live on, so a proxy matcher that skips a path also skips its actions —
and a refactor that moves an action to another route silently removes that coverage.
`proxy.ts` is a UX redirect that sends signed-out humans to the sign-in page with a `next`
param instead of a flash of empty chrome. It uses a **positive** matcher
(`/new`, `/m/:path*`, `/e/:path*`, `/stats`) so `/s/:token` staying public is structural
rather than incidental.

---

## Testing

```bash
npm test          # ~770 tests across 44 files, ~2 s, no network and no database
```

The unit suite is hermetic by design and covers the parts where a silent bug is most
expensive: the ownership SQL, `parseIdrLoose` and the Jakarta date helpers, the draft
reducer and its versioned `localStorage` codec, the proxy matcher, the open-redirect guard,
the stats maths, and a twelve-paste Indonesian fixture corpus for the parser.

Two suites are opt-in because they reach outside the process:

- `npm run test:int` (`VITEST_INTEGRATION=1`) runs `tests/integration/` against a real
  Neon database. Excluded from `npm test` by default so a plain test run can never need a
  connection string.
- `npm run test:live` (`LLM_LIVE_TEST=1`) runs the fixture corpus against the real GLM-5.2
  endpoint. Run it after any unexplained parsing complaint: z.ai aliases `glm-5.2` upward,
  so a future model release can change parser behaviour with no change on our side. Costs
  and latencies — including why we don't stream — are measured in `lib/llm/COST.md`.

There is one Vitest config, `vitest.config.ts`, and it is the union of what every feature
needs. Do not add a second one. It aliases `server-only` to a stub, without which any module
opening with `import 'server-only'` is untestable as shipped — including the ownership SQL,
which is where this app's core security property lives.

---

## Deployment

Vercel, region `sin1`, production on `expensetracking.online`. Push env vars with
`./scripts/vercel-env-push.sh` (dry-run by default; prints names and value lengths, never
values). `docs/plans/F01-deployment-runbook.md` is the step-by-step: link the project, push
the vars, deploy preview then production, attach the domain, point DNS at Domainesia,
verify live via `/api/health`, then hand the deploys to Git.

`next.config.ts` carries the two things that must not drift: a narrowed
`images.remotePatterns` entry so `/_next/image` is not an open optimising proxy for the whole
blob store, and the `/s/:token` response headers (`private, no-store`, `X-Robots-Tag:
noindex, nofollow, noarchive`). Both are belts to braces the app already wears, and both
guard failure modes that are invisible: a cached copy of a revoked share page looks exactly
like a working one, and an indexed unguessable URL is no longer unguessable.

---

## iOS notes

The target device is an iPhone XS Max (414×896 CSS px). Three lines carry most of the
weight, and all three fail silently:

- `viewportFit: 'cover'` in `app/layout.tsx` — without it every
  `env(safe-area-inset-*)` in `globals.css` returns 0 and every safe-area rule quietly does
  nothing, putting the tab bar under the home indicator.
- **A 17 px minimum font size on every input.** This — not `user-scalable=no` — is the fix
  for Safari's zoom-on-focus. Pinch-zoom stays on deliberately; disabling it for everyone is
  an accessibility failure.
- `100dvh`, not `100vh`.

`appleWebApp` metadata plus a manifest and maskable icons make *Add to Home Screen* give a
chrome-less app rather than a bookmark. Light and dark come from `prefers-color-scheme` —
there is no toggle.

---

## Docs

| File | What it is |
|---|---|
| `ROADMAP_v0.1.0.md` | The authoritative shared contract: decisions D1–D10, schema, actions, routes, env |
| `docs/RECONCILIATION_v0.1.0.md` | The arbitration record. Rulings **R-1…R-130** supersede both the roadmap and any plan file |
| `docs/plans/F01…F10-*.md` | One plan per feature, each with its own checklist and rulings |
| `docs/plans/F01-deployment-runbook.md` | Vercel + DNS, step by step |
| `docs/design/DESIGN_INTEGRATION.md` | What the design pull changed, and the measurements to build to |
| `lib/llm/COST.md` | Measured tokens, latency and cost per parse; why we don't stream |
| `AGENTS.md` | Read the Next.js 16 docs in `node_modules/next/dist/docs/` before writing code — this is not the Next.js you remember |

Ten features (F01–F10) landed for v0.1.0, in the order
`F01 → F03a → F10 → F03b → F02 → (F04, F06) → (F05, F07) → (F08, F09)`.

**Core tenet: simplicity.** No feature flags, no admin panel, no settings page, no dark-mode
toggle, no i18n layer. Every feature earns its place or gets cut.
