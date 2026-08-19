# F03 — Data Layer & Contracts

**Status:** plan · **Depends on:** F01 (Foundation) · **Blocks:** F02, F04, F05, F06, F07, F08, F09
**Owner of:** `lib/db/*`, `lib/categories.ts`, `lib/schema/expense.ts`, `lib/format.ts`, `lib/id.ts`, `drizzle.config.ts`, `drizzle/`

> **This is the keystone feature.** Seven other features import from this module set. Every exported symbol is a
> public API. Nothing here may be changed later without a `## Contract deltas` note in the consuming plan.
> F03 owns **the userId-scoping invariant** (§9) — the single most important security property in the app.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| Drizzle table definitions for the 4 app tables + 4 Auth.js adapter tables | Auth.js wiring itself (F02) |
| Neon serverless client + Drizzle instance | Server Actions / mutations (F05–F09) |
| Migration generation + application to Neon | UI, pages, components |
| Typed **read** queries, all userId-scoped | LLM parsing (F04) |
| Zod contracts, categories, money/date helpers, id helper | `lib/env.ts` (F01) |
| The ownership-proof query pattern every mutation must copy | Blob upload (F06) |

F03 ships **zero React**, **zero Server Actions**, **zero routes**. It is a pure library layer plus a migration.

---

## 2. Decisions and their justification

These are load-bearing. Each one was a real fork in the road.

### D-A · `amount_idr` is `bigint` in Postgres, `mode: 'number'` in JS

Roadmap §4.2 mandates `bigint` in the DB. Drizzle then forces a choice: `mode: 'bigint'` (JS `BigInt`) or
`mode: 'number'` (JS `number`).

**Chosen: `mode: 'number'`.**

1. **The values cannot overflow.** Roadmap §4.3 caps a single item at `1_000_000_000` (1e9) and a group at 50
   items → max group total `5e10`. A twelve-month total across, say, 1000 groups is still `≤ 5e13`.
   `Number.MAX_SAFE_INTEGER` is `9.007e15` — three orders of magnitude of headroom. Precision loss is
   arithmetically impossible within the contract.
2. **`BigInt` is not JSON-serializable.** Next.js RSC → Client Component prop serialization throws
   `TypeError: Do not know how to serialize a BigInt` on any `bigint` crossing the boundary. F05, F07 and F08 all
   pass amounts to client components (editable rows, Recharts). `mode: 'bigint'` would force a `Number()` cast at
   every single boundary — the cast we are choosing to do once, in the driver.
3. **The Zod contract already says `z.number().int()`** (§4.3). `mode: 'bigint'` would make the DB type and the
   boundary type disagree, requiring casts in both directions.
4. **Recharts, `Intl`, and `Math` do not accept `BigInt`.**

Why keep `bigint` in Postgres at all rather than `integer`? Because `integer` maxes at `2_147_483_647` and a
*monthly aggregate* (`SUM(amount_idr)`) can legitimately exceed it. Postgres `SUM(bigint)` returns `numeric`, which
never overflows. Column stays `bigint`; JS sees `number`.

> **Aggregate gotcha (important, read this).** `mode: 'number'` mapping applies to the *column*, not to raw
> `sql\`sum(...)\`` fragments. `pg`/`@neondatabase/serverless` return `int8` and `numeric` as **strings**. Every
> aggregate in `lib/db/queries.ts` therefore ends in `.mapWith(Number)` (query-builder path) or an explicit
> `Number(...)` (raw path). This is not optional — omit it and `totalIdr` silently becomes `"266350"` and
> `a + b` becomes `"266350133000"`.

### D-B · `occurred_on` is `date` with `mode: 'string'`

Roadmap D9/D10 fix the timezone to `Asia/Jakarta` and the granularity to a whole day.

**Chosen: `date('occurred_on', { mode: 'string' })` → `'YYYY-MM-DD'` in JS, end to end.**

`mode: 'date'` returns a JS `Date` parsed as **UTC midnight**. That Date then gets rendered by something with a
locale/timezone opinion, and `2026-08-18T00:00:00Z` displays as `17 Agustus` for any viewer west of Greenwich —
including anyone the user shares a `/s/<token>` link with. Reintroducing a timezone into a value the roadmap
explicitly declared timezone-free is a bug generator.

`mode: 'string'` makes the value the *same string* in all five places it appears:

```
LLM tool output      ParsedExpense.occurred_on   "2026-08-18"   (§4.3 regex /^\d{4}-\d{2}-\d{2}$/)
DB column            expense_groups.occurred_on  "2026-08-18"
Query filter bound   monthRange('2026-08').start "2026-08-01"
URL segment          /m/2026-08                  monthKey()
<input type="date">  value=                      "2026-08-18"
```

Zero conversions, zero `Date` construction, zero DST reasoning. Asia/Jakarta is **UTC+7 with no DST, ever**, so all
day/month arithmetic can be done on the string itself (see `addMonths`, `monthRange` in `lib/format.ts`) and is
exact by construction.

`created_at` / `updated_at` stay `timestamptz` with `mode: 'date'` — those are true instants, only ever used for
tie-break ordering, and never rendered.

### D-C · Driver: `drizzle-orm/neon-http` + `neon()` from `@neondatabase/serverless`

HTTP (not WebSocket) is the right default for a Vercel serverless app doing 1–4 queries per request: no connection
handshake, no `ws` dependency, works identically on Node and Edge runtimes.

**The cost, and you must know it before F05:** the `neon-http` driver **does not support interactive transactions**.
`db.transaction(async (tx) => …)` throws `No transactions support in neon-http driver`.

**The sanctioned replacement is `db.batch([q1, q2, …])`**, which Neon executes as a *single* HTTP request inside a
*single* Postgres transaction, and which Drizzle types as a tuple of each query's result type. Every multi-statement
mutation in F05/F06/F09 (insert group + insert N items; mint token) must use `db.batch`. §9.4 gives the pattern.
`db.batch` is also how F03's own multi-query reads stay at one round trip.

### D-D · Pooled vs unpooled connection strings

| Consumer | Env var | Neon host | Why |
|---|---|---|---|
| Runtime queries (`lib/db/index.ts`) | `DATABASE_URL` | `…-pooler.…neon.tech` | Pooled. Serverless invocations are numerous and short-lived; the PgBouncer endpoint is what absorbs them. Neon's own guidance for `@neondatabase/serverless` is the pooled string. |
| `drizzle-kit generate/migrate/push/studio` | `DATABASE_URL_UNPOOLED` | `…neon.tech` (no `-pooler`) | DDL and the migration advisory lock need a **direct** session. PgBouncer transaction pooling breaks session-scoped state; `CREATE TABLE` batches can fail or interleave. Neon documents the unpooled string for migrations. |

Both are already in the roadmap's §4.8 env list. `drizzle.config.ts` must read the **unpooled** one — using
`DATABASE_URL` there is the classic silent-flake bug.

### D-E · `lib/id.ts` implements nanoid natively (no `nanoid` dependency)

Roadmap §5/F03 says "nanoid id helper". `nanoid@5` is ESM-only, is not in the pinned stack table (§3), and would be
the only dependency in this feature whose version we'd be inventing.

The algorithm is 12 lines and we can implement it *exactly*: a 64-character URL-safe alphabet means each random byte
maps to a symbol via `byte & 63` with **zero modulo bias** (256 / 64 = 4 exactly), so no rejection sampling is
needed and the output is perfectly uniform. Uses `crypto.getRandomValues` — present in Node 19+, Vercel Edge, and
every browser.

Entropy: `12 × log2(64) = 72 bits`. (Roadmap F09 says "~71 bits"; the real figure with a 64-symbol alphabet is 72.
Either way, guessing a share token is not a threat.) If the integrator prefers the dependency, `nanoid@5`'s
`nanoid(12)` is a drop-in with identical entropy — only the alphabet ordering differs.

### D-F · `formatIdr` does its own digit grouping, no `Intl`

`new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })` emits **`Rp 38.500`** — a
*non-breaking* space, in most ICU versions — and the exact glyph has changed between ICU releases. Roadmap §4.7
specifies the literal string `"Rp 38.500"`. A hand-rolled grouping regex is 4 lines, is byte-exact, is identical on
small-ICU and full-ICU Node builds, and makes the unit test table in §8 a real assertion rather than a hope.

Same reasoning for Indonesian month/day names: a hardcoded 12-element array beats `Intl.DateTimeFormat('id-ID')`,
which would also drag a timezone parameter into a pure string function.

### D-G · Auth.js tables use the adapter's canonical shape verbatim

Roadmap §4.2: "do not hand-roll them". We therefore copy `@auth/drizzle-adapter`'s documented Postgres schema
**including its SQL table names** (`user`, `account`, `session`, `verificationToken` — singular, camelCase) and
**including its camelCase column names** (`emailVerified`, `providerAccountId`, `sessionToken`). The exported Drizzle
symbols are plural (`users`, `accounts`, `sessions`, `verificationTokens`) to match roadmap §4.2's prose and F02's
expectations.

Consequence: we must **not** set Drizzle's `casing: 'snake_case'` option on the `drizzle()` call, since that would
rewrite the Auth.js columns. All app-table column names are therefore written out explicitly. This is deliberate.

We omit the optional `authenticators` table — it exists only for WebAuthn, and roadmap §3 pins Google OAuth only.

---

## 3. Dependencies to add

```bash
npm i drizzle-orm@0.45.2 @neondatabase/serverless@1.1.0 zod@4.4.3
npm i -D drizzle-kit@0.31.10 vitest@3.2.4
```

Nothing else. No `nanoid` (D-E), no `dotenv` (Node 22's `process.loadEnvFile` covers it), no `pg`.

`package.json` scripts (F01 stubbed `db:*`; F03 fills them in):

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:int": "vitest run --dir tests/integration",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:check": "drizzle-kit check"
  }
}
```

---

## 4. Test harness

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json "paths": { "@/*": ["./*"] } from F01.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    setupFiles: ['tests/setup.ts'],
  },
})
```

### `tests/setup.ts`

```ts
// lib/db/index.ts constructs the Neon client eagerly at import time so that a missing
// DATABASE_URL is a loud crash in production rather than a silent undefined (roadmap §4.8).
// neon() is lazy at the network level — it only builds a fetch-based tagged template — so a
// syntactically valid dummy URL lets unit tests import query modules and inspect .toSQL()
// without ever touching a network.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://u:p@ep-unit-test-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'
}
```

Integration tests (§10) run separately via `npm run test:int` and are skipped unless `TEST_DATABASE_URL` is set.

---

## 5. Complete source

Every file below is final, copy-pasteable TypeScript. The TDD task list in §7 tells you the order to write them in
and which test to write first.

### 5.1 `lib/categories.ts`

