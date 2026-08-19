# Expense Tracking — Roadmap v0.1.0

**Domain:** expensetracking.online · **Host:** Vercel Hobby · **DB:** Neon Postgres (free) · **Blob:** Vercel Blob (free) · **LLM:** GLM-5.2 via z.ai Anthropic-compatible endpoint

> **Core tenet: simplicity.** Single-user-feeling, mobile-first (iPhone XS Max, 414×896 CSS px, safe-area insets). Every feature below earns its place or gets cut. No feature flags, no admin panel, no settings page, no dark-mode toggle (follow system), no i18n layer (copy is Indonesian-flavoured English, hardcoded).

---

## 1. Product summary

A personal expense tracker where the primary input is **paste free text, let the LLM structure it**. Secondary input is **photos** (food, tickets, BCA QRIS screenshots) attached to an expense group for later recall. Expenses roll up **monthly** with a growth chart and category breakdown. Any single expense group can be **shared read-only via a secret link**.

### The one flow that matters

```
paste free text  ──►  POST /api/parse (GLM-5.2)  ──►  editable review table
                                                            │
                                        attach photos ──────┤
                                                            ▼
                                                   saveExpense() ──► /e/[id]
```

### Canonical example input

```
bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k
```

→ title `bakar duit tuesday`, occurredOn `2026-08-18`, 6 items, total `Rp 266.350`.

---

## 2. Decisions locked (do not re-litigate)

| # | Decision | Rationale |
|---|---|---|
| D1 | LLM auto-assigns a category per item; user can override with one tap | GLM is not 100% accurate; override is cheap |
| D2 | Photos → Vercel Blob, compressed **client-side** to ≤1600px / ~300KB before upload | Free tier is 1 GB; ~3000+ photos at that size |
| D3 | Any Google account may sign in; **all data is scoped per `userId`** | Multi-user from day one, no allowlist |
| D4 | Sharing = unguessable token URL `/s/<token>`, no login, view-only, revocable | Matches "send to a friend over WhatsApp" |
| D5 | Currency is **IDR only**, stored as whole rupiah integers. No cents, no FX | Rupiah has no subunit in practice |
| D6 | **Server Actions** for every mutation. Route Handlers only for `/api/parse`, `/api/photos/upload`, `/api/auth/[...nextauth]` | Fewest files, least boilerplate |
| D7 | Group totals are **computed with SQL `SUM`**, never denormalised onto a column | No drift, no invalidation bugs |
| D8 | No image understanding. Photos are opaque attachments | Explicit user requirement |
| D9 | Timezone is **fixed to `Asia/Jakarta`** everywhere | Single-region personal app |
| D10 | Dates are stored as `date` (no time). "When did I spend" is day-granular | Simplicity |

---

## 3. Stack (pinned)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, TypeScript, RSC | `next@16.3.1` |
| React | | `react@19.2.8` |
| Auth | Auth.js v5 (`next-auth` beta), Google provider only | `next-auth@5.0.0-beta.32` |
| Auth adapter | Drizzle adapter | `@auth/drizzle-adapter@1.11.3` |
| ORM | Drizzle + Neon serverless driver | `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@neondatabase/serverless@1.1.0` |
| Blob | Vercel Blob client uploads | `@vercel/blob@2.8.0` |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | `tailwindcss@4.3.3` |
| Charts | Recharts | `recharts@3.10.1` |
| Validation | Zod | `zod@4.4.3` |
| LLM client | `@anthropic-ai/sdk` with `baseURL` override | `@anthropic-ai/sdk@0.117.1` |
| Image compression | `browser-image-compression` | `2.0.2` |

> **On the LLM SDK:** z.ai exposes an *Anthropic-compatible* endpoint at `https://api.z.ai/api/anthropic`, so `@anthropic-ai/sdk` is the correct client — construct it with `baseURL` + `apiKey` overrides. GLM-5.2 is **not** a Claude model: do **not** send `thinking`, `output_config`, `effort`, `speed`, or any `betas`. Structured output comes from **tool use with a single forced tool**, which is the portable mechanism across Anthropic-compatible servers.

---

## 4. Shared contract — AUTHORITATIVE

Every feature plan must build against exactly this. If a plan needs to change something here, it must say so explicitly in a `## Contract deltas` section rather than silently diverging.

### 4.1 Categories (`lib/categories.ts`)

```ts
export const CATEGORIES = [
  'food',          // Makan & Jajan — warung, resto, kopi, snack
  'groceries',     // Belanja Harian — Indomaret, Alfamart, supermarket
  'transport',     // Transport — bensin, parkir, tol, ojek, grab
  'bills',         // Tagihan — internet, listrik, pulsa, IPL, iuran
  'housing',       // Tempat Tinggal — sewa apartemen, kos, service charge
  'entertainment', // Hiburan — bioskop, game, langganan streaming
  'health',        // Kesehatan — obat, dokter, vitamin
  'other',         // Lainnya
] as const
export type Category = (typeof CATEGORIES)[number]
```

