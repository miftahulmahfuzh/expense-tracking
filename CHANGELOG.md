# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Rulings
`R-1…R-130` in `docs/RECONCILIATION_v0.1.0.md` remain the arbitration record for *why* a
thing landed the way it did; this file records only *what* landed.

## [v0.1.0] - 2026-08-19

First release. Ten features (F01–F10) built in the order
`F01 → F03a → F10 → F03b → F02 → (F04, F06) → (F05, F07) → (F08, F09)`, live at
[expensetracking.online](https://expensetracking.online).

### Added

**Paste → parse (F04).** `POST /api/parse` turns a free-text Indonesian paste into a title,
a date and categorised items. GLM-5.2 through z.ai's Anthropic-compatible endpoint, driven
by a single forced tool (`record_expense`) rather than a JSON-mode prompt, so the mechanism
is portable across Anthropic-compatible servers. Handles `45k` / `45rb` / `1,5jt` /
`Rp 38.500` money notation, `DD/MM/YYYY` dates and day names.

**Never hard-blocked (F04).** Zod-validate the tool output → one repair round trip → a
deterministic regex fallback parser. A 25 s timeout or an LLM outage degrades to the
fallback instead of losing the paste. The route also carries auth, an input cap, a burst
limit and human-readable errors. A 12-paste fixture corpus covers both paths, plus a live
suite (`npm run test:live`) held green across three consecutive runs.

**Add-expense flow (F05).** `/new` in two stages — paste, then an editable review table.
Draft state is a reducer persisted through a versioned `localStorage` codec, so a mis-tap
does not cost the paste. Sticky total-and-*Simpan* bar tracks the visual viewport (iOS
keyboard). `createExpense()` writes group, items and photos in one `db.batch`.

**Auth (F02).** Auth.js v5 with Google as the only provider, JWT sessions and the Drizzle
adapter. `requireUserId()` is the boundary every action and page opens with. `proxy.ts`
uses a **positive** matcher (`/new`, `/m/:path*`, `/e/:path*`, `/stats`) so `/s/:token`
staying public is structural, not incidental — and it is a UX redirect, never the security
boundary. Sign-in redirects pass through an open-redirect guard.

**Data layer (F03).** Neon Postgres over `@neondatabase/serverless` with Drizzle ORM.
Four app tables (`expense_groups`, `expense_items`, `expense_photos`, `share_links`) beside
the four Auth.js adapter tables, one applied migration, and a read layer whose ownership
predicates (`itemOwnedBy`, `photoOwnedBy`, `shareLinkOwnedBy`) are exported from
`lib/db/queries.ts` for callers to import — never re-declare. Integration suite runs green
under four timezones.

**History and editing (F07).** `/m/[month]` lists groups newest-first, sub-grouped by day,
month total in the header. `/e/[id]` renders a group with every field inline-editable.

**Stats (F08).** `/stats` gives a 12-month bar chart, a month-over-month delta, a category
bar list and the biggest-single-expense callout — all aggregated in SQL, with empty months
drawn rather than closed.

**Photos (F06).** Compressed client-side in a web worker to ≤1600 px / ~300 KB / JPEG q0.8
with EXIF stripped, then uploaded straight to Vercel Blob so the 4.5 MB serverless body
limit never applies. `PhotoPicker` (74 px strip, progress, cancel, per-file retry),
`PhotoGallery` with a hand-rolled lightbox, and an orphan-blob sweeper
(`npm run blob:usage` / `blob:sweep`).

**Read-only sharing (F09).** Any group is shareable at `/s/<token>` — `nanoid(12)`, ~71 bits
— with no login, `noindex` headers and dynamic-only caching. `createShareLink` is an
idempotent get-or-create; revoking deletes the row. The public page omits raw paste text,
edit affordances and owner identity.

**Design system (F10).** Tailwind CSS v4 CSS-first `@theme` tokens from the Claude Design
pull, an iOS base layer with `viewport-fit=cover`, self-hosted Source Serif 4 and IBM Plex
Mono built at install time, and UI primitives — Button, Card, Money, Field, Input, TextArea,
MoneyInput, Sheet, Chip, CategoryPicker, EmptyState, Toast, TabBar. PWA manifest, generated
icon set, and a palette contrast gate. Dark mode comes from `prefers-color-scheme`; there is
deliberately no toggle.

**Eight categories (F03a).** Each with an Indonesian label, a colour token and a two-letter
mono code — `MJ`, `BH`, `TR`, `TG`, `TT`, `HB`, `KS`, `LN`. Exactly eight, so the picker
fits a 2×4 tap grid in a bottom sheet. Alongside them: `nanoid` ids with an `isValidId`
shape gate, `formatIdr` / `formatIdrCompact` / `parseIdrLoose`, and Asia/Jakarta date
helpers with Indonesian month names.

**Foundation (F01).** Next.js 16.3.1 App Router on a pinned dependency set, Node runtime
everywhere, Zod-validated environment that crashes the process at boot on a missing
variable, `/api/health`, Vitest 4 with 45 test files, ESLint flat config and Prettier.
Serverless functions pinned to `sin1` (Singapore).

**Docs.** `README.md` with captured screenshots and demo GIFs from the running app,
`ROADMAP_v0.1.0.md` as the shared contract, `docs/RECONCILIATION_v0.1.0.md` holding rulings
`R-1…R-130`, one plan file per feature, a Vercel + DNS deployment runbook, measured LLM cost
notes in `lib/llm/COST.md`, and `AGENTS.md` pointing at the Next.js 16 docs in
`node_modules/next/dist/docs/`.

### Security

- Every Server Action opens with `const userId = await requireUserId()`, and every query is
  filtered by that `userId` — including nested ones. An item update reaches back to
  `expense_groups.user_id` to prove ownership.
- `NotFoundError` deliberately cannot distinguish "does not exist" from "belongs to someone
  else", so it cannot be used as an ownership oracle for enumerating other users' ids.
- `.env.example` is the only committed env file; every variable in it is server-only and
  none may ever carry a `NEXT_PUBLIC_` prefix.

### Known gaps

Deliberately **not** in v0.1.0: budgets, recurring expenses, multi-currency, export, receipt
OCR, search, tags beyond the eight categories, household accounts, offline writes, push
notifications, and editing on the shared page. Also absent by the core tenet of simplicity:
feature flags, an admin panel, a settings page, a dark-mode toggle and an i18n layer.

### Notes

The eight `fix:` commits and one `revert:` commit in this range all corrected code that had
not yet been released, so they are folded into the entries above rather than listed
separately. The revert is worth naming: a ghost-click guard on the bottom sheet was dropped
because it fixed a bug that did not exist.

[v0.1.0]: https://github.com/miftahulmahfuzh/expense-tracking/releases/tag/v0.1.0