```ts
/**
 * The 8 expense categories. AUTHORITATIVE — roadmap §4.1.
 * Exactly 8 so the picker fits a 2×4 tap grid in a bottom sheet (F07/F10).
 * Order below IS the display order of that grid.
 */
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

/** Fallback used whenever an unknown string reaches us (e.g. an LLM hallucinating a category). */
export const DEFAULT_CATEGORY: Category = 'other'

export interface CategoryMeta {
  /** Stable machine id — this is what lands in expense_items.category. */
  id: Category
  /** Indonesian display label. */
  label: string
  /** Single emoji, used as the chip glyph. */
  emoji: string
  /**
   * Tailwind v4 `@theme` custom-property NAME (not a value). F10 defines the values in
   * app/globals.css; using the `--color-*` namespace means Tailwind auto-generates
   * `bg-cat-food`, `text-cat-food`, `border-cat-food`, etc.
   */
  color: `--color-cat-${Category}`
  /** Short disambiguation hint, shown under the label in the picker and fed to F04's prompt. */
  hint: string
}

export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>> = {
  food:          { id: 'food',          label: 'Makan & Jajan',   emoji: '🍜', color: '--color-cat-food',          hint: 'warung, resto, kopi, snack' },
  groceries:     { id: 'groceries',     label: 'Belanja Harian',  emoji: '🛒', color: '--color-cat-groceries',     hint: 'Indomaret, Alfamart, supermarket' },
  transport:     { id: 'transport',     label: 'Transport',       emoji: '🛵', color: '--color-cat-transport',     hint: 'bensin, parkir, tol, ojek, grab' },
  bills:         { id: 'bills',         label: 'Tagihan',         emoji: '🧾', color: '--color-cat-bills',         hint: 'internet, listrik, pulsa, IPL, iuran' },
  housing:       { id: 'housing',       label: 'Tempat Tinggal',  emoji: '🏠', color: '--color-cat-housing',       hint: 'sewa apartemen, kos, service charge' },
  entertainment: { id: 'entertainment', label: 'Hiburan',         emoji: '🎬', color: '--color-cat-entertainment', hint: 'bioskop, game, langganan streaming' },
  health:        { id: 'health',        label: 'Kesehatan',       emoji: '💊', color: '--color-cat-health',        hint: 'obat, dokter, vitamin' },
  other:         { id: 'other',         label: 'Lainnya',         emoji: '📦', color: '--color-cat-other',         hint: 'tidak masuk kategori lain' },
}

/** Grid-ordered list for the 2×4 picker. */
export const CATEGORY_LIST: readonly CategoryMeta[] = CATEGORIES.map((c) => CATEGORY_META[c])

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}

/** Never throws. Unknown input degrades to `other` — DB rows are text and predate no migration. */
export function categoryMeta(value: string): CategoryMeta {
  return isCategory(value) ? CATEGORY_META[value] : CATEGORY_META[DEFAULT_CATEGORY]
}

/** Coerce arbitrary text to a valid Category. Used at the DB read boundary and by F04's fallback parser. */
export function toCategory(value: unknown): Category {
  return isCategory(value) ? value : DEFAULT_CATEGORY
}
```

> **Hand-off to F10:** define these 8 custom properties in `@theme`. Suggested starting hues (F10 owns the final
> ramp, must pass the `dataviz` contrast checks in both light and dark):
> `food #F97316` · `groceries #10B981` · `transport #3B82F6` · `bills #8B5CF6` · `housing #F43F5E` ·
> `entertainment #EC4899` · `health #14B8A6` · `other #94A3B8`.

### 5.2 `lib/id.ts`

```ts
/**
 * nanoid-compatible id generation with no dependency (see plan D-E).
 *
 * 64-symbol URL-safe alphabet ⇒ `byte & 63` is a perfectly uniform mapping (256 / 64 = 4),
 * so no rejection sampling is required and there is zero modulo bias.
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
// ALPHABET.length === 64

/** Roadmap §4.2: every PK and the share token are nanoid(12). */
export const ID_LENGTH = 12

/** 12 symbols × log2(64) = 72 bits of entropy. */
export const ID_ENTROPY_BITS = ID_LENGTH * 6

export function newId(size: number = ID_LENGTH): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! & 63]
  return out
}

/** Semantic aliases. All identical today; keeping them separate makes call sites self-documenting. */
export const newGroupId = (): string => newId()
export const newItemId = (): string => newId()
export const newPhotoId = (): string => newId()

/**
 * Share token for /s/<token>. Same generator, same 72 bits.
 * `token` is the PRIMARY KEY of share_links, so a collision surfaces as a unique-violation on
 * insert — F09 must retry once rather than swallow it. Probability at 1e6 tokens: ~1e-10.
 */
export const newShareToken = (): string => newId()

const ID_RE = /^[0-9A-Za-z_-]{12}$/

/** Cheap shape check for route params, so /e/<garbage> 404s without a DB round trip. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}
```

### 5.3 `lib/format.ts`

```ts
/**
 * Money and date formatting. AUTHORITATIVE — roadmap §4.7.
 *
 * Two hard rules encoded here:
 *  - In Indonesian notation `.` is the THOUSANDS separator and `,` is the decimal separator.
 *    "38.500" is thirty-eight thousand five hundred, NOT thirty-eight point five.
 *  - The app's calendar is Asia/Jakarta (UTC+7, no DST ever). All date values are 'YYYY-MM-DD'
 *    strings, so month/day arithmetic is exact string math with no Date involved.
 */

export const TZ = 'Asia/Jakarta' as const

/* ------------------------------------------------------------------ money */

/**
 * formatIdr(38500) === 'Rp 38.500'
 * Deliberately does NOT use Intl (see plan D-F): id-ID currency formatting emits a
 * non-breaking space whose codepoint has changed across ICU versions.
 * Rounds to whole rupiah — there are no cents (roadmap D5).
 */
export function formatIdr(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0'
  const rounded = Math.round(n)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}Rp ${digits}`
}

/**
 * Compact form for chart axes and tight badges (F08).
 * 950 → 'Rp 950' · 45_000 → 'Rp 45rb' · 266_350 → 'Rp 266rb' · 1_500_000 → 'Rp 1,5jt' · 12_000_000 → 'Rp 12jt'
 */
export function formatIdrCompact(n: number): string {
  const v = Math.round(n)
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000_000) return `${sign}Rp ${trimDecimal(a / 1_000_000_000)}M`
  if (a >= 1_000_000) return `${sign}Rp ${trimDecimal(a / 1_000_000)}jt`
  if (a >= 1_000) return `${sign}Rp ${trimDecimal(a / 1_000)}rb`
  return formatIdr(v)
}

function trimDecimal(x: number): string {
  // one decimal place, Indonesian comma, no trailing ",0"
  const s = x >= 10 ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString()
  return s.replace('.', ',')
}

const SUFFIXES: ReadonlyArray<readonly [RegExp, number]> = [
  [/(?:jt|juta)$/, 1_000_000],
  [/(?:rb|ribu|k)$/, 1_000],
]

/**
 * Best-effort parse of hand-typed Indonesian money. Returns null when there is nothing
 * defensible to return — callers show a validation error rather than guessing.
 *
 * Does NOT enforce the §4.3 upper bound of 1e9; that is Zod's job at the boundary.
 * Never returns a negative (expenses are ≥ 0).
 *
 * See the full input/expectation table in docs/plans/F03-data-layer.md §8.
 */
export function parseIdrLoose(input: string): number | null {
  if (typeof input !== 'string') return null

  let s = input.toLowerCase().trim()
  if (!s) return null

  s = s.replace(/\s+/g, '')          // "Rp 38.500" → "rp38.500", "45 ribu" → "45ribu"
  s = s.replace(/^(?:rp|idr)\.?/, '') // leading currency marker, with or without a dot
  s = s.replace(/(?:rupiah|idr)$/, '')// trailing currency word
  s = s.replace(/[,.]-+$/, '')        // Indonesian invoice tail: "1.250.000,-"
  if (!s) return null
  if (s.startsWith('-')) return null  // negative amounts are not a thing here

  let multiplier = 1
  for (const [re, m] of SUFFIXES) {
    if (re.test(s)) {
      s = s.replace(re, '')
      multiplier = m
      break
    }
  }
  if (!s) return null

  // Only digits and separators may remain. "45k5", "12,,3", "abc" all fail here.
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null

  const parts = s.split(/[.,]/)
  let value: number

  if (parts.length === 1) {
    value = Number(parts[0])
  } else {
    const last = parts[parts.length - 1]!
    if (last.length === 3) {
      // Every separator is a thousands separator: "38.500", "1.250.000", "1,500".
      value = Number(parts.join(''))
    } else {
      // The last separator is a decimal point: "1,5jt", "1.5jt", "38.500,00".
      const intPart = parts.slice(0, -1).join('')
      value = Number(`${intPart}.${last}`)
    }
  }

  if (!Number.isFinite(value)) return null
  return Math.round(value * multiplier)
}

/* ------------------------------------------------------------------- dates */

/** 'YYYY-MM-DD' */
export type DateISO = string
/** 'YYYY-MM' */
export type MonthKey = string

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/

export function isValidDateISO(v: unknown): v is DateISO {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number) as [number, number, number]
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function isValidMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && MONTH_RE.test(v)
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/**
 * Today in Asia/Jakarta as 'YYYY-MM-DD'. This is the ONLY place the wall clock enters the app.
 * Uses formatToParts rather than a locale string so the output shape cannot drift with ICU.
 * Pass `now` in tests to make it deterministic.
 */