Each category has a `label` (Indonesian), an `emoji`, and a `color` CSS custom-property name. Exactly 8 — fits a 2×4 tap grid in a bottom sheet.

### 4.2 Database schema (`lib/db/schema.ts`)

Auth.js tables (`users`, `accounts`, `sessions`, `verificationTokens`) come from the standard Drizzle adapter shape — **do not hand-roll them**.

```
expense_groups
  id           text PK                       -- nanoid(12)
  user_id      text NOT NULL  → users.id ON DELETE CASCADE
  title        text NOT NULL                 -- "bakar duit tuesday"
  occurred_on  date NOT NULL                 -- 2026-08-18 (Asia/Jakarta day)
  note         text NULL
  raw_text     text NULL                     -- original paste, kept for re-parse/audit
  created_at   timestamptz NOT NULL DEFAULT now()
  updated_at   timestamptz NOT NULL DEFAULT now()
  INDEX (user_id, occurred_on DESC)

expense_items
  id           text PK                       -- nanoid(12)
  group_id     text NOT NULL  → expense_groups.id ON DELETE CASCADE
  name         text NOT NULL                 -- ≤120 chars
  amount_idr   bigint NOT NULL               -- whole rupiah, ≥ 0
  category     text NOT NULL                 -- one of CATEGORIES
  sort_order   integer NOT NULL DEFAULT 0
  INDEX (group_id)

expense_photos
  id            text PK                      -- nanoid(12)
  group_id      text NOT NULL → expense_groups.id ON DELETE CASCADE
  blob_url      text NOT NULL                -- public Vercel Blob URL
  blob_pathname text NOT NULL                -- needed for del()
  width         integer NULL
  height        integer NULL
  size_bytes    integer NULL
  sort_order    integer NOT NULL DEFAULT 0
  created_at    timestamptz NOT NULL DEFAULT now()
  INDEX (group_id)

share_links
  token       text PK                        -- nanoid(12), URL-safe
  group_id    text NOT NULL UNIQUE → expense_groups.id ON DELETE CASCADE
  created_at  timestamptz NOT NULL DEFAULT now()
```

> **Revoking a share = `DELETE FROM share_links`.** Re-sharing mints a fresh token. One active link per group, enforced by the UNIQUE constraint. No expiry column in v0.1.0.

### 4.3 Zod contract (`lib/schema/expense.ts`)

```ts
export const ParsedItem = z.object({
  name:       z.string().trim().min(1).max(120),
  amount_idr: z.number().int().min(0).max(1_000_000_000),
  category:   z.enum(CATEGORIES),
})

export const ParsedExpense = z.object({
  title:       z.string().trim().min(1).max(120),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items:       z.array(ParsedItem).min(1).max(50),
})
```

`ParsedExpense` is the **single boundary type** between F04 (parser) and F05 (add flow). It is also the exact shape of the LLM tool's `input_schema`.

### 4.4 Server Actions (`app/actions/`)

| File | Export | Signature |
|---|---|---|
| `expenses.ts` | `createExpense` | `(input: ParsedExpense & { note?, rawText?, photoIds? }) → { id }` |
| | `updateExpenseMeta` | `(id, { title?, occurredOn?, note? }) → void` |
| | `deleteExpense` | `(id) → void` |
| `items.ts` | `addItem` | `(groupId, { name, amountIdr, category }) → { id }` |
| | `updateItem` | `(id, { name?, amountIdr?, category? }) → void` |
| | `deleteItem` | `(id) → void` |
| `photos.ts` | `attachPhoto` | `({ groupId, blobUrl, blobPathname, width, height, sizeBytes }) → { id }` |
| | `deletePhoto` | `(id) → void` (also `del()`s the blob) |
| `share.ts` | `createShareLink` | `(groupId) → { token }` |
| | `revokeShareLink` | `(groupId) → void` |

**Every action** starts with `const userId = await requireUserId()` and **every** query is filtered by `userId`, including nested ones (an item update must join back to `expense_groups.user_id`). This is the single most important security invariant in the app.

### 4.5 Route Handlers

| Route | Purpose |
|---|---|
| `POST /api/parse` | Body `{ rawText, todayISO }` → `ParsedExpense`. Auth-required. |
| `POST /api/photos/upload` | Vercel Blob `handleUpload` callback. Auth-required. |
| `GET/POST /api/auth/[...nextauth]` | Auth.js handler |