export function todayJakartaISO(now: Date = new Date()): DateISO {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** monthKey('2026-08-18') === '2026-08' · monthKey(new Date()) uses Asia/Jakarta. */
export function monthKey(value: DateISO | Date = new Date()): MonthKey {
  const iso = typeof value === 'string' ? value : todayJakartaISO(value)
  return iso.slice(0, 7)
}

/** The current Asia/Jakarta month — the redirect target for `/`. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKey(todayJakartaISO(now))
}

/**
 * Half-open range for a month, for `occurred_on >= start AND occurred_on < endExclusive`.
 * Half-open avoids ever having to know how long February is.
 * monthRange('2026-08') → { startISO: '2026-08-01', endExclusiveISO: '2026-09-01' }
 */
export function monthRange(month: MonthKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  return { startISO: `${month}-01`, endExclusiveISO: `${addMonths(month, 1)}-01` }
}

/** addMonths('2026-01', -1) === '2025-12'. Pure integer math, no Date, no timezone. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`
}

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

export const MONTH_NAMES_ID_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
] as const

export const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

/** monthLabel('2026-08') === 'Agustus 2026' — the /m/[month] sticky header. */
export function monthLabel(month: MonthKey): string {
  if (!isValidMonthKey(month)) return month
  return `${MONTH_NAMES_ID[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/** monthLabelShort('2026-08') === 'Agu 26' — Recharts x-axis ticks (F08). */
export function monthLabelShort(month: MonthKey): string {
  if (!isValidMonthKey(month)) return month
  return `${MONTH_NAMES_ID_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`
}

/** dateLabel('2026-08-18') === '18 Agustus 2026' */
export function dateLabel(iso: DateISO): string {
  if (!isValidDateISO(iso)) return iso
  return `${Number(iso.slice(8, 10))} ${MONTH_NAMES_ID[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/**
 * dayLabel('2026-08-18') === 'Selasa, 18 Agustus 2026' — the day sub-headers on /m/[month] (F07).
 * The Date is constructed at UTC midnight purely to read a weekday index; no local timezone is consulted.
 */
export function dayLabel(iso: DateISO): string {
  if (!isValidDateISO(iso)) return iso
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return `${DAY_NAMES_ID[dow]}, ${dateLabel(iso)}`
}
```

### 5.4 `lib/schema/expense.ts`

```ts
import { z } from 'zod'
import { CATEGORIES } from '@/lib/categories'

/* ============================================================================
 * AUTHORITATIVE — roadmap §4.3. ParsedExpense is the single boundary type
 * between F04 (parser) and F05 (add flow), and is byte-for-byte the shape of
 * the GLM tool's input_schema. Do not change without a Contract delta.
 * ==========================================================================*/

export const ParsedItem = z.object({
  name: z.string().trim().min(1).max(120),
  amount_idr: z.number().int().min(0).max(1_000_000_000),
  category: z.enum(CATEGORIES),
})
export type ParsedItem = z.infer<typeof ParsedItem>

export const ParsedExpense = z.object({
  title: z.string().trim().min(1).max(120),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(ParsedItem).min(1).max(50),
})
export type ParsedExpense = z.infer<typeof ParsedExpense>

/* ============================================================================
 * ADDITIVE — validation for the Server Actions in §4.4. Not in the roadmap's
 * §4.3 block; listed as an additive Contract delta. Actions MUST parse their
 * input with these, because a Server Action argument is attacker-controlled.
 * Note the camelCase here: §4.4 signatures use camelCase, §4.3's LLM boundary
 * uses snake_case. That asymmetry is intentional and stops here.
 * ==========================================================================*/

export const IdSchema = z.string().regex(/^[0-9A-Za-z_-]{12}$/, 'invalid id')
export const DateISOSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
export const AmountIdrSchema = z.number().int().min(0).max(1_000_000_000)
export const CategorySchema = z.enum(CATEGORIES)
export const TitleSchema = z.string().trim().min(1).max(120)
export const NoteSchema = z.string().trim().max(2_000)

/** createExpense — ParsedExpense plus the fields the review screen adds. */
export const CreateExpenseInput = ParsedExpense.extend({
  note: NoteSchema.optional(),
  rawText: z.string().max(20_000).optional(),
  photoIds: z.array(IdSchema).max(20).optional(),
})
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>

export const UpdateExpenseMetaInput = z
  .object({
    title: TitleSchema.optional(),
    occurredOn: DateISOSchema.optional(),
    note: NoteSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update')
export type UpdateExpenseMetaInput = z.infer<typeof UpdateExpenseMetaInput>

export const AddItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  amountIdr: AmountIdrSchema,
  category: CategorySchema,
})
export type AddItemInput = z.infer<typeof AddItemInput>

export const UpdateItemInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amountIdr: AmountIdrSchema.optional(),
    category: CategorySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update')
export type UpdateItemInput = z.infer<typeof UpdateItemInput>

export const AttachPhotoInput = z.object({
  groupId: IdSchema,
  blobUrl: z.url().max(1_000),
  blobPathname: z.string().min(1).max(500),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  sizeBytes: z.number().int().positive().max(50_000_000).optional(),
})
export type AttachPhotoInput = z.infer<typeof AttachPhotoInput>

/** POST /api/parse request body (§4.5). */
export const ParseRequest = z.object({
  rawText: z.string().trim().min(1).max(20_000),
  todayISO: DateISOSchema,
})
export type ParseRequest = z.infer<typeof ParseRequest>
```

### 5.5 `lib/db/schema.ts`

```ts
import { relations } from 'drizzle-orm'
import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/* ============================================================================
 * Auth.js adapter tables — canonical @auth/drizzle-adapter Postgres shape.
 * SQL names and camelCase columns are copied verbatim from the adapter docs
 * (roadmap §4.2: "do not hand-roll them"). Exported symbols are pluralised to
 * match §4.2's prose. Consequence: we must NOT enable Drizzle's
 * casing: 'snake_case' option, so app columns are named explicitly below.
 *
 * The WebAuthn `authenticators` table is intentionally omitted — Google OAuth only.
 * ==========================================================================*/

/**
 * Mirrors next-auth's AdapterAccountType. Declared locally rather than imported so that
 * F03 does not depend on next-auth, which F02 installs *after* F03 lands.
 */
type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn'

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

/* ============================================================================
 * App tables — AUTHORITATIVE, roadmap §4.2.
 * ==========================================================================*/

export const expenseGroups = pgTable(
  'expense_groups',
  {
    /** nanoid(12) — lib/id.ts newGroupId() */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. "bakar duit tuesday" */
    title: text('title').notNull(),
    /**
     * Asia/Jakarta calendar day, 'YYYY-MM-DD'. mode:'string' — see plan D-B.
     * Never a JS Date, anywhere, ever.
     */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    note: text('note'),
    /** Original paste, kept for re-parse / audit (roadmap §4.2). */
    rawText: text('raw_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      // Applies to Drizzle .update() calls only — a raw SQL UPDATE will not bump it.
      .$onUpdate(() => new Date()),
  },
  (t) => [index('expense_groups_user_occurred_idx').on(t.userId, t.occurredOn.desc())],
)

export const expenseItems = pgTable(
  'expense_items',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    /** ≤ 120 chars, enforced by Zod at the boundary. */
    name: text('name').notNull(),
    /** Whole rupiah, ≥ 0. bigint in PG, number in JS — see plan D-A. */
    amountIdr: bigint('amount_idr', { mode: 'number' }).notNull(),
    /** One of CATEGORIES. Stored as text, not a PG enum, so adding a category is not a migration. */
    category: text('category').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('expense_items_group_idx').on(t.groupId)],
)

export const expensePhotos = pgTable(
  'expense_photos',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    /** Public Vercel Blob URL. */
    blobUrl: text('blob_url').notNull(),
    /** Needed for del() on delete (F06). */
    blobPathname: text('blob_pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('expense_photos_group_idx').on(t.groupId)],
)

export const shareLinks = pgTable(
  'share_links',
  {
    /** nanoid(12), URL-safe. PRIMARY KEY — a collision is a unique violation, F09 retries once. */
    token: text('token').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  // One active link per group (roadmap §4.2). Revoke = DELETE; re-share mints a fresh token.
  (t) => [uniqueIndex('share_links_group_id_unq').on(t.groupId)],
)

/* ============================================================================
 * Relations. Optional convenience for db.query.*; the sanctioned read path in
 * lib/db/queries.ts uses explicit selects + db.batch. Kept because F07 may want
 * relational reads and they cost nothing at runtime.
 * ==========================================================================*/

export const expenseGroupsRelations = relations(expenseGroups, ({ one, many }) => ({
  user: one(users, { fields: [expenseGroups.userId], references: [users.id] }),
  items: many(expenseItems),
  photos: many(expensePhotos),
  shareLink: one(shareLinks, { fields: [expenseGroups.id], references: [shareLinks.groupId] }),
}))

export const expenseItemsRelations = relations(expenseItems, ({ one }) => ({
  group: one(expenseGroups, { fields: [expenseItems.groupId], references: [expenseGroups.id] }),
}))

export const expensePhotosRelations = relations(expensePhotos, ({ one }) => ({
  group: one(expenseGroups, { fields: [expensePhotos.groupId], references: [expenseGroups.id] }),
}))

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  group: one(expenseGroups, { fields: [shareLinks.groupId], references: [expenseGroups.id] }),
}))

/* ============================================================================
 * Row types. Import these instead of re-deriving $inferSelect at call sites.
 * ==========================================================================*/

export type User = typeof users.$inferSelect
export type ExpenseGroup = typeof expenseGroups.$inferSelect
export type NewExpenseGroup = typeof expenseGroups.$inferInsert
export type ExpenseItem = typeof expenseItems.$inferSelect
export type NewExpenseItem = typeof expenseItems.$inferInsert
export type ExpensePhoto = typeof expensePhotos.$inferSelect
export type NewExpensePhoto = typeof expensePhotos.$inferInsert
export type ShareLink = typeof shareLinks.$inferSelect
export type NewShareLink = typeof shareLinks.$inferInsert
```

### 5.6 `lib/db/index.ts`

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/**
 * Neon HTTP driver + Drizzle. See plan D-C / D-D.
 *
 * - Uses DATABASE_URL, the POOLED (`-pooler`) connection string. Migrations use
 *   DATABASE_URL_UNPOOLED and live in drizzle.config.ts, not here.
 * - neon() over HTTP holds no socket: each query is one `fetch`. There is no pool to
 *   warm, nothing to close, and no `maxConnections` to tune. "Connection reuse" in this
 *   architecture means reusing the *fetch keep-alive* the runtime already manages, plus
 *   not rebuilding the Drizzle instance on every module evaluation — hence the
 *   globalThis cache, which mainly matters for Next dev HMR (a fresh instance per hot
 *   reload leaks nothing but is wasteful and defeats query-log continuity).
 * - Constructed EAGERLY so a missing DATABASE_URL is a loud boot crash, never a silent
 *   undefined (roadmap §4.8). neon() performs no I/O at construction, so importing this
 *   module in a unit test is free (tests/setup.ts supplies a dummy URL).
 * - IMPORTANT: no `casing` option. Auth.js columns are camelCase (plan D-G).
 */

export type Database = NeonHttpDatabase<typeof schema>

function createDb(): Database {
  const url = process.env.DATABASE_URL
  if (!url) {
    // F01's lib/env.ts should already have crashed. This is the backstop.
    throw new Error(
      'DATABASE_URL is not set. Add the POOLED Neon connection string to .env.local ' +
        '(and to the Vercel project env). See roadmap §4.8.',
    )
  }
  return drizzle(neon(url), {
    schema,
    logger: process.env.DRIZZLE_LOG === '1',
  })
}

const globalForDb = globalThis as unknown as { __expenseDb?: Database }

export const db: Database = globalForDb.__expenseDb ?? (globalForDb.__expenseDb = createDb())

export { schema }
export * from './schema'
```

### 5.7 `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit'
import { existsSync, readFileSync } from 'node:fs'

/**
 * drizzle-kit runs outside Next.js, so nothing has loaded .env.local for us.
 * Node 22 has process.loadEnvFile; the manual fallback keeps this working on Node 20.9–20.11
 * (the minimum Next 16 supports) without adding a dotenv dependency.
 */
function loadEnvLocal(file = '.env.local'): void {
  if (!existsSync(file)) return
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(file)
    return
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const value = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
    process.env[m[1]!] ??= value
  }
}
loadEnvLocal()

// UNPOOLED on purpose: DDL and the migration advisory lock need a direct session,
// not the PgBouncer endpoint. See plan D-D.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL_UNPOOLED is not set — drizzle-kit cannot run.')
if (url.includes('-pooler.')) {
  console.warn('[drizzle.config] WARNING: using a POOLED connection string for migrations. Set DATABASE_URL_UNPOOLED.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
```

### 5.8 `lib/db/queries.ts`

```ts
import { and, asc, desc, eq, exists, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from './index'
import { expenseGroups, expenseItems, expensePhotos, shareLinks, users } from './schema'
import { type Category, toCategory } from '@/lib/categories'
import { addMonths, type DateISO, type MonthKey, monthRange } from '@/lib/format'

/* ============================================================================
 * §1 · Errors
 * ==========================================================================*/

/**
 * Thrown when a row does not exist OR is not owned by the caller. The two cases are
 * deliberately indistinguishable — distinguishing them would be an ownership oracle
 * that lets an attacker enumerate other users' ids. Callers map this to a 404.
 */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/* ============================================================================
 * §2 · Ownership predicates — THE SECURITY PRIMITIVE
 *
 * Every table except expense_groups reaches its owner through group_id. These
 * return a correlated EXISTS(...) SQL fragment that can be dropped into any
 * .where() on the corresponding table. Mutations in F05–F09 MUST use these
 * rather than hand-rolling a join. See plan §9.
 * ==========================================================================*/

/** EXISTS (SELECT 1 FROM expense_groups g WHERE g.id = expense_items.group_id AND g.user_id = $userId) */
export function itemOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, expenseItems.groupId), eq(expenseGroups.userId, userId))),
  )
}

/** EXISTS (SELECT 1 FROM expense_groups g WHERE g.id = expense_photos.group_id AND g.user_id = $userId) */
export function photoOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, expensePhotos.groupId), eq(expenseGroups.userId, userId))),
  )
}

/** EXISTS (SELECT 1 FROM expense_groups g WHERE g.id = share_links.group_id AND g.user_id = $userId) */
export function shareLinkOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, shareLinks.groupId), eq(expenseGroups.userId, userId))),
  )
}

/**
 * Proves the caller owns a group before a child insert (addItem, attachPhoto, createShareLink).
 * Throws NotFoundError otherwise. One index-only round trip.
 */
export async function assertGroupOwned(userId: string, groupId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Expense group not found')
}

/** Resolve the owning group id of an item, proving ownership on the way. For revalidatePath('/e/<id>'). */
export async function getOwnedGroupIdForItem(userId: string, itemId: string): Promise<string> {
  const rows = await db
    .select({ groupId: expenseItems.groupId })
    .from(expenseItems)
    .where(and(eq(expenseItems.id, itemId), itemOwnedBy(userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Expense item not found')
  return rows[0]!.groupId
}

/* ============================================================================
 * §3 · Row shapes returned to features
 * ==========================================================================*/

export interface MonthGroupRow {
  id: string
  title: string
  /** 'YYYY-MM-DD' */
  occurredOn: DateISO
  note: string | null
  /** SUM(expense_items.amount_idr), 0 when the group has no items. Never denormalised (roadmap D7). */
  totalIdr: number
  itemCount: number
  photoCount: number
}

export interface ItemRow {
  id: string
  name: string
  amountIdr: number
  category: Category
  sortOrder: number
}

export interface PhotoRow {
  id: string
  blobUrl: string
  blobPathname: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  sortOrder: number
}

export interface GroupDetail {
  id: string
  title: string
  occurredOn: DateISO
  note: string | null
  rawText: string | null
  createdAt: Date
  updatedAt: Date
  items: ItemRow[]
  photos: PhotoRow[]
  /** null when the group is not shared. Presence drives the Bagikan/Cabut toggle on /e/[id]. */
  shareToken: string | null
  /** Convenience: sum of items[].amountIdr, computed in JS from the rows we already have. */
  totalIdr: number
}

export interface SharedGroup {
  id: string
  title: string
  occurredOn: DateISO
  note: string | null
  /** Owner display name only — never email, never id (roadmap F09). */
  ownerName: string | null
  items: ItemRow[]
  photos: PhotoRow[]
  totalIdr: number
}

export interface MonthlyTotal {
  month: MonthKey
  totalIdr: number
}

export interface CategoryTotal {
  category: Category
  totalIdr: number
  itemCount: number
}

export interface BiggestExpense {
  itemId: string
  name: string
  amountIdr: number
  category: Category
  groupId: string
  groupTitle: string
  occurredOn: DateISO
}

/* ============================================================================
 * §4 · Reads. Every function here except getGroupByShareToken takes userId as
 *      its FIRST parameter and filters on it. No exceptions.
 * ==========================================================================*/

/**
 * All groups in `month` ('YYYY-MM') for `userId`, each with its computed total,
 * item count and photo count.
 *
 * ONE round trip, no N+1: the three aggregates are correlated scalar subqueries in the
 * select list. A LEFT JOIN to both expense_items and expense_photos would fan out the
 * rows (items × photos) and inflate both SUM and COUNT — the classic bug this shape avoids.
 *
 * Ordering matches /m/[month]: newest day first, then newest-created first within a day.
 */
export async function getMonthGroups(userId: string, month: MonthKey): Promise<MonthGroupRow[]> {
  const { startISO, endExclusiveISO } = monthRange(month)

  return db
    .select({
      id: expenseGroups.id,
      title: expenseGroups.title,
      occurredOn: expenseGroups.occurredOn,
      note: expenseGroups.note,
      totalIdr: sql<number>`coalesce((
        select sum(${expenseItems.amountIdr})
        from ${expenseItems}
        where ${expenseItems.groupId} = ${expenseGroups.id}
      ), 0)`.mapWith(Number),
      itemCount: sql<number>`(
        select count(*)
        from ${expenseItems}
        where ${expenseItems.groupId} = ${expenseGroups.id}
      )`.mapWith(Number),
      photoCount: sql<number>`(
        select count(*)
        from ${expensePhotos}
        where ${expensePhotos.groupId} = ${expenseGroups.id}
      )`.mapWith(Number),
    })
    .from(expenseGroups)
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(desc(expenseGroups.occurredOn), desc(expenseGroups.createdAt))
}

/**
 * Full detail for /e/[id]. Returns null when the group does not exist OR is not owned
 * by userId — indistinguishable on purpose (see NotFoundError).
 *
 * ONE round trip via db.batch: neon-http sends all four statements in a single HTTP
 * request inside a single transaction, so the four results are mutually consistent.
 * The child queries carry the ownership EXISTS too — defence in depth, and it is the
 * exact pattern F05–F09 must copy.
 */
export async function getGroupDetail(userId: string, id: string): Promise<GroupDetail | null> {
  const [groupRows, itemRows, photoRows, linkRows] = await db.batch([
    db
      .select({
        id: expenseGroups.id,
        title: expenseGroups.title,
        occurredOn: expenseGroups.occurredOn,
        note: expenseGroups.note,
        rawText: expenseGroups.rawText,
        createdAt: expenseGroups.createdAt,
        updatedAt: expenseGroups.updatedAt,
      })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))
      .limit(1),

    db
      .select({
        id: expenseItems.id,
        name: expenseItems.name,
        amountIdr: expenseItems.amountIdr,
        category: expenseItems.category,
        sortOrder: expenseItems.sortOrder,
      })
      .from(expenseItems)
      .where(and(eq(expenseItems.groupId, id), itemOwnedBy(userId)))
      .orderBy(asc(expenseItems.sortOrder), asc(expenseItems.id)),

    db
      .select({
        id: expensePhotos.id,
        blobUrl: expensePhotos.blobUrl,
        blobPathname: expensePhotos.blobPathname,
        width: expensePhotos.width,
        height: expensePhotos.height,
        sizeBytes: expensePhotos.sizeBytes,
        sortOrder: expensePhotos.sortOrder,
      })
      .from(expensePhotos)
      .where(and(eq(expensePhotos.groupId, id), photoOwnedBy(userId)))
      .orderBy(asc(expensePhotos.sortOrder), asc(expensePhotos.createdAt)),

    db
      .select({ token: shareLinks.token })
      .from(shareLinks)
      .where(and(eq(shareLinks.groupId, id), shareLinkOwnedBy(userId)))
      .limit(1),
  ])

  const group = groupRows[0]
  if (!group) return null

  const items: ItemRow[] = itemRows.map((r) => ({ ...r, category: toCategory(r.category) }))

  return {
    ...group,
    items,
    photos: photoRows,
    shareToken: linkRows[0]?.token ?? null,
    totalIdr: items.reduce((sum, it) => sum + it.amountIdr, 0),
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  ⚠️  ⚠️  ⚠️   THE ONLY UNSCOPED QUERY IN THE ENTIRE APPLICATION   ⚠️  ⚠️  ⚠️
 *
 *  getGroupByShareToken has NO userId parameter and NO user_id filter, BY DESIGN.
 *  It backs /s/[token], which roadmap §4.6 marks auth-free and middleware.ts must
 *  explicitly NOT protect. The token IS the credential: 12 nanoid symbols = 72 bits.
 *
 *  Rules for anyone touching this function:
 *    1. It returns a SharedGroup, never an ExpenseGroup row — no user_id, no email,
 *       no raw_text, no created_at. Only ownerName, deliberately.
 *    2. Nothing else in the codebase may look a group up by anything other than
 *       (id, userId). If you find yourself wanting a second unscoped read, you are
 *       about to write a vulnerability.
 *    3. Revocation is DELETE FROM share_links, so an unknown OR revoked token must
 *       return null and the page must 404 — never "this link expired", which would
 *       confirm the token once existed.
 *    4. Do not add logging that echoes the token.
 * ────────────────────────────────────────────────────────────────────────────*/
export async function getGroupByShareToken(token: string): Promise<SharedGroup | null> {
  // Subquery resolves token → group_id, so all three statements can go in one batch
  // even though the child queries "depend" on the first.
  const linkedGroupId = db
    .select({ id: shareLinks.groupId })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))

  const [groupRows, itemRows, photoRows] = await db.batch([
    db
      .select({
        id: expenseGroups.id,
        title: expenseGroups.title,
        occurredOn: expenseGroups.occurredOn,
        note: expenseGroups.note,
        ownerName: users.name,
      })
      .from(shareLinks)
      .innerJoin(expenseGroups, eq(expenseGroups.id, shareLinks.groupId))
      .innerJoin(users, eq(users.id, expenseGroups.userId))
      .where(eq(shareLinks.token, token))
      .limit(1),

    db
      .select({
        id: expenseItems.id,
        name: expenseItems.name,
        amountIdr: expenseItems.amountIdr,
        category: expenseItems.category,
        sortOrder: expenseItems.sortOrder,
      })
      .from(expenseItems)
      .where(inArray(expenseItems.groupId, linkedGroupId))
      .orderBy(asc(expenseItems.sortOrder), asc(expenseItems.id)),

    db
      .select({
        id: expensePhotos.id,
        blobUrl: expensePhotos.blobUrl,
        blobPathname: expensePhotos.blobPathname,
        width: expensePhotos.width,
        height: expensePhotos.height,
        sizeBytes: expensePhotos.sizeBytes,
        sortOrder: expensePhotos.sortOrder,
      })
      .from(expensePhotos)
      .where(inArray(expensePhotos.groupId, linkedGroupId))
      .orderBy(asc(expensePhotos.sortOrder), asc(expensePhotos.createdAt)),
  ])

  const group = groupRows[0]
  if (!group) return null

  const items: ItemRow[] = itemRows.map((r) => ({ ...r, category: toCategory(r.category) }))

  return {
    ...group,
    items,
    photos: photoRows,
    totalIdr: items.reduce((sum, it) => sum + it.amountIdr, 0),
  }
}

/**
 * Last `months` months ending at `anchorMonth` inclusive, oldest → newest,
 * with zero-filled gaps so the F08 bar chart has a continuous x-axis.
 *
 * ONE round trip. The zero-fill is done in JS by fillZeroMonths (pure, unit-tested)
 * rather than a SQL generate_series — simpler, driver-agnostic, and testable without a DB.
 *
 * anchorMonth defaults to the CURRENT Asia/Jakarta month; callers on the server should
 * pass currentMonthKey() explicitly so the value is not re-derived per call.
 */
export async function getMonthlyTotals(
  userId: string,
  months: number,
  anchorMonth: MonthKey,
): Promise<MonthlyTotal[]> {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError(`months must be an integer in 1..60, got ${months}`)
  }
  const firstMonth = addMonths(anchorMonth, -(months - 1))
  const startISO = monthRange(firstMonth).startISO
  const endExclusiveISO = monthRange(anchorMonth).endExclusiveISO

  const monthExpr = sql<string>`to_char(${expenseGroups.occurredOn}, 'YYYY-MM')`

  const rows = await db
    .select({
      month: monthExpr,
      totalIdr: sql<number>`coalesce(sum(${expenseItems.amountIdr}), 0)`.mapWith(Number),
    })
    .from(expenseGroups)
    .leftJoin(expenseItems, eq(expenseItems.groupId, expenseGroups.id))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .groupBy(monthExpr)

  return fillZeroMonths(rows, anchorMonth, months)
}

/** Pure. Exported for unit testing and for F08 to reuse on client-side slices. */
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; totalIdr: number }>,
  anchorMonth: MonthKey,
  months: number,
): MonthlyTotal[] {
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.totalIdr) || 0]))
  const out: MonthlyTotal[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(anchorMonth, -i)
    out.push({ month: m, totalIdr: byMonth.get(m) ?? 0 })
  }
  return out
}

/**
 * Per-category totals for one month, biggest first. Powers the F08 donut.
 * Categories with no spend are simply absent — the chart should not draw 0% slices.
 */