### 4.6 Page routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | — | Signed out: landing + Google button. Signed in: redirect `/m/<current YYYY-MM>` |
| `/new` | ✅ | Paste → parse → review → photos → save |
| `/m/[month]` | ✅ | `YYYY-MM`. Month total, per-day grouped list, prev/next month |
| `/e/[id]` | ✅ | Group detail: items (inline editable), photo gallery, share, delete |
| `/stats` | ✅ | 12-month growth bar chart + current-month category donut |
| `/s/[token]` | ❌ | Public read-only group view incl. photos |

Bottom tab bar (3 tabs, safe-area aware): **Bulan Ini** (`/m/…`) · **Tambah** (`/new`, centre, raised) · **Statistik** (`/stats`).

### 4.7 Money & date helpers (`lib/format.ts`)

- `formatIdr(n: number): string` → `"Rp 38.500"` (dot thousands separator, `id-ID` locale, no decimals)
- `parseIdrLoose(s: string): number | null` → accepts `45k`, `45rb`, `1,5jt`, `Rp 38.500`, `38500`
- `TZ = 'Asia/Jakarta'`, `todayJakartaISO(): string`, `monthKey(date): 'YYYY-MM'`

### 4.8 Environment variables

```
LLM_API_KEY, LLM_BASE_URL, LLM_MODEL          # z.ai / GLM-5.2
DATABASE_URL, DATABASE_URL_UNPOOLED           # Neon
AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET
AUTH_URL                                       # https://expensetracking.online (prod only)
BLOB_READ_WRITE_TOKEN                          # auto-injected by Vercel
```

Validated once at boot in `lib/env.ts` with Zod. Missing var = loud crash, never a silent `undefined`.

---

## 5. Feature breakdown

Ten features. Dependency order matters: **F01 → F03 → F02** unblock everything else.

| ID | Feature | Depends on | Plan file |
|---|---|---|---|
| **F01** | Foundation & Deployment | — | `docs/plans/F01-foundation.md` |
| **F02** | Auth & Session | F01, F03 | `docs/plans/F02-auth.md` |
| **F03** | Data Layer & Contracts | F01 | `docs/plans/F03-data-layer.md` |
| **F04** | LLM Parsing Engine | F01, F03 | `docs/plans/F04-llm-parsing.md` |
| **F05** | Add Expense Flow | F02, F03, F04, F06 | `docs/plans/F05-add-expense.md` |
| **F06** | Photos: Upload, Storage, Gallery | F02, F03 | `docs/plans/F06-photos.md` |
| **F07** | History, Detail & Editing | F02, F03 | `docs/plans/F07-history-detail.md` |
| **F08** | Monthly Stats & Charts | F03, F07 | `docs/plans/F08-stats.md` |
| **F09** | Public Share Links | F03, F07 | `docs/plans/F09-sharing.md` |
| **F10** | Design System & iOS Polish | F01 | `docs/plans/F10-design-system.md` |

### F01 — Foundation & Deployment
Scaffold Next 16 + TS + Tailwind v4. `lib/env.ts` Zod validation. `.env.local` from supplied credentials. ESLint/Prettier. Vercel project + `expensetracking.online` DNS at Domainesia. Neon connection smoke test. `pnpm`/`npm` scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`.

### F02 — Auth & Session
Auth.js v5, Google provider only, Drizzle adapter, JWT strategy. `auth.ts` at repo root exporting `{ handlers, auth, signIn, signOut }`. `middleware.ts` protecting `/new`, `/m`, `/e`, `/stats` (explicitly **not** `/s`). `requireUserId()` helper that throws on unauthenticated. Sign-in page. Sign-out in a header menu. **Also produces the step-by-step Google Cloud Console walkthrough** for the user, including exact redirect URIs.

### F03 — Data Layer & Contracts
Drizzle schema for all tables above + Auth.js adapter tables. Migration generation and application to Neon. Typed query module `lib/db/queries.ts`: `getMonthGroups(userId, month)`, `getGroupDetail(userId, id)`, `getGroupByShareToken(token)`, `getMonthlyTotals(userId, months)`, `getCategoryBreakdown(userId, month)`. Zod contracts. `nanoid` id helper. **Owns the userId-scoping invariant** and must document it for every query.

### F04 — LLM Parsing Engine
`lib/llm/client.ts` (Anthropic SDK w/ `baseURL` override), `lib/llm/parseExpense.ts`. Single forced tool `record_expense` whose `input_schema` mirrors `ParsedExpense`. System prompt covering Indonesian money notation (`45k`/`45rb`/`1,5jt`/`Rp 38.500` where `.` is a **thousands** separator), `DD/MM/YYYY` date convention, day-name handling, title extraction, category assignment rules with concrete Indonesian examples. Zod-validate the tool output; on failure, one repair retry, then a **deterministic regex fallback parser** so the user is never hard-blocked. Timeout ~25 s, friendly error copy. Unit tests over a fixture corpus of real-world Indonesian expense pastes.

### F05 — Add Expense Flow
`/new`. Big autofocus textarea, sticky "Rapikan" (tidy up) button, skeleton while parsing. Review screen: editable rows (name, amount, category chip), swipe-or-tap delete, "+ Tambah item", live total, editable title & date. Photo picker inline (delegates to F06). Save → `createExpense` → redirect `/e/[id]`. Draft persisted to `localStorage` so a mis-tap doesn't lose the paste. Manual-entry escape hatch when the LLM fails.

### F06 — Photos: Upload, Storage, Gallery
`<input type="file" accept="image/*" multiple>` (iOS gives camera + library). Client compression to max 1600px long edge / ~300 KB / JPEG q0.8, EXIF orientation respected. Vercel Blob **client upload** via `upload()` + `/api/photos/upload` `handleUpload` (keeps the 4.5 MB serverless body limit out of play). Per-file progress, cancel, retry. Gallery: square thumbnail grid, full-screen swipeable lightbox with pinch-zoom. Delete removes both row and blob. Orphan-blob cleanup on abandoned drafts.

### F07 — History, Detail & Editing
`/m/[month]`: sticky header with month name + big total, prev/next chevrons, groups listed newest-first and sub-grouped by day, each row showing title, item count, photo count, total. Empty state. `/e/[id]`: title/date/note inline edit, item rows with tap-to-edit sheet, category chip opens the 2×4 picker, add item, delete item, delete group with confirm. Optimistic UI via `useOptimistic` + `revalidatePath`.

### F08 — Monthly Stats & Charts
`/stats`: 12-month bar chart of totals (Recharts, responsive, touch tooltip), month-over-month delta badge, category donut/bar for the selected month with amounts and percentages, biggest-single-expense callout. Tapping a bar navigates to that month. All aggregation in SQL, one round trip per view. Must read the `dataviz` skill for palette and chart-form decisions.

### F09 — Public Share Links
`createShareLink` mints `nanoid(12)`. Share sheet uses `navigator.share` with clipboard fallback. `/s/[token]` is a server component, no auth, `noindex` robots meta, renders title/date/items/total/photos, hides owner identity beyond a display name, shows a subtle "Dibagikan via expensetracking.online" footer. Revoke button on `/e/[id]` when a link exists. 404 for unknown/revoked tokens. Rate-limit consideration and token entropy note (~71 bits).

### F10 — Design System & iOS Polish
Consumes the Claude Design output (see §7). Tailwind v4 `@theme` tokens: colour ramps, spacing, radii, type scale. Component primitives: `Button`, `Card`, `Sheet` (bottom sheet), `Chip`, `Field`, `EmptyState`, `Money`, `TabBar`. iOS specifics: `viewport-fit=cover` + `env(safe-area-inset-*)`, `100dvh` not `100vh`, **16px minimum font-size on all inputs** (prevents Safari zoom-on-focus), `-webkit-tap-highlight-color: transparent`, momentum scrolling, `user-scalable=no` avoided in favour of correct sizing. PWA manifest + apple-touch-icon so "Add to Home Screen" gives a real app feel. Light/dark via `prefers-color-scheme`.

---

## 6. Out of scope for v0.1.0

Budgets & alerts · recurring-expense automation · multi-currency · CSV/PDF export · receipt OCR · search · tags beyond the 8 categories · shared/household accounts · offline write queue · push notifications · expense editing on the shared page.

---

## 7. UI/UX design pipeline

The design is produced in **Claude Design** (claude.ai/design) as a design-system project, then pulled into this repo through the `DesignSync` tool (`list_projects` → `list_files` → `get_file`). F10 consumes it. The prompt to paste into Claude Design lives in `docs/design-brief.md`.

---

## 8. Execution order

```
F01 ──┬── F03 ──┬── F02 ──┬── F06 ──┐
      │         │         │         ├── F05 ──┐
      └── F10   ├── F04 ──┘         │         │
                │                   ├── F07 ──┼── F08
                │                   │         └── F09
                └───────────────────┘
```

1. **Wave 1:** F01, F10 (design tokens can land before features)
2. **Wave 2:** F03, then F02
3. **Wave 3:** F04, F06 (parallel)
4. **Wave 4:** F05, F07 (parallel)
5. **Wave 5:** F08, F09 (parallel)

Ship-ready definition for v0.1.0: sign in with Google, paste text, get a correct table, attach 3 photos, save, see it in the month list with the right total, open the chart, share the link and open it in a private window.