export async function getCategoryBreakdown(userId: string, month: MonthKey): Promise<CategoryTotal[]> {
  const { startISO, endExclusiveISO } = monthRange(month)

  const rows = await db
    .select({
      category: expenseItems.category,
      totalIdr: sql<number>`sum(${expenseItems.amountIdr})`.mapWith(Number),
      itemCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(expenseItems)
    .innerJoin(expenseGroups, eq(expenseGroups.id, expenseItems.groupId))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .groupBy(expenseItems.category)
    .orderBy(desc(sql`sum(${expenseItems.amountIdr})`))

  return rows.map((r) => ({ ...r, category: toCategory(r.category) }))
}

/**
 * The single largest ITEM in the month, with enough group context to link to /e/[id].
 * Powers F08's "pengeluaran terbesar" callout. Returns null for an empty month.
 * Ties break on the newest day, then the item id — deterministic, so the callout does
 * not flicker between renders.
 */
export async function getBiggestExpense(userId: string, month: MonthKey): Promise<BiggestExpense | null> {
  const { startISO, endExclusiveISO } = monthRange(month)

  const rows = await db
    .select({
      itemId: expenseItems.id,
      name: expenseItems.name,
      amountIdr: expenseItems.amountIdr,
      category: expenseItems.category,
      groupId: expenseGroups.id,
      groupTitle: expenseGroups.title,
      occurredOn: expenseGroups.occurredOn,
    })
    .from(expenseItems)
    .innerJoin(expenseGroups, eq(expenseGroups.id, expenseItems.groupId))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(desc(expenseItems.amountIdr), desc(expenseGroups.occurredOn), asc(expenseItems.id))
    .limit(1)

  const row = rows[0]
  return row ? { ...row, category: toCategory(row.category) } : null
}
```

---

## 6. Migration workflow against Neon

### 6.1 Preconditions

`.env.local` (created by F01) must contain **both** strings from the Neon dashboard → *Connection Details*:

```dotenv
# "Pooled connection" — has -pooler in the host
DATABASE_URL="postgresql://neondb_owner:***@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
# "Direct connection" / uncheck "Connection pooling" — no -pooler
DATABASE_URL_UNPOOLED="postgresql://neondb_owner:***@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

### 6.2 Generate

```bash
npm run db:generate
```

Expected output (name after `0000_` is a random codename and will differ):

```
Reading config file '/home/miftah/expense-tracking/drizzle.config.ts'
8 tables
account 11 columns 0 indexes 1 fks
expense_groups 8 columns 1 indexes 1 fks
expense_items 6 columns 1 indexes 1 fks
expense_photos 9 columns 1 indexes 1 fks
session 3 columns 0 indexes 1 fks
share_links 3 columns 1 indexes 1 fks
user 5 columns 0 indexes 0 fks
verificationToken 3 columns 0 indexes 0 fks

[✓] Your SQL migration file ➜ drizzle/0000_striped_wolfsbane.sql 🚀
```

New files:

```
drizzle/
  0000_striped_wolfsbane.sql
  meta/
    _journal.json
    0000_snapshot.json
```

**Review `drizzle/0000_*.sql` before applying.** It must contain, modulo statement order:

```sql
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "expense_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"raw_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_idr" bigint NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_photos" ADD CONSTRAINT "expense_photos_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_groups_user_occurred_idx" ON "expense_groups" USING btree ("user_id","occurred_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expense_items_group_idx" ON "expense_items" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "expense_photos_group_idx" ON "expense_photos" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_group_id_unq" ON "share_links" USING btree ("group_id");
```

**Checklist against roadmap §4.2 — verify each line is present:**

- [ ] every FK says `ON DELETE cascade` (6 of them)
- [ ] `occurred_on` is `date`, not `timestamp`
- [ ] `amount_idr` is `bigint`, not `integer`
- [ ] the composite index is `("user_id","occurred_on" DESC NULLS LAST)` — the DESC matters, `/m/[month]` sorts that way
- [ ] `share_links_group_id_unq` is a **UNIQUE** index (one active link per group)
- [ ] all four `created_at`/`updated_at` are `timestamp with time zone`

### 6.3 Apply

```bash
npm run db:migrate
```

```
Reading config file '/home/miftah/expense-tracking/drizzle.config.ts'
[⣟] applying migrations...
[✓] migrations applied successfully!
```

drizzle-kit records applied migrations in `drizzle.__drizzle_migrations` — a **separate schema**, so `public`
contains exactly the 8 tables and nothing else.

### 6.4 Verify

Neon SQL Editor (or `psql "$DATABASE_URL_UNPOOLED"`):

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;
```

```
 account
 expense_groups
 expense_items
 expense_photos
 session
 share_links
 user
 verificationToken
(8 rows)
```

```sql
select conname, confdeltype from pg_constraint where contype = 'f' order by 1;
```

`confdeltype` must be `c` (cascade) for all six rows.

```sql
select indexname from pg_indexes where schemaname = 'public'
  and indexname like '%_idx' or indexname like '%_unq' order by 1;
```

```
 expense_groups_user_occurred_idx
 expense_items_group_idx
 expense_photos_group_idx
 share_links_group_id_unq
```

### 6.5 Rules for later migrations

1. **Never** hand-edit an applied migration or a `meta/*_snapshot.json`. Change `schema.ts`, run `db:generate`
   again, get `0001_*.sql`.
2. **Never** run `db:push` against production — it diffs live DDL and can drop columns without a paper trail. It is
   fine on a Neon *branch* while iterating.
3. Commit `drizzle/` to git. It is the deployment artifact.
4. Migrations run **manually** before deploy, not in `next build`. Vercel builds are parallel and would race the
   advisory lock.
5. Test destructive changes on a Neon branch (`Branches → Create branch from main`), which is instant and free.

---

## 7. TDD task list

Every task is: **write the failing test → run it (RED) → implement → run it (GREEN) → commit.**
Never write implementation before the test. Never commit RED.

Commands per task: `npx vitest run tests/<file>` for the loop, `npm test && npm run typecheck` before the commit.

---

**Task 1 — Harness.**
Test: `tests/harness.test.ts` asserting `expect(1 + 1).toBe(2)` and that `process.env.DATABASE_URL` is set by the
setup file.
Impl: install the §3 deps, add the §3 scripts, write `vitest.config.ts` and `tests/setup.ts`.
Commit: `chore(f03): vitest harness + drizzle/neon deps`.

**Task 2 — Categories.**
Test: `tests/categories.test.ts` — `CATEGORIES.length === 8`; every id has a `CATEGORY_META` entry whose `.id`
matches its key; labels, emoji and colour tokens are all distinct; `CATEGORY_LIST` order equals `CATEGORIES` order;
`isCategory('food')` true, `isCategory('Food')` false, `isCategory(null)` false;
`categoryMeta('nonsense').id === 'other'`; `toCategory(undefined) === 'other'`; every `color` matches
`/^--color-cat-[a-z]+$/`.
Impl: `lib/categories.ts` (§5.1).
Commit: `feat(f03): categories with Indonesian labels and colour tokens`.

**Task 3 — Ids.**
Test: `tests/id.test.ts` — `newId()` has length 12 and matches `/^[0-9A-Za-z_-]{12}$/`; 20 000 ids are all
distinct; `newId(21).length === 21`; `ID_ENTROPY_BITS === 72`; `isValidId` accepts a generated id and rejects
`''`, `'short'`, `'has spaces!'`, `'a'.repeat(13)`, `null`.
Impl: `lib/id.ts` (§5.2).
Commit: `feat(f03): nanoid-compatible id helper`.

**Task 4 — `formatIdr` / `formatIdrCompact`.**
Test: `tests/format.money.test.ts`, driven by the §8.1 table with `it.each`.
Impl: the money half of `lib/format.ts` (§5.3).
Commit: `feat(f03): formatIdr`.

**Task 5 — `parseIdrLoose`.**
Test: extend `tests/format.money.test.ts` with the §8.2 table (accepting cases) and §8.3 table (null cases),
both via `it.each`. Add the round-trip property: for every row in §8.2,
`parseIdrLoose(formatIdr(expected)) === expected`.
Impl: `parseIdrLoose` (§5.3).
Commit: `feat(f03): parseIdrLoose for Indonesian money notation`.

**Task 6 — Date helpers.**
Test: `tests/format.date.test.ts` —
`todayJakartaISO(new Date('2026-08-18T16:30:00Z')) === '2026-08-18'` (23:30 Jakarta, same day) and
`todayJakartaISO(new Date('2026-08-18T17:30:00Z')) === '2026-08-19'` (00:30 Jakarta, **next** day — this is the
UTC+7 boundary test that catches a missing timeZone option);
`monthKey('2026-08-18') === '2026-08'`;
`monthRange('2026-08')` → `{ startISO: '2026-08-01', endExclusiveISO: '2026-09-01' }`;
`monthRange('2026-02').endExclusiveISO === '2026-03-01'` and `monthRange('2026-12').endExclusiveISO === '2027-01-01'`;
`addMonths('2026-01', -1) === '2025-12'`, `addMonths('2026-12', 1) === '2027-01'`, `addMonths('2026-08', -12) === '2025-08'`,
`addMonths('2026-08', 0) === '2026-08'`;
`monthLabel('2026-08') === 'Agustus 2026'`; `monthLabelShort('2026-08') === 'Agu 26'`;
`dateLabel('2026-08-18') === '18 Agustus 2026'`; `dayLabel('2026-08-18') === 'Selasa, 18 Agustus 2026'`
(18 Aug 2026 really is a Tuesday — it is the roadmap's canonical example);
`isValidDateISO('2026-02-30') === false`, `isValidDateISO('2026-13-01') === false`, `isValidDateISO('2026-8-1') === false`;
`isValidMonthKey('2026-13') === false`; `monthRange('nope')` throws `RangeError`.
Impl: the date half of `lib/format.ts` (§5.3).
Commit: `feat(f03): Asia/Jakarta date helpers and Indonesian month names`.

**Task 7 — Zod contracts.**
Test: `tests/schema.expense.test.ts` — `ParsedExpense.parse()` accepts the roadmap's canonical example
(6 items, title `bakar duit tuesday`, `occurred_on: '2026-08-18'`) and the parsed items sum to `266350`;
rejects `items: []`, 51 items, `amount_idr: -1`, `amount_idr: 1_000_000_001`, `amount_idr: 1.5`,
`category: 'makanan'`, `occurred_on: '18/08/2026'`, `title: '   '` (trim-then-min-1),
`name` of 121 chars; confirms `.trim()` actually trims (`title: '  a  '` → `'a'`).
Also: `CreateExpenseInput` accepts a `ParsedExpense` with no extras; `UpdateItemInput.parse({})` throws.
Impl: `lib/schema/expense.ts` (§5.4).
Commit: `feat(f03): Zod contracts for the parse boundary`.

**Task 8 — App tables.**
Test: `tests/db.schema.test.ts` using `getTableConfig` from `drizzle-orm/pg-core` — for each of the four app
tables assert the SQL table name, the exact set of column SQL names, that `amount_idr` has
`getSQLType() === 'bigint'`, that `occurred_on` has `getSQLType() === 'date'`, that every FK is
`onDelete: 'cascade'`, that `expense_groups_user_occurred_idx` exists over `(user_id, occurred_on)`, and that
`share_links_group_id_unq` is unique.
Impl: the app-table half of `lib/db/schema.ts` (§5.5).
Commit: `feat(f03): drizzle schema for expense tables`.

**Task 9 — Auth.js adapter tables.**
Test: extend `tests/db.schema.test.ts` — SQL names are `user`/`account`/`session`/`verificationToken`; `account`
has the 11 canonical columns with camelCase names; `account`'s PK is composite over
`(provider, providerAccountId)`; `verificationToken`'s PK is composite over `(identifier, token)`;
`user.email` is unique; `account.userId` and `session.userId` cascade.
Impl: the Auth.js half of `lib/db/schema.ts` (§5.5).
Commit: `feat(f03): Auth.js adapter tables (canonical shape)`.

**Task 10 — DB client.**
Test: `tests/db.client.test.ts` — with `vi.resetModules()` and `DATABASE_URL` deleted, `await import('@/lib/db')`
rejects with a message containing `DATABASE_URL`; with it set, `db` is defined and two imports return the same
instance (globalThis cache).
Impl: `lib/db/index.ts` (§5.6).
Commit: `feat(f03): neon-http drizzle client`.

**Task 11 — Generate the migration.**
No unit test. Write `drizzle.config.ts` (§5.7), run `npm run db:generate`, review `drizzle/0000_*.sql` against the
§6.2 checklist line by line.
Commit: `feat(f03): drizzle config + initial migration`.

**Task 12 — Apply to Neon.**
Run `npm run db:migrate`, then run the three verification queries in §6.4 and paste the results into the commit
body.
Commit: `chore(f03): apply 0000 to neon`.

**Task 13 — Ownership predicates.**
Test: `tests/db.ownership.test.ts` — build
`db.select().from(expenseItems).where(and(eq(expenseItems.id, 'x'), itemOwnedBy('u1'))).toSQL()` and assert the
generated `sql` string contains `exists`, `"expense_groups"."user_id"`, and
`"expense_groups"."id" = "expense_items"."group_id"`, and that `params` contains `'u1'`. Same for
`photoOwnedBy` and `shareLinkOwnedBy`. This test is the regression guard on the app's core security property —
label it as such in the file header.
Impl: §1–§2 of `lib/db/queries.ts` (§5.8).
Commit: `feat(f03): userId ownership predicates`.

**Task 14 — `getMonthGroups`.**
Test: extend `tests/db.queries.sql.test.ts` — assert the generated SQL contains `"expense_groups"."user_id" = $`,
three correlated subqueries, `order by` with two `desc`, and — critically — **no `join`** (proving the no-fan-out
design). Assert `params` are `[userId, '2026-08-01', '2026-09-01']` in that order.
Impl: `getMonthGroups`.
Commit: `feat(f03): getMonthGroups with SQL aggregates, one round trip`.

**Task 15 — `getGroupDetail`.**
Test: SQL-shape test on each of the four batched statements (extract them by building the same builders in the
test); assert every one of the four carries `user_id`.
Impl: `getGroupDetail`.
Commit: `feat(f03): getGroupDetail via db.batch`.

**Task 16 — `getGroupByShareToken`.**
Test: assert the generated SQL for all three statements contains **no** `user_id` predicate, contains
`"share_links"."token" = $1`, and that the returned type has no `userId`/`email`/`rawText` key (a compile-time
`expectTypeOf<SharedGroup>().not.toHaveProperty('rawText')` plus a runtime `Object.keys` check on a hand-built
object).
Impl: `getGroupByShareToken`.
Commit: `feat(f03): getGroupByShareToken (the one unscoped query)`.

**Task 17 — `getMonthlyTotals` + `fillZeroMonths`.**
Test: pure unit tests on `fillZeroMonths` — 12 months from `'2026-08'` returns 12 entries starting `'2025-09'` and
ending `'2026-08'`, all zero when rows are empty; a single row `{ month: '2026-03', totalIdr: 5000 }` lands in the
right slot; unknown months in `rows` are ignored; string totals (`'5000'`) coerce to numbers. Then the SQL-shape
test: `months: 0` and `months: 61` throw `RangeError`; the query's params bracket the right range.
Impl: `getMonthlyTotals`, `fillZeroMonths`.
Commit: `feat(f03): getMonthlyTotals with zero-filled months`.

**Task 18 — `getCategoryBreakdown` + `getBiggestExpense`.**
Test: SQL-shape — both contain `"expense_groups"."user_id" = $`; the breakdown groups by
`"expense_items"."category"` and orders by the sum descending; the biggest query is `limit 1` with a three-key
`order by`.
Impl: both functions.
Commit: `feat(f03): category breakdown and biggest-expense queries`.

**Task 19 — Integration suite (needs a Neon branch).**
Test + impl together (§10): seeds two users, asserts every read is scoped, asserts cascades, asserts the
share-link unique constraint, asserts totals are numbers not strings.
Commit: `test(f03): integration suite against a neon branch`.

**Task 20 — Green gate.**
Run `npm test && npm run test:int && npm run typecheck && npx eslint .`. Everything green.
Commit: `chore(f03): data layer complete`. **F02 and F04 are now unblocked.**

---

## 8. Money helper test tables

These are the specification. If the implementation and the table disagree, the table wins.

### 8.1 `formatIdr(n)`

| n | expected | why it is in the table |
|---|---|---|
| `0` | `Rp 0` | empty month / empty group |
| `500` | `Rp 500` | below the first group boundary |
| `1000` | `Rp 1.000` | first separator |
| `26000` | `Rp 26.000` | canonical example, `pak gembus 26k` |
| `38500` | `Rp 38.500` | roadmap §4.7's literal example |
| `58850` | `Rp 58.850` | canonical example, non-round value |
| `266350` | `Rp 266.350` | roadmap §1 canonical group total |
| `1250000` | `Rp 1.250.000` | two separators |
| `1000000000` | `Rp 1.000.000.000` | §4.3 maximum item amount |
| `-45000` | `-Rp 45.000` | sign goes outside `Rp`, never `Rp -45.000` |
| `38500.4` | `Rp 38.500` | rounds down |
| `38500.6` | `Rp 38.501` | rounds up |
| `Number.NaN` | `Rp 0` | never renders "Rp NaN" in the UI |

### 8.1b `formatIdrCompact(n)` (F08 axis labels)

| n | expected |
|---|---|
| `0` | `Rp 0` |
| `950` | `Rp 950` |
| `1000` | `Rp 1rb` |
| `9500` | `Rp 9,5rb` |
| `45000` | `Rp 45rb` |
| `266350` | `Rp 266rb` |
| `1500000` | `Rp 1,5jt` |
| `12000000` | `Rp 12jt` |
| `1234567890` | `Rp 1,2M` |

### 8.2 `parseIdrLoose(s)` — accepted

| input | expected | rule exercised |
|---|---|---|
| `"38500"` | `38500` | bare integer |
| `"38.500"` | `38500` | **`.` is a THOUSANDS separator in Indonesian** |
| `"Rp 38.500"` | `38500` | roadmap §4.7 example |
| `"Rp. 38.500"` | `38500` | `Rp.` with a dot |
| `"Rp38.500"` | `38500` | no space |
| `"rp 38.500"` | `38500` | lowercase |
| `"  38.500  "` | `38500` | surrounding whitespace |
| `"1.250.000"` | `1250000` | two thousands separators |
| `"1.234.567.890"` | `1234567890` | > §4.3 max — parser does **not** clamp, Zod rejects downstream |
| `"38.500,00"` | `38500` | full id-ID form: `.` thousands + `,` decimals |
| `"Rp 1.250.000,-"` | `1250000` | Indonesian invoice tail |
| `"45k"` | `45000` | `k` suffix |
| `"45K"` | `45000` | case-insensitive |
| `"45rb"` | `45000` | `rb` suffix |
| `"45 rb"` | `45000` | space before suffix |
| `"45ribu"` | `45000` | full word |
| `"45 ribu"` | `45000` | full word with space |
| `"100rb"` | `100000` | |
| `"3,5rb"` | `3500` | fractional thousand, comma decimal |
| `"12.5k"` | `12500` | fractional thousand, **dot as decimal because the suffix disambiguates** |
| `"1jt"` | `1000000` | `jt` suffix |
| `"1,5jt"` | `1500000` | roadmap §4.7 example |
| `"1.5jt"` | `1500000` | same value, dot form (F04's prompt must produce both) |
| `"1,25jt"` | `1250000` | two decimal digits |
| `"2,5 juta"` | `2500000` | full word |
| `"IDR 45.000"` | `45000` | `IDR` prefix |
| `"75.000 rupiah"` | `75000` | `rupiah` suffix word |
| `"0"` | `0` | zero is valid (`min(0)`) |
| `"49k"` | `49000` | canonical example |
| `"58850"` | `58850` | canonical example |
| `"12,000"` | `12000` | US-style comma-thousands degrades gracefully (3 trailing digits ⇒ thousands) |
| `"45.000k"` | `45000000` | thousands group **inside** a suffixed number; documented, not an accident |
| `"1,5"` | `2` | no suffix, 1 trailing digit ⇒ decimal ⇒ `Math.round(1.5)`. Degenerate input, defined behaviour |

**The disambiguation rule, stated once:** split on `[.,]`. If there is more than one part and the **last** part has
exactly 3 digits, every separator is a thousands separator. Otherwise the last separator is a decimal point. A
`k`/`rb`/`jt` suffix is stripped first and does not change this rule — it only multiplies the result.

### 8.3 `parseIdrLoose(s)` — must return `null`

| input | why |
|---|---|
| `""` | empty |
| `"   "` | whitespace only |
| `"abc"` | no digits |
| `"seratus ribu"` | words are F04's job, not the input field's |
| `"Rp"` | currency marker with no number |
| `"45k5"` | suffix not at the end |
| `"12,,3"` | malformed separators |
| `"-5000"` | negatives are not expenses |
| `"1e5"` | no scientific notation |
| `"4 5 0 0 0"` → **`45000`** | *not* null — whitespace is stripped first. Listed here so nobody "fixes" it |
| `null` / `undefined` / `42` (non-string) | defensive `typeof` guard |

---

## 9. The userId-scoping invariant

> **This is the app's core security property. Read it before writing any mutation in F05–F09.**

### 9.1 Statement

Every row in the database belongs to exactly one user, and every path to it is checked.

```
users.id ──< expense_groups.user_id
                    │
                    ├──< expense_items.group_id
                    ├──< expense_photos.group_id
                    └──< share_links.group_id
```

`expense_groups` is the **only** table with a `user_id` column. Every other app table proves ownership by
joining back to it. Therefore:

1. Every read and every write filters on `expense_groups.user_id = <session user id>` — directly for
   `expense_groups`, via a correlated `EXISTS` for the three child tables.
2. The one and only exception is `getGroupByShareToken`, which is unscoped by design and marked with a banner
   comment in the source (§5.8). There is never a second exception.
3. A row that exists but is not yours, and a row that does not exist, are **the same outcome**: `NotFoundError` →
   HTTP 404. Never 403, never "belongs to another user". Distinguishing them is an id-enumeration oracle.
4. `userId` comes from `await requireUserId()` (F02) — the server session — **never** from a Server Action
   argument, a form field, a header, or a URL segment. If a `userId` appears in an action's parameter list, that
   is a bug.

### 9.2 The pattern every nested mutation must copy

Updating an item is the canonical case: `expense_items` has no `user_id`, so the `UPDATE` itself must carry the
proof. Do it **in the same statement** — never `SELECT` to check and then `UPDATE`, which is both an extra round
trip and a TOCTOU window.

```ts
// app/actions/items.ts  (F07 writes this file — this is the shape it must have)
'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { expenseItems } from '@/lib/db/schema'
import { itemOwnedBy, NotFoundError } from '@/lib/db/queries'
import { UpdateItemInput } from '@/lib/schema/expense'
import { requireUserId } from '@/lib/auth' // F02

export async function updateItem(id: string, raw: unknown): Promise<void> {
  const userId = await requireUserId()          // 1. identity from the session, never from an argument
  const patch = UpdateItemInput.parse(raw)      // 2. validate the payload

  const [row] = await db
    .update(expenseItems)
    .set(patch)
    .where(
      and(
        eq(expenseItems.id, id),                // 3. target
        itemOwnedBy(userId),                    // 4. PROOF — correlated EXISTS back to expense_groups.user_id
      ),
    )
    .returning({ id: expenseItems.id, groupId: expenseItems.groupId })

  // 5. Zero rows updated ⇒ missing OR not yours. Indistinguishable, on purpose.
  if (!row) throw new NotFoundError('Expense item not found')

  revalidatePath(`/e/${row.groupId}`)
}
```

The SQL Drizzle emits:

```sql
update "expense_items" set "name" = $1
where "expense_items"."id" = $2
  and exists (
    select 1 from "expense_groups"
    where "expense_groups"."id" = "expense_items"."group_id"
      and "expense_groups"."user_id" = $3
  )
returning "id", "group_id";
```

**Five properties that make this correct, and that a reviewer should check for on every mutation PR:**

| # | Property |
|---|---|
| 1 | `userId` came from `requireUserId()` |
| 2 | The ownership predicate is in the **same statement** as the mutation (atomic, no TOCTOU) |
| 3 | `.returning()` is present, so "did anything change?" is answerable |
| 4 | An empty result throws `NotFoundError`, never a silent success — a silent no-op would let an attacker probe ids by timing |
| 5 | The error message is identical for "missing" and "not yours" |

### 9.3 The same pattern, per table

```ts
// expense_groups — has user_id, so the check is a plain equality
const [g] = await db.update(expenseGroups).set(patch)
  .where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))
  .returning({ id: expenseGroups.id })
if (!g) throw new NotFoundError()

// expense_items
.where(and(eq(expenseItems.id, id), itemOwnedBy(userId)))

// expense_photos — deletePhoto also needs blobPathname back for @vercel/blob del()
const [p] = await db.delete(expensePhotos)
  .where(and(eq(expensePhotos.id, id), photoOwnedBy(userId)))
  .returning({ groupId: expensePhotos.groupId, blobPathname: expensePhotos.blobPathname })
if (!p) throw new NotFoundError()
await del(p.blobPathname)   // only after the DB proved ownership — never before

// share_links — revoke
const [s] = await db.delete(shareLinks)
  .where(and(eq(shareLinks.groupId, groupId), shareLinkOwnedBy(userId)))
  .returning({ token: shareLinks.token })
// revoke is idempotent: !s is fine here, do not throw

// child INSERTs cannot use EXISTS on themselves — prove first, then insert, inside one batch
await assertGroupOwned(userId, groupId)
```

### 9.4 Multi-statement mutations: `db.batch`, not `db.transaction`

`drizzle-orm/neon-http` throws on `db.transaction()` (plan D-C). `createExpense` inserts a group plus N items and
must be all-or-nothing:

```ts
// app/actions/expenses.ts (F05)
export async function createExpense(raw: unknown): Promise<{ id: string }> {
  const userId = await requireUserId()
  const input = CreateExpenseInput.parse(raw)
  const groupId = newGroupId()

  await db.batch([                                   // one HTTP request, one Postgres transaction
    db.insert(expenseGroups).values({
      id: groupId,
      userId,                                        // ← ownership is set here, from the session
      title: input.title,
      occurredOn: input.occurred_on,
      note: input.note ?? null,
      rawText: input.rawText ?? null,
    }),
    db.insert(expenseItems).values(
      input.items.map((it, i) => ({
        id: newItemId(),
        groupId,
        name: it.name,
        amountIdr: it.amount_idr,
        category: it.category,
        sortOrder: i,                                // preserves the order the user reviewed
      })),
    ),
  ])

  revalidatePath(`/m/${monthKey(input.occurred_on)}`)
  return { id: groupId }
}
```

`db.batch` requires a non-empty, statically-known tuple. If a step is conditional, build the array first and cast,
or run the conditional step as a separate call — but only when it is genuinely independent.

### 9.5 Deletes rely on `ON DELETE CASCADE`

`DELETE FROM expense_groups WHERE id = $1 AND user_id = $2` removes its items, photos and share link in one
statement. Do **not** hand-delete children first — that is three statements, three chances to leave orphans.

One thing cascade does *not* clean up: **Vercel Blob objects**. `deleteExpense` must
`SELECT blob_pathname FROM expense_photos WHERE group_id = $1` (scoped) **before** the delete, then `del()` the
blobs after the transaction commits. F06 owns that sequence; noting it here because the DB cascade makes it easy
to forget.

### 9.6 Review checklist for consuming features

- [ ] Does every exported action begin with `const userId = await requireUserId()`?
- [ ] Does `userId` appear in the `where` of every statement the action executes?
- [ ] Is `userId` absent from every action's parameter list?
- [ ] Is `getGroupByShareToken` still the only unscoped read in the repo? (`grep -rn "from(expenseGroups)" app lib`)
- [ ] Does `/s/[token]` render only `SharedGroup` fields — no `rawText`, no email, no user id?
- [ ] Does `middleware.ts` protect `/new`, `/m`, `/e`, `/stats` and explicitly **not** `/s`?

---

## 10. Integration tests (Task 19)

`tests/integration/queries.int.test.ts`, run by `npm run test:int` against a **Neon branch**, never `main`.
Requires `TEST_DATABASE_URL`; the whole file is `describe.skipIf(!process.env.TEST_DATABASE_URL)` so CI without a
DB stays green.

Setup: create two users `u1` and `u2` with `crypto.randomUUID()` ids, then for each a group in `2026-08` and one
in `2026-06`, items, photos and one share link. Teardown deletes both users — cascade removes everything else,
which is itself an assertion.

The assertions that matter:

1. **`getMonthGroups('u1', '2026-08')`** returns only `u1`'s August group. `typeof totalIdr === 'number'` (this is
   the `bigint`-as-string regression test), `totalIdr === 266350`, `itemCount === 6`, `photoCount === 2`.
2. **Cross-user isolation.** `getMonthGroups('u2', '2026-08')` never contains a `u1` id.
   `getGroupDetail('u2', <u1's group id>)` is `null`. `getOwnedGroupIdForItem('u2', <u1's item id>)` throws
   `NotFoundError`.
3. **Month boundaries.** A group on `2026-08-01` and one on `2026-08-31` are both in `'2026-08'`; one on
   `2026-07-31` and one on `2026-09-01` are not. This is the half-open-range test.
4. **`occurred_on` round-trip.** Insert `'2026-08-18'`, read back `'2026-08-18'` — a `string`, not a `Date`, and
   with no off-by-one. Run the file with `TZ=America/New_York npm run test:int` too; the result must be identical.
   That single run is what proves plan D-B.
5. **`getGroupDetail`** returns items ordered by `sortOrder`, photos ordered by `sortOrder`, `shareToken` non-null
   when a link exists and `null` after `DELETE FROM share_links`, and `totalIdr` equal to the sum of the items.
6. **`getGroupByShareToken`** returns the group for a valid token, `null` for a garbage token, and `null` after
   revocation; the returned object has no `rawText`, no `userId`, no email.
7. **`getMonthlyTotals('u1', 12, '2026-08')`** returns exactly 12 entries, oldest first, starting `'2025-09'`,
   with `'2026-07'` present at `0` (the zero-fill) and `'2026-08'` at `266350`.
8. **`getCategoryBreakdown('u1', '2026-08')`** sums per category, is ordered descending, and its totals sum to the
   month total.
9. **`getBiggestExpense('u1', '2026-08')`** returns `fan fries plaza blok m` at `58850`; returns `null` for an
   empty month.
10. **Cascade.** Deleting a group removes its items, photos and share link. Deleting a user removes their groups.
11. **Share uniqueness.** A second `INSERT` into `share_links` for the same `group_id` rejects with a unique
    violation — proving revoke-then-remint is the only path.
12. **Round trip count.** Wrap the Neon client's `fetch` with a counter; `getGroupDetail` and
    `getGroupByShareToken` must each cost exactly **1**. This is the N+1 regression guard.

---

## Contract deltas

Nine, all additive or clarifying. None changes a shape another feature was already told to expect.

1. **Auth.js SQL table names are singular and camelCase.** Roadmap §4.2 writes `→ users.id`. The exported Drizzle
   symbols *are* `users`/`accounts`/`sessions`/`verificationTokens`, but the underlying SQL tables are
   `"user"`, `"account"`, `"session"`, `"verificationToken"` with camelCase columns, copied verbatim from
   `@auth/drizzle-adapter`'s canonical Postgres schema per §4.2's own "do not hand-roll them" instruction.
   Nothing outside `lib/db/` sees an SQL name, so no consumer is affected. Consequence for F02: pass the tables to
   the adapter explicitly —
   `DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens })`
   — rather than relying on name-based auto-detection.

2. **The `authenticators` table is omitted.** WebAuthn only. §3 pins Google OAuth. Adding it later is a
   one-table migration.

3. **`lib/id.ts` has no `nanoid` dependency.** Same 64-symbol URL-safe alphabet, same 12 characters, same 72 bits;
   ~15 lines of `crypto.getRandomValues` instead. Rationale in D-E. (Roadmap F09 says "~71 bits"; the exact figure
   is 72.)

4. **`db.transaction()` is unavailable.** The `neon-http` driver does not support interactive transactions.
   Multi-statement atomic mutations use `db.batch([...])`, which Neon runs as one transaction in one HTTP request.
   This binds F05 (`createExpense`) and F09 (`createShareLink`). See D-C and §9.4.

5. **`lib/format.ts` exports more than §4.7 lists.** Additive: `formatIdrCompact`, `currentMonthKey`, `monthRange`,
   `addMonths`, `monthLabel`, `monthLabelShort`, `dateLabel`, `dayLabel`, `isValidDateISO`, `isValidMonthKey`,
   `MONTH_NAMES_ID`, `MONTH_NAMES_ID_SHORT`, `DAY_NAMES_ID`, and the `DateISO`/`MonthKey` type aliases. F07 and F08
   would otherwise each invent their own.

6. **`lib/schema/expense.ts` exports action-input schemas** (`CreateExpenseInput`, `UpdateExpenseMetaInput`,
   `AddItemInput`, `UpdateItemInput`, `AttachPhotoInput`, `ParseRequest`) beyond §4.3's two. Server Action arguments
   are attacker-controlled; every action needs a parser. §4.3's `ParsedItem`/`ParsedExpense` are unchanged,
   character for character.

7. **`getBiggestExpense(userId, month)` is added to `lib/db/queries.ts`.** §5's F03 blurb lists five queries; F08's
   blurb requires a "biggest-single-expense callout". It is defined here so F08 does not write its own unscoped
   query. It returns the largest **item** (see Open Question 2).

8. **`getMonthlyTotals` takes an explicit `anchorMonth` third parameter** rather than deriving "now" internally.
   A query module that reads the wall clock is untestable and non-deterministic across a midnight boundary. Callers
   pass `currentMonthKey()`.

9. **`updated_at` is maintained by Drizzle's `$onUpdate`, not a Postgres trigger.** A raw SQL `UPDATE` will not
   bump it. All mutations go through Drizzle, so this holds — but do not add a trigger later expecting the two to
   agree.

---

## Interfaces I publish

Exhaustive. Seven features import from this list; nothing here may change without a Contract delta in the
consuming plan and an update to this section.

### `lib/categories.ts` — consumed by F04, F05, F07, F08, F09, F10

```ts
export const CATEGORIES: readonly ['food','groceries','transport','bills','housing','entertainment','health','other']
export type Category = 'food'|'groceries'|'transport'|'bills'|'housing'|'entertainment'|'health'|'other'
export const DEFAULT_CATEGORY: Category                                   // 'other'
export interface CategoryMeta {
  id: Category
  label: string
  emoji: string
  color: `--color-cat-${Category}`
  hint: string
}
export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>>
export const CATEGORY_LIST: readonly CategoryMeta[]                       // grid order === CATEGORIES order
export function isCategory(value: unknown): value is Category
export function categoryMeta(value: string): CategoryMeta                 // never throws; unknown → 'other'
export function toCategory(value: unknown): Category                      // never throws; unknown → 'other'
```

### `lib/id.ts` — consumed by F05, F06, F09

```ts
export const ID_LENGTH: 12
export const ID_ENTROPY_BITS: number                                      // 72
export function newId(size?: number): string
export const newGroupId: () => string
export const newItemId: () => string
export const newPhotoId: () => string
export const newShareToken: () => string
export function isValidId(value: unknown): value is string                // /^[0-9A-Za-z_-]{12}$/
```

### `lib/format.ts` — consumed by F04, F05, F07, F08, F09, F10

```ts
export const TZ: 'Asia/Jakarta'
export type DateISO = string                                              // 'YYYY-MM-DD'
export type MonthKey = string                                             // 'YYYY-MM'

export function formatIdr(n: number): string                              // 38500 → 'Rp 38.500'
export function formatIdrCompact(n: number): string                       // 1500000 → 'Rp 1,5jt'
export function parseIdrLoose(input: string): number | null               // '1,5jt' → 1500000

export function isValidDateISO(v: unknown): v is DateISO
export function isValidMonthKey(v: unknown): v is MonthKey
export function todayJakartaISO(now?: Date): DateISO
export function monthKey(value?: DateISO | Date): MonthKey
export function currentMonthKey(now?: Date): MonthKey
export function monthRange(month: MonthKey): { startISO: DateISO; endExclusiveISO: DateISO }  // throws RangeError
export function addMonths(month: MonthKey, delta: number): MonthKey                            // throws RangeError

export const MONTH_NAMES_ID: readonly [string × 12]                       // 'Januari' … 'Desember'
export const MONTH_NAMES_ID_SHORT: readonly [string × 12]                 // 'Jan' … 'Des'
export const DAY_NAMES_ID: readonly [string × 7]                          // 'Minggu' … 'Sabtu'
export function monthLabel(month: MonthKey): string                       // '2026-08' → 'Agustus 2026'
export function monthLabelShort(month: MonthKey): string                  // '2026-08' → 'Agu 26'
export function dateLabel(iso: DateISO): string                           // → '18 Agustus 2026'
export function dayLabel(iso: DateISO): string                            // → 'Selasa, 18 Agustus 2026'
```

### `lib/schema/expense.ts` — consumed by F04, F05, F06, F07

```ts
// §4.3 AUTHORITATIVE — also the GLM tool's input_schema (F04)
export const ParsedItem: z.ZodObject<{ name: z.ZodString; amount_idr: z.ZodNumber; category: z.ZodEnum<…> }>
export type  ParsedItem    = { name: string; amount_idr: number; category: Category }
export const ParsedExpense: z.ZodObject<{ title: z.ZodString; occurred_on: z.ZodString; items: z.ZodArray<…> }>
export type  ParsedExpense = { title: string; occurred_on: string; items: ParsedItem[] }

// primitives
export const IdSchema:        z.ZodString
export const DateISOSchema:   z.ZodString
export const MonthKeySchema:  z.ZodString
export const AmountIdrSchema: z.ZodNumber
export const CategorySchema:  z.ZodEnum<typeof CATEGORIES>
export const TitleSchema:     z.ZodString
export const NoteSchema:      z.ZodString

// action inputs
export const CreateExpenseInput: z.ZodObject<…>
export type  CreateExpenseInput = ParsedExpense & { note?: string; rawText?: string; photoIds?: string[] }
export const UpdateExpenseMetaInput: z.ZodObject<…>   // carries a .refine()
export type  UpdateExpenseMetaInput = { title?: string; occurredOn?: string; note?: string | null }
export const AddItemInput: z.ZodObject<…>
export type  AddItemInput = { name: string; amountIdr: number; category: Category }
export const UpdateItemInput: z.ZodObject<…>          // carries a .refine()
export type  UpdateItemInput = { name?: string; amountIdr?: number; category?: Category }
export const AttachPhotoInput: z.ZodObject<…>
export type  AttachPhotoInput = {
  groupId: string; blobUrl: string; blobPathname: string
  width?: number; height?: number; sizeBytes?: number
}
export const ParseRequest: z.ZodObject<…>
export type  ParseRequest = { rawText: string; todayISO: string }
```

### `lib/db/schema.ts` — consumed by F02, F05, F06, F07, F09

Table objects:

```ts
export const users:              PgTable   // SQL "user"
export const accounts:           PgTable   // SQL "account"
export const sessions:           PgTable   // SQL "session"
export const verificationTokens: PgTable   // SQL "verificationToken"
export const expenseGroups:      PgTable   // SQL "expense_groups"
export const expenseItems:       PgTable   // SQL "expense_items"
export const expensePhotos:      PgTable   // SQL "expense_photos"
export const shareLinks:         PgTable   // SQL "share_links"

export const expenseGroupsRelations, expenseItemsRelations, expensePhotosRelations, shareLinksRelations
```

Inferred row types — **this is the exact JS shape at every call site**:

```ts
export type User = {
  id: string; name: string | null; email: string | null
  emailVerified: Date | null; image: string | null
}

export type ExpenseGroup = {
  id: string           // nanoid(12)
  userId: string
  title: string
  occurredOn: string   // 'YYYY-MM-DD'  ← string, NOT Date (plan D-B)
  note: string | null
  rawText: string | null
  createdAt: Date
  updatedAt: Date
}
export type NewExpenseGroup = {
  id: string; userId: string; title: string; occurredOn: string
  note?: string | null; rawText?: string | null; createdAt?: Date; updatedAt?: Date
}

export type ExpenseItem = {
  id: string
  groupId: string
  name: string
  amountIdr: number    // number, NOT bigint (plan D-A)
  category: string     // widen at the boundary with toCategory()
  sortOrder: number
}
export type NewExpenseItem = {
  id: string; groupId: string; name: string; amountIdr: number
  category: string; sortOrder?: number
}

export type ExpensePhoto = {
  id: string; groupId: string; blobUrl: string; blobPathname: string
  width: number | null; height: number | null; sizeBytes: number | null
  sortOrder: number; createdAt: Date
}
export type NewExpensePhoto = {
  id: string; groupId: string; blobUrl: string; blobPathname: string
  width?: number | null; height?: number | null; sizeBytes?: number | null
  sortOrder?: number; createdAt?: Date
}

export type ShareLink     = { token: string; groupId: string; createdAt: Date }
export type NewShareLink  = { token: string; groupId: string; createdAt?: Date }
```

> **Note on `ExpenseItem.category: string`.** Drizzle types a `text` column as `string`. The query functions in
> `queries.ts` narrow it to `Category` via `toCategory()` before returning. If you write your own select, narrow it
> yourself — do **not** cast.

### `lib/db/index.ts` — consumed by F02, F05, F06, F07, F09

```ts
export type Database = NeonHttpDatabase<typeof schema>
export const db: Database                 // eager singleton, globalThis-cached
export { schema }                         // namespace object
export * from './schema'                  // all tables and row types re-exported for convenience
```

`db` supports the full Drizzle query builder plus `db.batch([...])`. It does **not** support `db.transaction()`.

### `lib/db/queries.ts` — consumed by F05, F07, F08, F09

```ts
export class NotFoundError extends Error { readonly code: 'NOT_FOUND' }

// ── ownership primitives (F05, F06, F07, F09 mutations MUST use these) ──
export function itemOwnedBy(userId: string): SQL<unknown>
export function photoOwnedBy(userId: string): SQL<unknown>
export function shareLinkOwnedBy(userId: string): SQL<unknown>
export function assertGroupOwned(userId: string, groupId: string): Promise<void>          // throws NotFoundError
export function getOwnedGroupIdForItem(userId: string, itemId: string): Promise<string>   // throws NotFoundError

// ── row shapes ──
export interface MonthGroupRow {
  id: string; title: string; occurredOn: string; note: string | null
  totalIdr: number; itemCount: number; photoCount: number
}
export interface ItemRow  { id: string; name: string; amountIdr: number; category: Category; sortOrder: number }
export interface PhotoRow {
  id: string; blobUrl: string; blobPathname: string
  width: number | null; height: number | null; sizeBytes: number | null; sortOrder: number
}
export interface GroupDetail {
  id: string; title: string; occurredOn: string; note: string | null; rawText: string | null
  createdAt: Date; updatedAt: Date
  items: ItemRow[]; photos: PhotoRow[]
  shareToken: string | null; totalIdr: number
}
export interface SharedGroup {
  id: string; title: string; occurredOn: string; note: string | null
  ownerName: string | null
  items: ItemRow[]; photos: PhotoRow[]; totalIdr: number
}
export interface MonthlyTotal   { month: string; totalIdr: number }
export interface CategoryTotal  { category: Category; totalIdr: number; itemCount: number }
export interface BiggestExpense {
  itemId: string; name: string; amountIdr: number; category: Category
  groupId: string; groupTitle: string; occurredOn: string
}

// ── reads ──
export function getMonthGroups(userId: string, month: string): Promise<MonthGroupRow[]>
export function getGroupDetail(userId: string, id: string): Promise<GroupDetail | null>
export function getMonthlyTotals(userId: string, months: number, anchorMonth: string): Promise<MonthlyTotal[]>
export function getCategoryBreakdown(userId: string, month: string): Promise<CategoryTotal[]>
export function getBiggestExpense(userId: string, month: string): Promise<BiggestExpense | null>

/** ⚠️ THE ONLY UNSCOPED READ IN THE APPLICATION — /s/[token] only. No userId, by design. */
export function getGroupByShareToken(token: string): Promise<SharedGroup | null>

// ── pure helper, exported for tests and client-side reuse ──
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; totalIdr: number }>,
  anchorMonth: string,
  months: number,
): MonthlyTotal[]
```

### Who consumes what

| Feature | Imports |
|---|---|
| **F02** Auth | `users`, `accounts`, `sessions`, `verificationTokens`, `db` |
| **F04** LLM | `ParsedExpense`, `ParsedItem`, `CATEGORIES`, `CATEGORY_META` (prompt hints), `parseIdrLoose` (fallback parser), `todayJakartaISO` |
| **F05** Add | `CreateExpenseInput`, `db`, `expenseGroups`, `expenseItems`, `newGroupId`, `newItemId`, `formatIdr`, `parseIdrLoose`, `CATEGORY_LIST`, `monthKey`, `todayJakartaISO` |
| **F06** Photos | `AttachPhotoInput`, `db`, `expensePhotos`, `newPhotoId`, `photoOwnedBy`, `assertGroupOwned`, `NotFoundError` |
| **F07** History | `getMonthGroups`, `getGroupDetail`, `itemOwnedBy`, `getOwnedGroupIdForItem`, `NotFoundError`, `UpdateItemInput`, `UpdateExpenseMetaInput`, `AddItemInput`, `formatIdr`, `monthLabel`, `dayLabel`, `addMonths`, `currentMonthKey`, `CATEGORY_LIST` |
| **F08** Stats | `getMonthlyTotals`, `getCategoryBreakdown`, `getBiggestExpense`, `formatIdrCompact`, `monthLabelShort`, `CATEGORY_META` (donut colours), `currentMonthKey` |
| **F09** Sharing | `getGroupByShareToken`, `shareLinks`, `shareLinkOwnedBy`, `assertGroupOwned`, `newShareToken`, `SharedGroup`, `formatIdr`, `dateLabel` |
| **F10** Design | `CATEGORY_META[*].color` — must define all 8 `--color-cat-*` tokens in `@theme` |

---

## Open questions for the integrator

1. **`lib/env.ts` vs `process.env`.** `lib/db/index.ts` reads `process.env.DATABASE_URL` directly with a loud throw,
   because F01 owns `lib/env.ts` and its export shape is not yet fixed. If F01 exports a validated `env` object,
   swap the two lines in `createDb()` to `env.DATABASE_URL` and delete the backstop throw. Same for
   `drizzle.config.ts`. **Decide before F02 lands.**

2. **"Biggest expense" — item or group?** `getBiggestExpense` currently returns the largest single **item**
   (`fan fries plaza blok m`, `Rp 58.850`), on the reading that a Rp 58.850 line item is a more interesting callout
   than "the day I spent Rp 266.350". If F08's design wants the largest **group**, it is a five-line change (swap
   the driving table for the `getMonthGroups` aggregate ordered by total, `LIMIT 1`) — but it changes the published
   `BiggestExpense` type, so it needs deciding **before F08 starts**.

3. **Does F02 pass tables to `DrizzleAdapter` explicitly?** This plan assumes yes (Contract delta 1). If F02
   prefers name-based auto-detection, the SQL table names may need to change, which is a migration. Confirm early.

4. **Neon branch for tests.** Task 19 needs a `TEST_DATABASE_URL` pointing at a throwaway Neon branch. Who creates
   it, and is it recreated per run or reused? The teardown assumes reuse is safe because it deletes its own users.

5. **Time-travel in tests.** `todayJakartaISO(now?)` takes an injectable clock rather than using `vi.setSystemTime`.
   If the project standardises on fake timers, the parameter becomes redundant — harmless, but worth knowing.

6. **Share-token collision retry.** `share_links.token` is the PK, so a collision is a unique violation on insert.
   F09 must catch Postgres `23505` and retry once. At 72 bits this is a formality, but "formality" is how you get an
   unhandled 500. Should F03 publish a `mintShareToken(groupId)` helper that owns the retry instead of leaving it to
   F09? *Recommendation: yes, but only once F09 is being written — writing a mutation helper here would break the
   "F03 ships no mutations" boundary.*

7. **Should `note` be nullable-or-empty?** `expense_groups.note` is `text NULL`. `UpdateExpenseMetaInput` allows
   `note: null` to clear it. Confirm F07's inline editor sends `null` rather than `''` — otherwise "cleared" notes
   read back as empty strings and the empty-state check has to test both.

8. **Retention of `raw_text`.** It is the user's original paste, stored indefinitely, and it is *not* exposed on the
   share page. If a "delete my data" story ever appears, `ON DELETE CASCADE` from `users` already covers it. No
   action now; noted so it is not a surprise later.
