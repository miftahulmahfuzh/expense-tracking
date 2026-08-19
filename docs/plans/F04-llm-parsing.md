# F04 — LLM Parsing Engine

> **Feature:** paste messy Indonesian free text → clean, editable `ParsedExpense`.
> **Depends on:** F01 (scaffold, `lib/env.ts`), F03 (`lib/categories.ts`, `lib/schema/expense.ts`, `lib/format.ts`), F02 (`requireUserId` — only for the route handler in Task 12).
> **Consumed by:** F05 (Add Expense Flow).
> **Model:** GLM-5.2 via z.ai's **Anthropic-compatible** endpoint.

This is the heart of the product. If the parser is wrong, every downstream feature is polishing a broken table. The single highest-value artifact in this document is **the system prompt in Task 7** — read it before writing any code.

---

## 0. Non-negotiable technical facts

Get these wrong and nothing works. They are stated once, here, and every task assumes them.

### 0.1 GLM-5.2 is NOT a Claude model

z.ai exposes an Anthropic-**compatible** endpoint at `https://api.z.ai/api/anthropic`. That means the *wire protocol* of `POST /v1/messages` is the same. It does **not** mean the model is Claude, and it does **not** mean Claude-only request parameters exist on the server.

**Allowed request surface — nothing else:**

```
model · max_tokens · system · messages · tools · tool_choice · stop_sequences (unused)
```

**Forbidden. Do not send these. They will 400 or be silently ignored, and silent-ignore is worse:**

| Parameter | Why not |
|---|---|
| `thinking` | Claude-only (adaptive/extended thinking). GLM has no such field. |
| `output_config` (incl. `effort`, `format`, `task_budget`) | Claude-only. **This is why we use tool use for structured output, not structured outputs.** |
| `speed` | Claude-only fast mode. |
| `betas` / `anthropic-beta` header | Claude-only beta gating. |
| `fallbacks` | Claude-only server-side refusal fallback. |
| `strict: true` on a tool | Claude structured-outputs feature. Portable Anthropic-compatible servers do not implement it. We validate with Zod instead. |
| `cache_control` | Not portable. See Open Question OQ-6. |
| `temperature` / `top_p` | Not forbidden by the server, but **do not set them** — we rely on the tool schema + prompt for determinism, and an unset default is the best-tested path. |

**Structured output comes from tool use with a single forced tool.** `tool_choice: { type: 'tool', name: 'record_expense' }`. This is the only mechanism that is portable across Anthropic-compatible servers.

### 0.2 Timeout budget (Vercel Hobby)

Vercel Hobby serverless functions have a **60-second ceiling**. `/api/parse` must therefore fit its entire lifecycle inside 60s including cold start, auth, and JSON serialisation. Our budget:

| Phase | Budget | Notes |
|---|---|---|
| Auth + body validation | < 200 ms | |
| Primary LLM call | **25 s** hard timeout | `maxRetries: 0` on the client — we own retry policy |
| Zod validate | < 5 ms | |
| Repair round-trip (only on validation failure) | **15 s** hard timeout, skipped if < 3 s of wall-clock deadline remains | |
| Deterministic fallback | < 5 ms | pure regex, no I/O |
| **Total worst case** | **~41 s** | leaves ~19 s of headroom under the 60 s ceiling |

`parseExpense` carries an internal wall-clock **deadline of 45 s** from entry. The route sets `export const maxDuration = 60`.

The Anthropic TS SDK's `timeout` is in **milliseconds** (unlike the Python SDK's seconds) and defaults to 10 minutes — which would blow the ceiling silently. It also defaults to `maxRetries: 2`, meaning worst-case wall clock is `timeout × (maxRetries + 1)`. **Both defaults must be overridden.**

### 0.3 Indonesian money notation — the 1000× bug

In Indonesian formatting `.` is a **thousands** separator and `,` is the **decimal** separator. `38.500` is thirty-eight thousand five hundred, **not** 38.5. An LLM primed on English formatting will produce `38.5` and every amount in the app is off by 1000×. The system prompt attacks this from four angles (explicit table, explicit rule, a magnitude sanity check, and a final-check list), and the fixture corpus + integration test exist primarily to catch a regression here.

---

## Contract deltas

Three additions to the shared contract in ROADMAP §3/§4. Nothing existing is changed.

1. **Test runner added to the pinned stack (§3).** The roadmap pins no test runner, and F04 is the first feature that is untestable without one. F04 adds:
   - `vitest@4.1.2` (dev)
   - `@vitest/coverage-v8@4.1.2` (dev)
   - npm scripts `test` (`vitest run`), `test:watch` (`vitest`), `test:live` (`LLM_LIVE_TEST=1 vitest run lib/llm/__tests__/parseExpense.live.test.ts`)

   Rationale: Vitest runs TypeScript + ESM natively with no Babel/Jest transform config, which matters because `lib/llm/*` is pure server-side TS with no JSX.

   ⚠️ **F03's plan makes the same delta.** Whichever feature lands first introduces it; the second must not re-install or write a second `vitest.config.ts`. See OQ-10.

2. **`server-only@0.0.1` added as a runtime dep (§3).** Used in `lib/llm/client.ts` so that any accidental client-component import of the LLM client is a **build-time** error rather than a leaked `LLM_API_KEY` in a browser bundle.

3. **`LLM_LIVE_TEST` env var (§4.8) — test-only, deliberately NOT in `lib/env.ts`.** §4.8 says missing vars are a loud crash. `LLM_LIVE_TEST` must therefore stay out of the Zod schema in `lib/env.ts`, because it is absent in production by design. It is read directly via `process.env.LLM_LIVE_TEST` inside the test file only.

No changes to §4.1 (categories), §4.2 (schema), §4.3 (`ParsedExpense`), §4.5 (route contract), or §4.7 (`parseIdrLoose`).

---

## Interfaces I publish

Everything below is what F05 may import. Nothing else in `lib/llm/` is public API.

### `lib/llm/parseExpense.ts`

```ts
import type { ParsedExpense } from '@/lib/schema/expense'

export interface ParseInput {
  /** The raw pasted text, verbatim. 1..8000 chars. */
  rawText: string
  /** Today in Asia/Jakarta, 'YYYY-MM-DD'. From todayJakartaISO(). */
  todayISO: string
}

/** Where the returned expense actually came from. */
export type ParseSource = 'llm' | 'llm_repair' | 'fallback'

export interface ParseResult {
  expense: ParsedExpense
  source: ParseSource
  /** true when source !== 'llm' — F05 should warn the user to double-check. */
  degraded: boolean
  /** Rough token usage of the primary + repair calls, for logging. null on fallback-only. */
  usage: { inputTokens: number; outputTokens: number } | null
}

/** The one function F05 needs. Never returns an invalid ParsedExpense. */
export function parseExpense(input: ParseInput): Promise<ParsedExpense>

/** Same work, but tells you whether the LLM actually succeeded. Used by the route. */
export function parseExpenseWithMeta(input: ParseInput): Promise<ParseResult>
```

### Error types F05 must handle

`parseExpense` **never** throws for an LLM problem — LLM problems degrade to the deterministic fallback. It throws only when there is genuinely nothing to return.

```ts
export type ParseFailureReason =
  | 'empty_input'      // rawText is blank after trim
  | 'input_too_long'   // > 8000 chars
  | 'no_items_found'   // neither LLM nor fallback found a single priced line

export class ParseError extends Error {
  readonly name = 'ParseError'
  readonly reason: ParseFailureReason
  /** Indonesian-flavoured copy, safe to render directly in the UI. */
  readonly userMessage: string
  constructor(reason: ParseFailureReason, userMessage: string, options?: { cause?: unknown })
}

/** Narrowing helper for F05. */
export function isParseError(e: unknown): e is ParseError
```

**F05's required handling:**

| Thrown / returned | F05 behaviour |
|---|---|
| `ParseError('empty_input')` | Keep the textarea focused, show `userMessage` inline. Do not clear the draft. |
| `ParseError('input_too_long')` | Show `userMessage` + character counter. Do not clear the draft. |
| `ParseError('no_items_found')` | Show `userMessage` **and open the manual-entry escape hatch** with one blank row pre-seeded. Keep `rawText` in the draft. |
| `ParseResult.degraded === true` | Render the review table normally, plus a dismissible banner: *"Kami cuma bisa merapikan sebagian. Cek lagi nama & kategorinya ya."* Every category will be `other`. |
| Any other exception | Should not happen. Treat as `no_items_found`. |

### `lib/llm/fallbackParse.ts`

```ts
/** Pure, synchronous, no I/O, no network. Returns null when zero items were found. */
export function fallbackParse(input: ParseInput): ParsedExpense | null
```

### `POST /api/parse` wire contract

Request body (Zod-validated): `{ rawText: string, todayISO: string }`

| Status | Body |
|---|---|
| 200 | `{ ok: true, expense: ParsedExpense, source: ParseSource, degraded: boolean }` |
| 400 | `{ ok: false, error: { code: 'bad_request' \| 'empty_input', message: string } }` |
| 401 | `{ ok: false, error: { code: 'unauthorized', message: string } }` |
| 413 | `{ ok: false, error: { code: 'input_too_long', message: string } }` |
| 422 | `{ ok: false, error: { code: 'no_items_found', message: string } }` |
| 429 | `{ ok: false, error: { code: 'rate_limited', message: string } }` |
| 500 | `{ ok: false, error: { code: 'server_error', message: string } }` |

`message` is always Indonesian-flavoured and safe to render verbatim.

---

## Task list

Every task is: write the test → watch it fail → write the code → watch it pass → commit.

---

### Task 0 — Branch, dependencies, directory skeleton

```bash
cd /home/miftah/expense-tracking
git checkout -b f04-llm-parsing

pnpm add @anthropic-ai/sdk@0.117.1 server-only@0.0.1
pnpm add -D vitest@4.1.2 @vitest/coverage-v8@4.1.2

mkdir -p lib/llm/__fixtures__ lib/llm/__tests__ app/api/parse
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:live": "LLM_LIVE_TEST=1 vitest run lib/llm/__tests__/parseExpense.live.test.ts"
  }
}
```

Create `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Confirm `.env.local` (from F01) has all three LLM vars:

```bash
grep -E '^LLM_(API_KEY|BASE_URL|MODEL)=' .env.local
```

Expected — three lines, e.g.:

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-5.2
```

> If `LLM_BASE_URL` is missing, set it to exactly `https://api.z.ai/api/anthropic` — **no trailing slash, no `/v1` suffix.** The SDK appends `/v1/messages` itself; a trailing `/v1` produces `/v1/v1/messages` and a 404 that looks like an auth failure.

Smoke-check the runner:

```bash
pnpm test
```

Expected: `No test files found` (exit 1 is fine at this point) — we just want to see Vitest boot.

```bash
git add -A && git commit -m "F04: scaffold llm module, add vitest + anthropic sdk"
```

---

### Task 1 — The fixture corpus

The corpus is the spine of this feature. Twelve realistic Indonesian pastes, each a plain `.txt` so it can be pasted into the app by hand for manual QA.

Create these files in `lib/llm/__fixtures__/`.

**`01-canonical.txt`** — the roadmap §1 example, byte-for-byte:

```
bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k
```

**`02-bills-only.txt`**

```
tagihan agustus - 5/8/2026
indihome 385000
token listrik 200k
pulsa xl 50rb
iuran sampah 25.000
bpjs mandiri 150k
```

**`03-apartment-ipl.txt`**

```
urusan apartemen 1/9/2026
sewa apartemen bulan september 4,5jt
IPL 3 bulan 1.350.000
service charge 275000
deposit galon 50k
```

**`04-messy-no-date-no-header.txt`** — no header line, no date anywhere:

```
nasi padang 32k
es teh manis 5000
parkir motor 3rb

gorengan 10k
kopi kenangan 18.000
```

**`05-mixed-units.txt`** — every notation in one paste:

```
campur aduk 12/8/2026
laptop bekas 4,5jt
headset 1.250.000
mouse 185k
mousepad 45rb
kabel usb 27500
tisu 12.000
permen 2000
```

**`06-with-total-line.txt`** — the total must NOT become an item:

```
jajan sore rabu - 20/8/2026
seblak 22k
cireng 10k
es cendol 12000
total 44000
```

**`07-indonesian-month.txt`**

```
belanja bulanan 18 Agustus 2026
beras 5kg 75.000
minyak goreng 2L 38rb
telur 1kg 32000
sabun cuci 24500
```

**`08-dayname-dash-date.txt`** — day name present, dash-separated date:

```
senin boros - 3-8-2026
grab ke kantor 27000
makan siang kantin 25k
kopi susu 22rb
grab pulang 31000
```

**`09-quantities-and-notes.txt`** — quantity lines, priceless notes, payment-method noise:

```
jumat malam 22/8/2026
2x nasi goreng 60k
sate ayam @25k x2 50000
bayar pake qris
es jeruk 8000
besok jangan jajan lagi
tip 5rb
```

**`10-rp-prefixed.txt`** — `Rp` prefix with dot separators, price-first line:

```
kamis - 21/8/2026
Rp 38.500 roti buaya
bensin motor Rp45.000
tol dalam kota Rp 12.500
parkir Rp5.000
```

**`11-single-line.txt`** — one item, no header, no date:

```
ayam geprek 25k
```

**`12-health-transport.txt`**

```
sakit lagi 9 Sep 2026
konsul dokter umum 150000
tebus obat apotek kimia farma 87.500
vitamin c 1000mg 65k
grab ke klinik 24rb
```

Now the typed index. Create `lib/llm/__fixtures__/index.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Category } from '@/lib/categories'

const DIR = __dirname

function load(file: string): string {
  return readFileSync(join(DIR, file), 'utf8')
}

export interface Fixture {
  id: string
  file: string
  rawText: string
  /** todayISO to hand the parser — deliberately different from the in-text date so
   *  a parser that ignores the text and echoes today is caught immediately. */
  todayISO: string
  /** Exact expectations. `null` on a field means "no strong expectation". */
  expect: {
    title: string | null
    occurredOn: string
    itemCount: number
    /** Ordered, exact. This is the 1000x-bug tripwire. */
    amounts: number[]
    total: number
    /** Per-item allowed categories. Empty array = anything goes. */
    categories: Category[][]
  }
}

const f = (
  id: string,
  file: string,
  todayISO: string,
  expect: Fixture['expect'],
): Fixture => ({ id, file, rawText: load(file), todayISO, expect })

export const FIXTURES: Fixture[] = [
  f('canonical', '01-canonical.txt', '2026-09-01', {
    title: 'bakar duit tuesday',
    occurredOn: '2026-08-18',
    itemCount: 6,
    amounts: [38500, 45000, 49000, 49000, 58850, 26000],
    total: 266350,
    categories: [
      ['food'],
      ['food'],
      // "perumahan laddaland" is a film title, but the literal word "perumahan"
      // means housing. See OQ-1. Accept either rather than encode a guess.
      ['entertainment', 'housing', 'other'],
      ['entertainment'],
      ['food'],
      ['food'],
    ],
  }),

  f('bills-only', '02-bills-only.txt', '2026-09-01', {
    title: 'tagihan agustus',
    occurredOn: '2026-08-05',
    itemCount: 5,
    amounts: [385000, 200000, 50000, 25000, 150000],
    total: 810000,
    categories: [['bills'], ['bills'], ['bills'], ['bills'], ['bills', 'health']],
  }),

  f('apartment-ipl', '03-apartment-ipl.txt', '2026-09-15', {
    title: 'urusan apartemen',
    occurredOn: '2026-09-01',
    itemCount: 4,
    amounts: [4500000, 1350000, 275000, 50000],
    total: 6175000,
    categories: [['housing'], ['bills', 'housing'], ['housing', 'bills'], []],
  }),

  f('messy', '04-messy-no-date-no-header.txt', '2026-08-19', {
    title: null, // synthesised — any non-empty string
    occurredOn: '2026-08-19', // falls back to todayISO
    itemCount: 5,
    amounts: [32000, 5000, 3000, 10000, 18000],
    total: 68000,
    categories: [['food'], ['food'], ['transport'], ['food'], ['food']],
  }),

  f('mixed-units', '05-mixed-units.txt', '2026-09-01', {
    title: 'campur aduk',
    occurredOn: '2026-08-12',
    itemCount: 7,
    amounts: [4500000, 1250000, 185000, 45000, 27500, 12000, 2000],
    total: 6021500,
    categories: [[], [], [], [], [], ['groceries', 'other'], ['food', 'groceries']],
  }),

  f('with-total', '06-with-total-line.txt', '2026-09-01', {
    title: 'jajan sore rabu',
    occurredOn: '2026-08-20',
    itemCount: 3, // the `total 44000` line must NOT be an item
    amounts: [22000, 10000, 12000],
    total: 44000,
    categories: [['food'], ['food'], ['food']],
  }),

  f('id-month', '07-indonesian-month.txt', '2026-09-01', {
    title: 'belanja bulanan',
    occurredOn: '2026-08-18',
    itemCount: 4,
    amounts: [75000, 38000, 32000, 24500],
    total: 169500,
    categories: [['groceries'], ['groceries'], ['groceries'], ['groceries']],
  }),

  f('dayname-dash', '08-dayname-dash-date.txt', '2026-09-01', {
    title: 'senin boros',
    occurredOn: '2026-08-03',
    itemCount: 4,
    amounts: [27000, 25000, 22000, 31000],
    total: 105000,
    categories: [['transport'], ['food'], ['food'], ['transport']],
  }),

  f('quantities', '09-quantities-and-notes.txt', '2026-09-01', {
    title: 'jumat malam',
    occurredOn: '2026-08-22',
    itemCount: 4, // "bayar pake qris" and "besok jangan jajan lagi" are dropped
    amounts: [60000, 50000, 8000, 5000],
    total: 123000,
    categories: [['food'], ['food'], ['food'], []],
  }),

  f('rp-prefixed', '10-rp-prefixed.txt', '2026-09-01', {
    title: 'kamis',
    occurredOn: '2026-08-21',
    itemCount: 4,
    amounts: [38500, 45000, 12500, 5000],
    total: 101000,
    categories: [['food'], ['transport'], ['transport'], ['transport']],
  }),

  f('single-line', '11-single-line.txt', '2026-08-19', {
    title: null,
    occurredOn: '2026-08-19',
    itemCount: 1,
    amounts: [25000],
    total: 25000,
    categories: [['food']],
  }),

  f('health', '12-health-transport.txt', '2026-10-01', {
    title: 'sakit lagi',
    occurredOn: '2026-09-09',
    itemCount: 4,
    amounts: [150000, 87500, 65000, 24000],
    total: 326500,
    categories: [['health'], ['health'], ['health'], ['transport']],
  }),
]

export const CANONICAL = FIXTURES[0]!

export function fixture(id: string): Fixture {
  const found = FIXTURES.find((x) => x.id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}
```

Self-check test — `lib/llm/__tests__/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FIXTURES } from '../__fixtures__'

describe('fixture corpus', () => {
  it('has at least 10 fixtures', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10)
  })

  it('every fixture is internally consistent', () => {
    for (const fx of FIXTURES) {
      expect(fx.rawText.trim(), fx.id).not.toBe('')
      expect(fx.expect.amounts.length, `${fx.id} amounts`).toBe(fx.expect.itemCount)
      expect(fx.expect.categories.length, `${fx.id} categories`).toBe(fx.expect.itemCount)
      expect(
        fx.expect.amounts.reduce((a, b) => a + b, 0),
        `${fx.id} total`,
      ).toBe(fx.expect.total)
      expect(fx.expect.occurredOn, `${fx.id} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const n of fx.expect.amounts) {
        expect(Number.isInteger(n), `${fx.id} integer`).toBe(true)
      }
    }
  })

  it('canonical fixture matches the roadmap total', () => {
    expect(FIXTURES[0]!.expect.total).toBe(266_350)
  })
})
```

```bash
pnpm vitest run lib/llm/__tests__/fixtures.test.ts
```

Expected: `3 passed`.

```bash
git add -A && git commit -m "F04: fixture corpus of 12 Indonesian expense pastes"
```

---

### Task 2 — Verify `parseIdrLoose` (F03 dependency gate)

`fallbackParse` is built directly on `parseIdrLoose` (ROADMAP §4.7). Before building on it, prove it behaves. Write `lib/llm/__tests__/parseIdrLoose.contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseIdrLoose } from '@/lib/format'

describe('parseIdrLoose — F04 relies on exactly this behaviour', () => {
  const cases: Array<[string, number | null]> = [
    ['38500', 38500],
    ['38.500', 38500],          // DOT = thousands. Not 38.5.
    ['Rp 38.500', 38500],
    ['Rp38.500', 38500],
    ['rp 38.500', 38500],
    ['IDR 38.500', 38500],
    ['45k', 45000],
    ['45K', 45000],
    ['45 k', 45000],
    ['45rb', 45000],
    ['45 rb', 45000],
    ['45RB', 45000],
    ['45ribu', 45000],
    ['1jt', 1_000_000],
    ['1,5jt', 1_500_000],
    ['1.5jt', 1_500_000],       // sloppy dot-as-decimal in a jt context
    ['4,5jt', 4_500_000],
    ['2 juta', 2_000_000],
    ['1.234.567', 1_234_567],
    ['58.850', 58850],
    ['2000', 2000],
    ['0', 0],
    ['', null],
    ['abc', null],
    ['-', null],
  ]

  for (const [input, want] of cases) {
    it(`${JSON.stringify(input)} -> ${want}`, () => {
      expect(parseIdrLoose(input)).toBe(want)
    })
  }
})
```

```bash
pnpm vitest run lib/llm/__tests__/parseIdrLoose.contract.test.ts
```

**Two possible outcomes:**

- **All pass** → F03 shipped `parseIdrLoose` correctly. Commit and move on.
- **Import fails or cases fail** → see OQ-2. Do **not** write a second copy of the function inside `lib/llm/`. Either fix `lib/format.ts` in place (it is the roadmap-designated owner) or, if F03 has not landed at all, create `lib/format.ts` with `parseIdrLoose` + `formatIdr` + `TZ` + `todayJakartaISO` + `monthKey` and hand it back to F03. Keep this test file where it is regardless — it is F04's tripwire against a later F03 refactor.

```bash
git add -A && git commit -m "F04: pin parseIdrLoose contract with a dependency-gate test"
```

---

### Task 3 — `fallbackParse` — tests first

The fallback exists so that **the user is never hard-blocked by an LLM failure.** It is deliberately dumb: line-by-line, trailing amount via `parseIdrLoose`, name is the rest, category is always `other`. It produces something *editable*, not something *correct*.

Write `lib/llm/__tests__/fallbackParse.test.ts` **before** the implementation:

```ts
import { describe, it, expect } from 'vitest'
import { fallbackParse } from '../fallbackParse'
import { ParsedExpense } from '@/lib/schema/expense'
import { FIXTURES, fixture } from '../__fixtures__'

const run = (rawText: string, todayISO = '2026-08-19') =>
  fallbackParse({ rawText, todayISO })

describe('fallbackParse — always returns something Zod-valid or null', () => {
  it('every fixture yields a Zod-valid ParsedExpense', () => {
    for (const fx of FIXTURES) {
      const out = fallbackParse({ rawText: fx.rawText, todayISO: fx.todayISO })
      expect(out, fx.id).not.toBeNull()
      expect(() => ParsedExpense.parse(out), fx.id).not.toThrow()
    }
  })

  it('returns null when nothing is parseable', () => {
    expect(run('')).toBeNull()
    expect(run('   \n\n  ')).toBeNull()
    expect(run('besok jangan jajan lagi\ncatatan: hemat')).toBeNull()
  })
})

describe('fallbackParse — amounts', () => {
  it('extracts the trailing amount and never divides by 1000', () => {
    const out = run('roti buaya 38500\nayam sambal hitam 45k\ntisu 12.000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([38500, 45000, 12000])
  })

  it('handles Rp-prefixed and price-first lines', () => {
    const out = run('Rp 38.500 roti buaya\nbensin motor Rp45.000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([38500, 45000])
    expect(out.items.map((i) => i.name)).toEqual(['roti buaya', 'bensin motor'])
  })

  it('does NOT multiply a quantity prefix by the trailing total', () => {
    const out = run('2x nasi goreng 60k')!
    expect(out.items[0]!.amount_idr).toBe(60000)
    expect(out.items[0]!.name).toBe('2x nasi goreng')
  })

  it('gets every canonical amount exactly right', () => {
    const fx = fixture('canonical')
    const out = fallbackParse({ rawText: fx.rawText, todayISO: fx.todayISO })!
    expect(out.items.map((i) => i.amount_idr)).toEqual(fx.expect.amounts)
  })
})

describe('fallbackParse — skipping', () => {
  it('drops total / subtotal / jumlah lines', () => {
    for (const line of [
      'total 44000',
      'totalnya 44.000',
      'Total: Rp 44.000',
      'subtotal 44000',
      'sub total 44000',
      'grand total 44000',
      'jumlah 44.000',
      'semua 44rb',
      '= 44.000',
    ]) {
      const out = run(`seblak 22k\ncireng 10k\n${line}`)!
      expect(out.items.length, line).toBe(2)
    }
  })

  it('drops priceless lines rather than emitting amount 0', () => {
    const out = run('seblak 22k\nbayar pake qris\nbesok hemat\nes teh 5000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([22000, 5000])
    expect(out.items.some((i) => i.amount_idr === 0)).toBe(false)
  })

  it('drops blank lines', () => {
    const out = run('nasi padang 32k\n\n\ngorengan 10k')!
    expect(out.items.length).toBe(2)
  })

  it('caps at 50 items', () => {
    const many = Array.from({ length: 80 }, (_, i) => `item ${i} 1000`).join('\n')
    expect(run(many)!.items.length).toBe(50)
  })
})

describe('fallbackParse — dates', () => {
  it('reads DD/MM/YYYY as Indonesian, not US', () => {
    expect(run('header - 18/8/2026\nkopi 20k')!.occurred_on).toBe('2026-08-18')
    // 12/8 would be ambiguous under US reading; Indonesian reading must win.
    expect(run('header - 12/8/2026\nkopi 20k')!.occurred_on).toBe('2026-08-12')
  })

  it('handles dash and dot separators', () => {
    expect(run('senin - 3-8-2026\nkopi 20k')!.occurred_on).toBe('2026-08-03')
    expect(run('senin - 3.8.2026\nkopi 20k')!.occurred_on).toBe('2026-08-03')
  })

  it('handles two-digit years', () => {
    expect(run('x - 18/8/26\nkopi 20k')!.occurred_on).toBe('2026-08-18')
  })

  it('handles Indonesian and English month names', () => {
    expect(run('belanja 18 Agustus 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 18 Ags 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 18 Aug 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 9 Sep 2026\nberas 75.000')!.occurred_on).toBe('2026-09-09')
  })

  it('falls back to todayISO when there is no date', () => {
    expect(run('nasi padang 32k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('ignores day names as dates', () => {
    expect(run('senin boros\nkopi 20k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('rejects impossible dates and falls back', () => {
    expect(run('x - 45/99/2026\nkopi 20k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('is not fooled by a large dotted amount', () => {
    expect(run('laptop 1.234.567', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })
})

describe('fallbackParse — title', () => {
  it('strips the date off the header line', () => {
    expect(run('bakar duit tuesday - 18/8/2026\nkopi 20k')!.title)
      .toBe('bakar duit tuesday')
    expect(run('belanja bulanan 18 Agustus 2026\nberas 75.000')!.title)
      .toBe('belanja bulanan')
    expect(run('18/8/2026 jajan sore\nkopi 20k')!.title).toBe('jajan sore')
  })

  it('keeps the day name in the title', () => {
    expect(run('senin boros - 3-8-2026\nkopi 20k')!.title).toBe('senin boros')
  })

  it('synthesises a title when there is no header', () => {
    const out = run('nasi padang 32k\nes teh 5000', '2026-08-19')!
    expect(out.title).toBe('pengeluaran 2026-08-19')
  })

  it('synthesises when the header is only a date', () => {
    const out = run('18/8/2026\nkopi 20k')!
    expect(out.title).toBe('pengeluaran 2026-08-18')
  })

  it('truncates a very long title to 120 chars', () => {
    const long = 'a'.repeat(300)
    expect(run(`${long}\nkopi 20k`)!.title.length).toBeLessThanOrEqual(120)
  })
})

describe('fallbackParse — names and categories', () => {
  it('categorises everything as other — it does not guess', () => {
    const out = run('ayam geprek 25k\nbensin 50k')!
    expect(out.items.every((i) => i.category === 'other')).toBe(true)
  })

  it('keeps the user wording verbatim, minus the price and separators', () => {
    const out = run('pak gembus - 26k\nfan fries plaza blok m 58850')!
    expect(out.items.map((i) => i.name)).toEqual([
      'pak gembus',
      'fan fries plaza blok m',
    ])
  })

  it('names an anonymous priced line "lainnya"', () => {
    expect(run('kopi 20k\n15000')!.items[1]!.name).toBe('lainnya')
  })

  it('truncates names to 120 chars', () => {
    const out = run(`${'x'.repeat(300)} 25k`)!
    expect(out.items[0]!.name.length).toBeLessThanOrEqual(120)
  })

  it('preserves item order', () => {
    const out = run('a 1000\nb 2000\nc 3000')!
    expect(out.items.map((i) => i.name)).toEqual(['a', 'b', 'c'])
  })
})
```

```bash
pnpm vitest run lib/llm/__tests__/fallbackParse.test.ts
```

Expected: **all fail** — `Cannot find module '../fallbackParse'`. Good.

```bash
git add -A && git commit -m "F04: failing tests for fallbackParse"
```

---

### Task 4 — `fallbackParse` — implementation

Create `lib/llm/fallbackParse.ts`:

```ts
import { parseIdrLoose } from '@/lib/format'
import type { ParsedExpense, ParsedItem } from '@/lib/schema/expense'
import type { ParseInput } from './types'

const MAX_ITEMS = 50
const MAX_NAME = 120
const MAX_TITLE = 120

/** Lines that are a sum of other lines, not a purchase. */
const TOTAL_RE =
  /^\s*(?:=\s*)?(?:total(?:nya)?|sub\s*-?\s*total|grand\s*total|jumlah(?:nya)?|semua(?:nya)?|sum|all)\b/i

/** A bare `= 266.350` line. */
const BARE_EQUALS_RE = /^\s*=\s*[\d.,]/

/** Amount at the end of the line. */
const TAIL_AMOUNT_RE =
  /(?:rp\.?\s*|idr\s*)?(\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?)\s*[.,;:!]?\s*$/i

/** Amount at the start of the line (`Rp 38.500 roti buaya`). */
const LEAD_AMOUNT_RE =
  /^\s*(?:rp\.?\s*|idr\s*)(\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?)\s*[-–—:,]?\s*(.*)$/i

/** DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, with 2- or 4-digit year. */
const NUMERIC_DATE_RE = /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b/

/** `18 Agustus 2026`, `18 Ags 2026`, `9 Sep 2026`. */
const NAMED_DATE_RE = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, pebruari: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function toISO(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const y = year < 100 ? 2000 + year : year
  if (y < 2000 || y > 2100) return null
  // Reject 31 Feb etc. by round-tripping through UTC.
  const d = new Date(Date.UTC(y, month - 1, day))
  if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null
  return `${y}-${pad(month)}-${pad(day)}`
}

interface FoundDate {
  iso: string
  /** The exact substring matched, so it can be stripped from the title. */
  raw: string
}

function findDate(lines: string[]): FoundDate | null {
  for (const line of lines) {
    const n = NUMERIC_DATE_RE.exec(line)
    if (n) {
      const iso = toISO(Number(n[1]), Number(n[2]), Number(n[3]))
      if (iso) return { iso, raw: n[0] }
    }
    const m = NAMED_DATE_RE.exec(line)
    if (m) {
      const month = MONTHS[m[2]!.toLowerCase()]
      if (month) {
        const iso = toISO(Number(m[1]), month, Number(m[3]))
        if (iso) return { iso, raw: m[0] }
      }
    }
  }
  return null
}

function trimEdges(s: string): string {
  return s.replace(/^[\s\-–—:,;|.]+/, '').replace(/[\s\-–—:,;|.]+$/, '').trim()
}

interface Extracted {
  name: string
  amount: number
}

function extractLine(line: string): Extracted | null {
  // Price-first form takes priority — it is unambiguous because of the Rp prefix.
  const lead = LEAD_AMOUNT_RE.exec(line)
  if (lead) {
    const amount = parseIdrLoose(lead[1]!)
    const rest = trimEdges(lead[2] ?? '')
    if (amount !== null && rest !== '') return { name: rest, amount }
  }

  const tail = TAIL_AMOUNT_RE.exec(line)
  if (!tail) return null
  const amount = parseIdrLoose(tail[1]!)
  if (amount === null) return null

  const name = trimEdges(line.slice(0, tail.index))
  return { name: name === '' ? 'lainnya' : name, amount }
}

export function fallbackParse(input: ParseInput): ParsedExpense | null {
  const lines = input.rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')

  if (lines.length === 0) return null

  const date = findDate(lines)
  const occurredOn = date?.iso ?? input.todayISO

  // The header is the first line only, and only if it carries no price.
  let bodyStart = 0
  let title = ''
  const first = lines[0]!
  if (extractLine(first) === null) {
    bodyStart = 1
    const withoutDate = date ? first.replace(date.raw, ' ') : first
    title = trimEdges(withoutDate).slice(0, MAX_TITLE)
  }
  if (title === '') title = `pengeluaran ${occurredOn}`

  const items: ParsedItem[] = []
  for (const line of lines.slice(bodyStart)) {
    if (items.length >= MAX_ITEMS) break
    if (TOTAL_RE.test(line) || BARE_EQUALS_RE.test(line)) continue

    const got = extractLine(line)
    if (got === null) continue // no price -> skip; never emit amount 0

    items.push({
      name: got.name.slice(0, MAX_NAME),
      amount_idr: got.amount,
      category: 'other',
    })
  }

  if (items.length === 0) return null

  return { title, occurred_on: occurredOn, items }
}
```

You also need `lib/llm/types.ts` (shared, no imports from the SDK so it is safe anywhere):

```ts
import type { ParsedExpense } from '@/lib/schema/expense'

export interface ParseInput {
  rawText: string
  todayISO: string
}

export type ParseSource = 'llm' | 'llm_repair' | 'fallback'

export interface ParseResult {
  expense: ParsedExpense
  source: ParseSource
  degraded: boolean
  usage: { inputTokens: number; outputTokens: number } | null
}

export type ParseFailureReason = 'empty_input' | 'input_too_long' | 'no_items_found'

export class ParseError extends Error {
  readonly name = 'ParseError'
  readonly reason: ParseFailureReason
  readonly userMessage: string

  constructor(
    reason: ParseFailureReason,
    userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(`${reason}: ${userMessage}`, options)
    this.reason = reason
    this.userMessage = userMessage
  }
}

export function isParseError(e: unknown): e is ParseError {
  return e instanceof ParseError
}

export const MAX_RAW_TEXT_CHARS = 8000
```

```bash
pnpm vitest run lib/llm/__tests__/fallbackParse.test.ts
```

Expected: all green. If the `TAIL_AMOUNT_RE` grabs a trailing year (`… 2026`) as an amount on a header line, that is *correct* behaviour to fix — a header like `belanja 18 Agustus 2026` must not parse as an item. It doesn't, because `extractLine` on the header returns non-null (`2026`), which means `bodyStart` stays 0 and the header becomes an item. **Verify this specific case:**

```bash
pnpm vitest run lib/llm/__tests__/fallbackParse.test.ts -t 'Indonesian and English month names'
```

If it fails, add a guard in `fallbackParse` before the header check:

```ts
const firstIsHeader =
  extractLine(first) === null ||
  // A line whose only "amount" is the date we already matched is a header.
  (date !== null && first.includes(date.raw) && trimEdges(first.replace(date.raw, ' ')) !== '')
```

and use `firstIsHeader` instead of `extractLine(first) === null`. Re-run until green.

```bash
pnpm vitest run lib/llm/__tests__/
git add -A && git commit -m "F04: deterministic regex fallback parser"
```

---

### Task 5 — Zod contract tests

Prove the boundary type behaves as F04 assumes. `lib/llm/__tests__/contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ParsedExpense, ParsedItem } from '@/lib/schema/expense'
import { CATEGORIES } from '@/lib/categories'

const ok = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [{ name: 'roti buaya', amount_idr: 38500, category: 'food' }],
}

describe('ParsedExpense contract', () => {
  it('accepts a well-formed expense', () => {
    expect(ParsedExpense.parse(ok)).toEqual(ok)
  })

  it('trims the title and rejects a blank one', () => {
    expect(ParsedExpense.parse({ ...ok, title: '  hi  ' }).title).toBe('hi')
    expect(() => ParsedExpense.parse({ ...ok, title: '   ' })).toThrow()
    expect(() => ParsedExpense.parse({ ...ok, title: 'x'.repeat(121) })).toThrow()
  })

  it('enforces the YYYY-MM-DD shape', () => {
    for (const bad of ['18/8/2026', '2026-8-18', '20260818', '2026-08-18T00:00:00Z', '']) {
      expect(() => ParsedExpense.parse({ ...ok, occurred_on: bad }), bad).toThrow()
    }
  })

  it('requires 1..50 items', () => {
    expect(() => ParsedExpense.parse({ ...ok, items: [] })).toThrow()
    const many = Array.from({ length: 51 }, () => ok.items[0])
    expect(() => ParsedExpense.parse({ ...ok, items: many })).toThrow()
  })
})

describe('ParsedItem contract', () => {
  const item = ok.items[0]!

  it('rejects a string amount — the LLM must send a number', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: '38500' })).toThrow()
    expect(() => ParsedItem.parse({ ...item, amount_idr: '38.500' })).toThrow()
  })

  it('rejects a non-integer amount', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: 38.5 })).toThrow()
    expect(() => ParsedItem.parse({ ...item, amount_idr: 38500.01 })).toThrow()
  })

  it('rejects a negative amount and accepts zero', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: -1 })).toThrow()
    expect(ParsedItem.parse({ ...item, amount_idr: 0 }).amount_idr).toBe(0)
  })

  it('caps at 1_000_000_000', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: 1_000_000_001 })).toThrow()
  })

  it('accepts exactly the eight categories and nothing else', () => {
    for (const c of CATEGORIES) {
      expect(ParsedItem.parse({ ...item, category: c }).category).toBe(c)
    }
    expect(CATEGORIES.length).toBe(8)
    for (const bad of ['Food', 'FOOD', 'makanan', 'travel', '', null]) {
      expect(() => ParsedItem.parse({ ...item, category: bad }), String(bad)).toThrow()
    }
  })

  it('rejects a blank or overlong name', () => {
    expect(() => ParsedItem.parse({ ...item, name: '   ' })).toThrow()
    expect(() => ParsedItem.parse({ ...item, name: 'x'.repeat(121) })).toThrow()
  })
})
```

```bash
pnpm vitest run lib/llm/__tests__/contract.test.ts
git add -A && git commit -m "F04: Zod contract tests for ParsedExpense/ParsedItem"
```

---

### Task 6 — `lib/llm/client.ts`

Create `lib/llm/client.ts`:

```ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

/**
 * GLM-5.2 via z.ai's Anthropic-compatible endpoint.
 *
 * IMPORTANT — GLM-5.2 is NOT a Claude model. Only the plain Messages API surface
 * is available: model, max_tokens, system, messages, tools, tool_choice.
 * Never send thinking / output_config / effort / speed / betas / fallbacks /
 * strict / cache_control. See docs/plans/F04-llm-parsing.md §0.1.
 *
 * Timeouts: the SDK default is 10 minutes with 2 retries, i.e. a 30-minute
 * worst case. That blows Vercel Hobby's 60s ceiling. We set a 25s default and
 * maxRetries: 0 so that retry policy lives in parseExpense, where it can respect
 * a wall-clock deadline.
 */

declare global {
  // eslint-disable-next-line no-var
  var __llmClient: Anthropic | undefined
}

function build(): Anthropic {
  return new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
    timeout: 25_000, // milliseconds — the TS SDK is ms, not seconds
    maxRetries: 0,
  })
}

// Singleton across hot reloads in dev, and across warm serverless invocations.
export const llm: Anthropic = globalThis.__llmClient ?? build()
if (process.env.NODE_ENV !== 'production') globalThis.__llmClient = llm

export const LLM_MODEL = env.LLM_MODEL

/**
 * The narrow slice of the SDK that parseExpense actually uses.
 * Declaring it lets tests inject a fake without mocking the module graph.
 */
export interface LlmClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}
```

Quick manual smoke test (this DOES hit the network — one cheap call):

```bash
cat > /tmp/llm-smoke.mjs <<'EOF'
import Anthropic from '@anthropic-ai/sdk'
const c = new Anthropic({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
  timeout: 25_000,
  maxRetries: 0,
})
const r = await c.messages.create({
  model: process.env.LLM_MODEL,
  max_tokens: 32,
  messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
})
console.log(JSON.stringify({ model: r.model, stop: r.stop_reason, content: r.content, usage: r.usage }, null, 2))
EOF
set -a && source .env.local && set +a && node /tmp/llm-smoke.mjs
```

Expected: JSON with `"stop_reason": "end_turn"` and a text block containing `OK`. Note the exact `model` string echoed back — if it differs from `LLM_MODEL`, the server is aliasing; record that in your notes.

**If this fails:**

| Symptom | Cause |
|---|---|
| 404 on `/v1/v1/messages` | `LLM_BASE_URL` has a trailing `/v1`. Drop it. |
| 401 | Key wrong, or key sent to the wrong base URL. |
| `APIConnectionTimeoutError` after 25 s | Network/egress. Retry; check the endpoint is reachable from your machine. |
| 400 mentioning an unknown field | You added a Claude-only parameter. Remove it. |

```bash
rm /tmp/llm-smoke.mjs
git add -A && git commit -m "F04: configured Anthropic-compatible client for GLM-5.2"
```

---

### Task 7 — The tool definition and the system prompt

This is the artifact that determines whether the product works.

Create `lib/llm/prompt.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES } from '@/lib/categories'

export const TOOL_NAME = 'record_expense'

/**
 * input_schema mirrors ParsedExpense (ROADMAP §4.3) exactly:
 *   { title, occurred_on, items: [{ name, amount_idr, category }] }
 *
 * NOTE: no `strict: true`. That is a Claude structured-outputs feature and is
 * not portable to Anthropic-compatible servers. Zod is the enforcement layer.
 */
export const RECORD_EXPENSE_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Record the structured expense group extracted from the user’s pasted text. ' +
    'Call this exactly once. Never reply with prose.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'occurred_on', 'items'],
    properties: {
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 120,
        description:
          'Short label for the whole group, in the user’s own words. Usually the header ' +
          'line with the date removed, e.g. "bakar duit tuesday". If there is no header ' +
          'line, invent a short Indonesian label describing the items.',
      },
      occurred_on: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description:
          'The day the money was spent, as YYYY-MM-DD. Indonesian dates are DD/MM/YYYY, ' +
          'so 18/8/2026 is 2026-08-18. If the text contains no date, use TODAY from the ' +
          'system prompt.',
      },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        description: 'One entry per purchased line, in the order they appear in the text.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'amount_idr', 'category'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 120,
              description:
                'What was bought, in the user’s original wording with the price removed. ' +
                'Do not translate, expand, capitalise, or correct typos.',
            },
            amount_idr: {
              type: 'integer',
              minimum: 0,
              maximum: 1000000000,
              description:
                'Whole rupiah, as a JSON integer. No quotes, no decimal point, no dots, ' +
                'no commas, no "Rp". 45k is 45000. Rp 38.500 is 38500.',
            },
            category: {
              type: 'string',
              enum: [...CATEGORIES],
              description: 'Exactly one of the eight allowed category slugs.',
            },
          },
        },
      },
    },
  },
}

/** Built per-request because TODAY changes. Everything else is constant. */
export function buildSystemPrompt(todayISO: string): string {
  return SYSTEM_PROMPT_TEMPLATE.replace('{{TODAY}}', todayISO)
}

const SYSTEM_PROMPT_TEMPLATE = `You are a strict data-extraction engine for a personal expense tracker used in Indonesia.

Your only job: read one block of messy free text that the user pasted, and call the \`record_expense\` tool exactly once with the structured result.

Never reply with prose. Never ask a question. Never call the tool more than once. Never refuse — if the text is chaotic, extract whatever you can and call the tool anyway.

## OUTPUT CONTRACT

- \`amount_idr\` is ALWAYS a whole-rupiah JSON integer. Never a string. Never a decimal. Never with separators.
  Correct: 45000    Wrong: "45000", 45.000, "Rp 45.000", 45000.0, 45.0
- \`occurred_on\` is ALWAYS \`YYYY-MM-DD\`.
- \`category\` is ALWAYS exactly one of: food, groceries, transport, bills, housing, entertainment, health, other. Lowercase. No other value exists.
- Between 1 and 50 items. \`name\` and \`title\` are at most 120 characters.
- Items appear in the same order as in the text.

## MONEY — THIS IS THE PART YOU MUST NOT GET WRONG

Indonesian number formatting is the OPPOSITE of English:
- \`.\` (dot) is the THOUSANDS separator
- \`,\` (comma) is the DECIMAL separator

So \`38.500\` is thirty-eight thousand five hundred → \`38500\`. It is NOT 38.5.
And \`1,5\` means one and a half.

Conversion table — memorise it:

| written in the text | means | amount_idr |
|---|---|---|
| \`38500\` | 38.500 rupiah | 38500 |
| \`38.500\` | 38.500 rupiah | 38500 |
| \`Rp 38.500\` / \`Rp38.500\` / \`rp 38.500\` / \`IDR 38.500\` | 38.500 rupiah | 38500 |
| \`58.850\` | | 58850 |
| \`1.234.567\` | | 1234567 |
| \`45k\` / \`45K\` / \`45 k\` | 45 ribu | 45000 |
| \`45rb\` / \`45 rb\` / \`45RB\` / \`45ribu\` | 45 ribu | 45000 |
| \`200k\` | 200 ribu | 200000 |
| \`1jt\` / \`1 jt\` / \`1 juta\` | 1 juta | 1000000 |
| \`1,5jt\` | 1,5 juta | 1500000 |
| \`1.5jt\` | user typed a dot as the decimal — still 1,5 juta | 1500000 |
| \`4,5jt\` | | 4500000 |
| \`38.500,00\` | comma with two digits = cents | 38500 |

How to decide, in order:
1. Strip \`Rp\`, \`rp\`, \`IDR\`, and all whitespace.
2. If a \`k\` / \`rb\` / \`ribu\` suffix is present → take the number before it and multiply by 1000.
3. If a \`jt\` / \`juta\` suffix is present → multiply by 1000000. If that number contains \`,\` or \`.\`, treat that mark as a decimal point (\`1,5jt\` and \`1.5jt\` are both 1500000).
4. If there is NO suffix: every \`.\` is a thousands separator. Delete all the dots and read the remaining digits. \`38.500\` → 38500. Never divide.
5. If there is no suffix and a \`,\` is followed by exactly two digits, that is cents — drop the comma and the two digits.
6. A bare number with no separators is already in rupiah: \`38500\` → 38500, \`2000\` → 2000.

SANITY CHECK every amount before you emit it. A normal Indonesian personal expense line is between Rp 1.000 and Rp 5.000.000. If you are about to emit 38.5, 45, 1.5, or 58.85, you divided when you should not have. Redo that amount.

## DATE

Indonesian dates are DAY / MONTH / YEAR. Never month/day.
- \`18/8/2026\` → \`2026-08-18\`
- \`18-8-2026\` → \`2026-08-18\`
- \`18.8.2026\` → \`2026-08-18\`
- \`18/08/2026\` → \`2026-08-18\`
- \`12/8/2026\` → \`2026-08-12\` (NOT December 8)
- \`3-8-2026\` → \`2026-08-03\`
- Two-digit year: \`18/8/26\` → \`2026-08-18\` (assume 20xx)
- Day and month only, no year: \`18/8\` → use the year from TODAY below

Written month names.
Indonesian: januari, februari, maret, april, mei, juni, juli, agustus, september, oktober, november, desember.
Indonesian abbreviations: jan, feb, mar, apr, mei, jun, jul, agu, ags, agt, sep, sept, okt, nov, des.
English: january…december and jan…dec.
- \`18 Agustus 2026\` → \`2026-08-18\`
- \`18 Ags 2026\` → \`2026-08-18\`
- \`18 Aug 2026\` → \`2026-08-18\`
- \`9 Sep 2026\` → \`2026-09-09\`

Day names carry NO date information.
Indonesian: senin, selasa, rabu, kamis, jumat, jum'at, sabtu, minggu, ahad. Also: kemarin, hari ini, tadi, td, semalam.
English: monday … sunday, today, yesterday.
- If a day name appears together with a numeric or written date, the date wins. Ignore the day name for \`occurred_on\`.
- If a day name appears with NO date at all, use TODAY. Do NOT try to compute "last Tuesday" or "yesterday" — you will get it wrong.
- Do NOT remove the day name from the title. \`bakar duit tuesday\` keeps its \`tuesday\`.

If there is NO date anywhere in the text, use exactly the TODAY value given at the bottom of this prompt.

## TITLE

1. If the first non-blank line carries no price, it is the header line. The title is that header line with the date removed and any leftover separator (\`-\`, \`–\`, \`,\`, \`|\`, \`:\`) and whitespace trimmed.
   - \`bakar duit tuesday - 18/8/2026\` → \`bakar duit tuesday\`
   - \`belanja bulanan 18 Agustus 2026\` → \`belanja bulanan\`
   - \`18/8/2026 jajan sore\` → \`jajan sore\`
   - \`senin boros - 3-8-2026\` → \`senin boros\`
2. Keep the user's exact words and casing. Do not capitalise, do not translate, do not fix slang or typos.
3. If there is no header line, or the header line is nothing but a date, invent a short Indonesian title of 2–5 lowercase words describing the items:
   - all bills → \`tagihan bulanan\`
   - mostly food → \`jajan\` or \`makan siang\`
   - groceries → \`belanja harian\`
   - mixed → \`pengeluaran harian\`

## LINES

Work through the text line by line, after the header line.

SKIP these entirely — they are not purchases:
- blank lines
- a line that is only a date
- TOTAL / SUBTOTAL lines. These are the sum of the other lines. Emitting one as an item double-counts the whole group.
  Examples: \`total 266350\`, \`totalnya 266.350\`, \`Total: Rp 266.350\`, \`subtotal 44000\`, \`sub total 44000\`, \`grand total 44000\`, \`jumlah 44.000\`, \`semua 44rb\`, \`= 266.350\`, \`sum 44000\`
- notes and commentary with no price: \`besok jangan jajan lagi\`, \`catatan: hemat\`, \`boros banget hari ini\`, \`gaji tanggal 25\`
- payment-method noise with no price: \`bayar pake bca\`, \`qris\`, \`cash\`, \`transfer\`, \`pake gopay\`

LINES WITH A PRICE:
- The amount is normally the LAST number on the line; everything before it is the name.
  \`roti buaya 38500\` → name \`roti buaya\`, amount 38500
  \`fan fries plaza blok m 58850\` → name \`fan fries plaza blok m\`, amount 58850
- The price may come FIRST, especially with an \`Rp\` prefix.
  \`Rp 38.500 roti buaya\` → name \`roti buaya\`, amount 38500
  \`bensin motor Rp45.000\` → name \`bensin motor\`, amount 45000
- Trim leftover separators from the name.
  \`pak gembus - 26k\` → name \`pak gembus\`, amount 26000
- QUANTITY LINES. When a quantity prefix and a single trailing amount appear, that trailing amount is the TOTAL ALREADY PAID for the line. DO NOT multiply it by the quantity. Keep the quantity in the name so the user can see it.
  \`2x nasi goreng 60k\` → name \`2x nasi goreng\`, amount 60000  (NOT 120000)
  \`3 gorengan 6000\` → name \`3 gorengan\`, amount 6000
- The ONLY exception is an explicit unit-price marker (\`@\`) with no total written. Then multiply.
  \`sate ayam @25k x2 50000\` → name \`sate ayam @25k x2\`, amount 50000  (the total 50000 is written — use it)
  \`sate ayam @25k x2\` → name \`sate ayam @25k x2\`, amount 50000  (no total written — compute 25000 × 2)
- A priced line with no name at all → name it \`lainnya\`.

LINES WITH NO PRICE AT ALL: skip them. Do NOT emit an item with amount 0. The user's original paste is stored separately for audit, so nothing is lost, and a zero-rupiah row is noise in the review table.

NAMES: keep the user's original wording. Do not translate to English, do not expand abbreviations, do not fix typos, do not capitalise. \`pak gembus\` stays \`pak gembus\`. Strip only the price, the currency symbol, and leading/trailing punctuation.

## CATEGORIES

Assign the best of the eight. When genuinely unsure, use \`other\` — the user can retag with one tap, and a confidently wrong guess is worse than \`other\`.

**food** — Makan & Jajan. Warung, restoran, kopi, snack, delivery.
pak gembus · ayam sambal hitam · roti buaya · fan fries plaza blok m · nasi padang · nasi goreng · mie ayam · bakso · sate ayam · seblak · cireng · gorengan · martabak · dimsum · ayam geprek · kopi kenangan · es teh manis · es jeruk · es cendol · boba · gofood ayam geprek · makan siang kantin · kopi susu

**groceries** — Belanja Harian. Minimarket, supermarket, bahan masak, kebutuhan rumah tangga.
jajanan indomaret · indomaret · alfamart · superindo · hypermart · transmart · belanja bulanan · beras 5kg · telur 1kg · minyak goreng 2L · gula · sabun cuci · tisu · galon aqua · deterjen

**transport** — bensin motor · pertamax · pertalite · parkir · parkir motor · e-toll · tol dalam kota · gojek · grab · grabbike · grab ke kantor · maxim · ojek · angkot · busway · krl · mrt · tiket kereta · tiket pesawat · service motor · ganti oli · tambal ban

**bills** — Tagihan. internet · indihome · biznet · wifi · listrik · token listrik · pln · pulsa · pulsa xl · paket data · IPL · IPL 3 bulan · iuran warga · iuran sampah · air pdam · bpjs · asuransi

**housing** — Tempat Tinggal. sewa apartemen · sewa apartemen bulan september · sewa kos · kontrakan · service charge · deposit sewa · cicilan rumah · biaya pindahan · perabot untuk tempat tinggal

**entertainment** — Hiburan. Film titles, games, subscriptions, outings.
kungfu soccer (this is a film) · bioskop · xxi · cgv · tiket konser · netflix · spotify · disney+ · youtube premium · steam · top up ml · top up genshin · game · karaoke · billiard

**health** — Kesehatan. obat · tebus obat · apotek · kimia farma · vitamin · vitamin c 1000mg · konsul dokter umum · klinik · rumah sakit · lab · vaksin · masker · plester · grab ke klinik is transport, not health

**other** — Lainnya. Everything that fits none of the above: kado · sumbangan · amplop kondangan · transfer · biaya admin bank · tarik tunai · laundry · potong rambut · servis laptop · tip · elektronik (laptop, headset, mouse, kabel usb)

Ambiguity rule: a proper noun that could be a film, game, restaurant, or place is often NOT what its literal words suggest. Judge from context — the surrounding lines and the price. Two adjacent lines at an identical ticket-like price (e.g. two lines at 49k next to each other) are usually two cinema tickets, not one housing payment. When you cannot tell, use \`other\`.

## CONTEXT

TODAY, in Asia/Jakarta, is {{TODAY}}. Use this whenever the text contains no usable date.

## FINAL CHECK BEFORE YOU CALL THE TOOL

Read your own output back and confirm:
1. Every \`amount_idr\` is a JSON integer with no quotes, no dots, no commas, no decimal point.
2. No amount is under 500 unless the text literally shows such a small number.
3. No amount looks like it was divided by 1000 (38.5 instead of 38500).
4. \`occurred_on\` matches YYYY-MM-DD, and the day and month are not swapped.
5. No total / subtotal / jumlah line became an item.
6. Every \`category\` is one of the eight lowercase slugs.
7. The item count matches the number of priced lines in the text.

Now call \`record_expense\`.`
```

Add a prompt sanity test — `lib/llm/__tests__/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, RECORD_EXPENSE_TOOL, TOOL_NAME } from '../prompt'
import { CATEGORIES } from '@/lib/categories'

describe('system prompt', () => {
  const p = buildSystemPrompt('2026-08-19')

  it('interpolates TODAY and leaves no placeholder behind', () => {
    expect(p).toContain('2026-08-19')
    expect(p).not.toContain('{{TODAY}}')
  })

  it('states the dot-is-thousands rule explicitly', () => {
    expect(p).toContain('`.` (dot) is the THOUSANDS separator')
    expect(p).toContain('It is NOT 38.5')
  })

  it('states DD/MM/YYYY explicitly', () => {
    expect(p).toContain('DAY / MONTH / YEAR')
    expect(p).toContain('18/8/2026')
  })

  it('names every category and no others', () => {
    for (const c of CATEGORIES) expect(p, c).toContain(`**${c}**`)
  })

  it('forbids total lines and zero-amount items', () => {
    expect(p).toMatch(/TOTAL \/ SUBTOTAL lines/)
    expect(p).toMatch(/Do NOT emit an item with amount 0/)
  })
})

describe('record_expense tool', () => {
  const s = RECORD_EXPENSE_TOOL.input_schema as Record<string, any>

  it('is named record_expense', () => {
    expect(RECORD_EXPENSE_TOOL.name).toBe(TOOL_NAME)
    expect(TOOL_NAME).toBe('record_expense')
  })

  it('mirrors ParsedExpense exactly', () => {
    expect(Object.keys(s.properties).sort()).toEqual(['items', 'occurred_on', 'title'])
    expect(s.required.sort()).toEqual(['items', 'occurred_on', 'title'])
    const item = s.properties.items.items
    expect(Object.keys(item.properties).sort()).toEqual([
      'amount_idr', 'category', 'name',
    ])
    expect(item.properties.amount_idr.type).toBe('integer')
    expect(item.properties.category.enum).toEqual([...CATEGORIES])
    expect(s.properties.items.minItems).toBe(1)
    expect(s.properties.items.maxItems).toBe(50)
  })

  it('carries no Claude-only fields', () => {
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('strict')
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('cache_control')
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('defer_loading')
  })
})
```

```bash
pnpm vitest run lib/llm/__tests__/prompt.test.ts
git add -A && git commit -m "F04: record_expense tool schema + full Indonesian system prompt"
```

---

### Task 8 — `parseExpense` — tests first (no network)

`lib/llm/__tests__/parseExpense.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { parseExpenseWith } from '../parseExpense'
import { ParseError } from '../types'
import { fixture } from '../__fixtures__'

/** Build a fake Anthropic.Message carrying one tool_use block. */
function toolUse(input: unknown): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.2',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_expense', input } as any],
    usage: { input_tokens: 1800, output_tokens: 220 } as any,
  } as Anthropic.Message
}

function textOnly(text: string): Anthropic.Message {
  return {
    ...toolUse({}),
    stop_reason: 'end_turn',
    content: [{ type: 'text', text } as any],
  } as Anthropic.Message
}

const GOOD = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [
    { name: 'roti buaya', amount_idr: 38500, category: 'food' },
    { name: 'ayam sambal hitam', amount_idr: 45000, category: 'food' },
  ],
}

const fake = (impl: (n: number) => Promise<Anthropic.Message>) => {
  let n = 0
  const create = vi.fn(async () => impl(n++))
  return { client: { messages: { create } }, create }
}

const canonical = fixture('canonical')
const input = { rawText: canonical.rawText, todayISO: canonical.todayISO }

describe('parseExpense — happy path', () => {
  it('returns the tool input when it validates', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    const r = await parseExpenseWith(client, input)
    expect(r.source).toBe('llm')
    expect(r.degraded).toBe(false)
    expect(r.expense).toEqual(GOOD)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('sends exactly the allowed request surface', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    await parseExpenseWith(client, input)
    const body = create.mock.calls[0]![0] as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(
      ['max_tokens', 'messages', 'model', 'system', 'tool_choice', 'tools'].sort(),
    )
    for (const forbidden of [
      'thinking', 'output_config', 'effort', 'speed', 'betas',
      'fallbacks', 'temperature', 'top_p', 'top_k', 'stream',
    ]) {
      expect(body, forbidden).not.toHaveProperty(forbidden)
    }
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_expense' })
    expect((body.tools as unknown[]).length).toBe(1)
    expect(body.max_tokens).toBe(4000)
    expect(String(body.system)).toContain(canonical.todayISO)
    expect(JSON.stringify(body.messages)).toContain('roti buaya')
  })

  it('passes a timeout under the Vercel ceiling', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    await parseExpenseWith(client, input)
    const opts = create.mock.calls[0]![1] as { timeout: number }
    expect(opts.timeout).toBeLessThanOrEqual(25_000)
    expect(opts.timeout).toBeGreaterThan(0)
  })
})

describe('parseExpense — repair round-trip', () => {
  it('repairs once when the first output fails Zod', async () => {
    const bad = { ...GOOD, items: [{ ...GOOD.items[0], amount_idr: '38500' }] }
    const { client, create } = fake(async (n) => (n === 0 ? toolUse(bad) : toolUse(GOOD)))

    const r = await parseExpenseWith(client, input)
    expect(r.source).toBe('llm_repair')
    expect(r.degraded).toBe(true)
    expect(r.expense).toEqual(GOOD)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('feeds the validation error back as a tool_result', async () => {
    const bad = { ...GOOD, occurred_on: '18/8/2026' }
    const { client, create } = fake(async (n) => (n === 0 ? toolUse(bad) : toolUse(GOOD)))
    await parseExpenseWith(client, input)

    const second = create.mock.calls[1]![0] as any
    const msgs = second.messages
    // user paste, assistant tool_use, user tool_result
    expect(msgs.length).toBe(3)
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].content[0].type).toBe('tool_use')
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content[0].type).toBe('tool_result')
    expect(msgs[2].content[0].is_error).toBe(true)
    expect(msgs[2].content[0].tool_use_id).toBe('toolu_1')
    expect(String(msgs[2].content[0].content)).toContain('occurred_on')
  })

  it('repairs AT MOST once, then falls back', async () => {
    const bad = { ...GOOD, items: [] }
    const { client, create } = fake(async () => toolUse(bad))

    const r = await parseExpenseWith(client, input)
    expect(create).toHaveBeenCalledTimes(2)
    expect(r.source).toBe('fallback')
    expect(r.degraded).toBe(true)
    expect(r.expense.items.map((i) => i.amount_idr)).toEqual(canonical.expect.amounts)
  })
})

describe('parseExpense — fallback', () => {
  it('falls back when the API throws', async () => {
    const { client } = fake(async () => {
      throw new Error('ECONNRESET')
    })
    const r = await parseExpenseWith(client, input)
    expect(r.source).toBe('fallback')
    expect(r.expense.items.length).toBe(6)
    expect(r.expense.items.every((i) => i.category === 'other')).toBe(true)
  })

  it('falls back when the model replies with prose instead of a tool call', async () => {
    const { client } = fake(async () => textOnly('Maaf, saya tidak mengerti.'))
    const r = await parseExpenseWith(client, input)
    expect(r.source).toBe('fallback')
    expect(r.expense.occurred_on).toBe('2026-08-18')
  })

  it('falls back when the response is truncated at max_tokens', async () => {
    const truncated = { ...toolUse(GOOD), stop_reason: 'max_tokens' } as Anthropic.Message
    const { client } = fake(async () => truncated)
    const r = await parseExpenseWith(client, input)
    expect(r.source).toBe('fallback')
  })

  it('never leaves the user with nothing when a fallback is possible', async () => {
    const { client } = fake(async () => {
      throw new Error('502 Bad Gateway')
    })
    const r = await parseExpenseWith(client, input)
    expect(r.expense.items.length).toBeGreaterThan(0)
  })
})

describe('parseExpense — thrown errors', () => {
  const { client } = fake(async () => toolUse(GOOD))

  it('throws empty_input on blank text', async () => {
    await expect(parseExpenseWith(client, { rawText: '  \n ', todayISO: '2026-08-19' }))
      .rejects.toMatchObject({ name: 'ParseError', reason: 'empty_input' })
  })

  it('throws input_too_long above 8000 chars', async () => {
    await expect(
      parseExpenseWith(client, { rawText: 'a'.repeat(8001), todayISO: '2026-08-19' }),
    ).rejects.toMatchObject({ name: 'ParseError', reason: 'input_too_long' })
  })

  it('throws no_items_found when LLM and fallback both find nothing', async () => {
    const dead = fake(async () => {
      throw new Error('down')
    })
    await expect(
      parseExpenseWith(dead.client, {
        rawText: 'besok jangan jajan lagi\ncatatan: hemat',
        todayISO: '2026-08-19',
      }),
    ).rejects.toMatchObject({ name: 'ParseError', reason: 'no_items_found' })
  })

  it('every ParseError carries renderable Indonesian copy', async () => {
    try {
      await parseExpenseWith(client, { rawText: '', todayISO: '2026-08-19' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).userMessage.length).toBeGreaterThan(5)
    }
  })

  it('does not call the API at all for invalid input', async () => {
    const guard = fake(async () => toolUse(GOOD))
    await expect(
      parseExpenseWith(guard.client, { rawText: '', todayISO: '2026-08-19' }),
    ).rejects.toThrow()
    expect(guard.create).not.toHaveBeenCalled()
  })
})
```

```bash
pnpm vitest run lib/llm/__tests__/parseExpense.test.ts
```

Expected: all fail with `Cannot find module '../parseExpense'`.

```bash
git add -A && git commit -m "F04: failing tests for parseExpense"
```

---

### Task 9 — `parseExpense` — implementation

Create `lib/llm/parseExpense.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { ParsedExpense } from '@/lib/schema/expense'
import { llm, LLM_MODEL, type LlmClientLike } from './client'
import { RECORD_EXPENSE_TOOL, TOOL_NAME, buildSystemPrompt } from './prompt'
import { fallbackParse } from './fallbackParse'
import {
  MAX_RAW_TEXT_CHARS,
  ParseError,
  type ParseInput,
  type ParseResult,
} from './types'

export * from './types'

const MAX_TOKENS = 4000
const PRIMARY_TIMEOUT_MS = 25_000
const REPAIR_TIMEOUT_MS = 15_000
const OVERALL_DEADLINE_MS = 45_000
/** Below this, do not start a repair round-trip — we would risk the 60s ceiling. */
const MIN_REPAIR_BUDGET_MS = 3_000

const COPY = {
  empty_input: 'Teksnya masih kosong. Tulis dulu pengeluarannya ya.',
  input_too_long:
    'Teksnya kepanjangan (maks 8.000 karakter). Potong dulu, atau bagi jadi dua catatan.',
  no_items_found:
    'Nggak nemu satu pun pengeluaran di teks ini. Coba tulis satu baris per item, misalnya: ayam geprek 25k',
} as const

function userTurn(rawText: string): Anthropic.MessageParam {
  return {
    role: 'user',
    content:
      'Extract the expense group from the text between the markers. ' +
      'Call record_expense exactly once.\n\n' +
      '<paste>\n' +
      rawText +
      '\n</paste>',
  }
}

function baseBody(
  system: string,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  // Exactly the portable Messages API surface. Nothing Claude-specific.
  return {
    model: LLM_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    tools: [RECORD_EXPENSE_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  }
}

function findToolUse(msg: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of msg.content) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) {
      return block as Anthropic.ToolUseBlock
    }
  }
  return null
}

/** Compact, model-readable summary of what Zod rejected. */
function describeZodIssues(err: unknown): string {
  const issues = (err as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(err)
  return issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
}

const REPAIR_PREAMBLE =
  'Your record_expense call did not validate. Fix ONLY the listed problems and call ' +
  'record_expense again with the corrected data. Remember: amount_idr is a whole-rupiah ' +
  'JSON integer (45000, not "45000" and not 45.0); Rp 38.500 is 38500 because "." is the ' +
  'thousands separator; occurred_on is YYYY-MM-DD with the Indonesian day/month order; ' +
  'category is one of food, groceries, transport, bills, housing, entertainment, health, ' +
  'other.\n\nValidation errors:\n'

/**
 * Testable core. `parseExpense` below is the thin production wrapper.
 * Never throws for an LLM problem — LLM problems degrade to the fallback.
 */
export async function parseExpenseWith(
  client: LlmClientLike,
  input: ParseInput,
): Promise<ParseResult> {
  const rawText = input.rawText
  if (rawText.trim() === '') throw new ParseError('empty_input', COPY.empty_input)
  if (rawText.length > MAX_RAW_TEXT_CHARS) {
    throw new ParseError('input_too_long', COPY.input_too_long)
  }

  const deadline = Date.now() + OVERALL_DEADLINE_MS
  const system = buildSystemPrompt(input.todayISO)
  const messages: Anthropic.MessageParam[] = [userTurn(rawText)]

  let inputTokens = 0
  let outputTokens = 0

  // ---- Attempt 1 -----------------------------------------------------------
  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(baseBody(system, messages), {
      timeout: Math.min(PRIMARY_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
    })
    inputTokens += first.usage?.input_tokens ?? 0
    outputTokens += first.usage?.output_tokens ?? 0
  } catch (cause) {
    logLlmFailure('primary', cause)
  }

  const firstBlock = first ? findToolUse(first) : null
  const truncated = first?.stop_reason === 'max_tokens'

  if (firstBlock && !truncated) {
    const parsed = ParsedExpense.safeParse(firstBlock.input)
    if (parsed.success) {
      return {
        expense: parsed.data,
        source: 'llm',
        degraded: false,
        usage: { inputTokens, outputTokens },
      }
    }

    // ---- Attempt 2: exactly one repair round-trip --------------------------
    if (deadline - Date.now() > MIN_REPAIR_BUDGET_MS) {
      const repairMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: 'assistant', content: [firstBlock] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: firstBlock.id,
              is_error: true,
              content: REPAIR_PREAMBLE + describeZodIssues(parsed.error),
            },
          ],
        },
      ]

      try {
        const second = await client.messages.create(baseBody(system, repairMessages), {
          timeout: Math.min(
            REPAIR_TIMEOUT_MS,
            Math.max(1, deadline - Date.now()),
          ),
        })
        inputTokens += second.usage?.input_tokens ?? 0
        outputTokens += second.usage?.output_tokens ?? 0

        const secondBlock = findToolUse(second)
        if (secondBlock && second.stop_reason !== 'max_tokens') {
          const repaired = ParsedExpense.safeParse(secondBlock.input)
          if (repaired.success) {
            return {
              expense: repaired.data,
              source: 'llm_repair',
              degraded: true,
              usage: { inputTokens, outputTokens },
            }
          }
          logLlmFailure('repair-invalid', repaired.error)
        }
      } catch (cause) {
        logLlmFailure('repair', cause)
      }
    }
  }

  // ---- Attempt 3: deterministic fallback. The user is never hard-blocked. ---
  const fb = fallbackParse(input)
  if (fb) {
    const checked = ParsedExpense.safeParse(fb)
    if (checked.success) {
      return {
        expense: checked.data,
        source: 'fallback',
        degraded: true,
        usage: inputTokens || outputTokens ? { inputTokens, outputTokens } : null,
      }
    }
    logLlmFailure('fallback-invalid', checked.error)
  }

  throw new ParseError('no_items_found', COPY.no_items_found)
}

function logLlmFailure(stage: string, cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  // Never log rawText — it is user financial data.
  console.warn(`[F04 parse] stage=${stage} ${message}`)
}

/** The signature F05 imports. Returns the boundary type and nothing else. */
export async function parseExpense(input: ParseInput): Promise<ParsedExpense> {
  const { expense } = await parseExpenseWith(llm, input)
  return expense
}

/** Same work, but reports whether the LLM actually succeeded. Used by the route. */
export function parseExpenseWithMeta(input: ParseInput): Promise<ParseResult> {
  return parseExpenseWith(llm, input)
}
```

> **Note on `import 'server-only'`:** `parseExpense.ts` imports `./client`, which imports `server-only`. Under Vitest (`environment: 'node'`) that resolves fine. The tests only ever exercise `parseExpenseWith` with an injected fake, so no real client is ever constructed and `env.LLM_API_KEY` is never read at test time — module-level `const llm = ...` *does* run on import though. If `lib/env.ts` throws on missing vars in the test process, add a `.env.test` with dummy values and `test: { env: { LLM_API_KEY: 'test', LLM_BASE_URL: 'https://example.invalid', LLM_MODEL: 'test' } }` to `vitest.config.ts`. That is the expected, correct fix — do not weaken `lib/env.ts`.

```bash
pnpm vitest run lib/llm/__tests__/parseExpense.test.ts
pnpm vitest run
```

Expected: all green.

```bash
git add -A && git commit -m "F04: parseExpense with forced tool use, one repair round-trip, fallback"
```

---

### Task 10 — The live integration test (gated)

This is how we find out the prompt is wrong **before the user does**. It really hits GLM-5.2. It is skipped unless `LLM_LIVE_TEST=1`, so CI never needs the key.

Create `lib/llm/__tests__/parseExpense.live.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { parseExpenseWith } from '../parseExpense'
import { FIXTURES, fixture } from '../__fixtures__'

const LIVE = process.env.LLM_LIVE_TEST === '1'
const d = LIVE ? describe : describe.skip

const client = () =>
  new Anthropic({
    apiKey: process.env.LLM_API_KEY!,
    baseURL: process.env.LLM_BASE_URL!,
    timeout: 25_000,
    maxRetries: 0,
  })

d('GLM-5.2 live — canonical fixture must be exact', () => {
  it(
    'parses the roadmap example with exact amounts and date',
    async () => {
      const fx = fixture('canonical')
      const r = await parseExpenseWith(client(), {
        rawText: fx.rawText,
        todayISO: fx.todayISO,
      })

      // If this is 'fallback', the LLM call or the prompt failed. Read the
      // console.warn line above this failure for the reason.
      expect(r.source, 'expected the LLM to succeed, not the fallback').toBe('llm')

      expect(r.expense.title).toBe('bakar duit tuesday')
      expect(r.expense.occurred_on).toBe('2026-08-18')
      expect(r.expense.items).toHaveLength(6)
      expect(r.expense.items.map((i) => i.amount_idr)).toEqual([
        38500, 45000, 49000, 49000, 58850, 26000,
      ])
      expect(
        r.expense.items.reduce((s, i) => s + i.amount_idr, 0),
      ).toBe(266_350)

      // Names keep the user's wording.
      expect(r.expense.items[0]!.name.toLowerCase()).toContain('roti buaya')
      expect(r.expense.items[5]!.name.toLowerCase()).toContain('pak gembus')

      // Categories: exact where unambiguous, allow-list where not (see OQ-1).
      const cats = r.expense.items.map((i) => i.category)
      expect(cats[0]).toBe('food')
      expect(cats[1]).toBe('food')
      expect(['entertainment', 'housing', 'other']).toContain(cats[2])
      expect(cats[3]).toBe('entertainment')
      expect(cats[4]).toBe('food')
      expect(cats[5]).toBe('food')

      console.log(
        `[live] usage in=${r.usage?.inputTokens} out=${r.usage?.outputTokens}`,
      )
    },
    60_000,
  )
})

d('GLM-5.2 live — full corpus', () => {
  for (const fx of FIXTURES) {
    it(
      `${fx.id}: exact amounts + date`,
      async () => {
        const r = await parseExpenseWith(client(), {
          rawText: fx.rawText,
          todayISO: fx.todayISO,
        })

        expect(r.source, `${fx.id} degraded to fallback`).not.toBe('fallback')
        expect(r.expense.occurred_on, `${fx.id} date`).toBe(fx.expect.occurredOn)
        expect(r.expense.items.length, `${fx.id} item count`).toBe(fx.expect.itemCount)
        expect(
          r.expense.items.map((i) => i.amount_idr),
          `${fx.id} amounts — a 1000x error means the dot rule failed`,
        ).toEqual(fx.expect.amounts)
        expect(
          r.expense.items.reduce((s, i) => s + i.amount_idr, 0),
          `${fx.id} total`,
        ).toBe(fx.expect.total)

        if (fx.expect.title !== null) {
          expect(r.expense.title.trim(), `${fx.id} title`).toBe(fx.expect.title)
        } else {
          expect(r.expense.title.trim().length, `${fx.id} title`).toBeGreaterThan(0)
        }

        fx.expect.categories.forEach((allowed, idx) => {
          if (allowed.length === 0) return
          expect(allowed, `${fx.id} item[${idx}] category`).toContain(
            r.expense.items[idx]!.category,
          )
        })
      },
      60_000,
    )
  }
})

d('GLM-5.2 live — every amount is an integer, never a string', () => {
  it(
    'never emits a string or a decimal amount',
    async () => {
      const fx = fixture('mixed-units')
      const r = await parseExpenseWith(client(), {
        rawText: fx.rawText,
        todayISO: fx.todayISO,
      })
      for (const item of r.expense.items) {
        expect(typeof item.amount_idr).toBe('number')
        expect(Number.isInteger(item.amount_idr)).toBe(true)
        expect(item.amount_idr).toBeGreaterThan(0)
      }
    },
    60_000,
  )
})
```

Run the CI-safe suite first — the live tests must be silently skipped:

```bash
pnpm test
```

Expected: live tests reported as **skipped**, everything else green.

Now the real thing:

```bash
set -a && source .env.local && set +a && pnpm test:live
```

Expected: 14 passing tests plus a `[live] usage in=… out=…` line.

**This is the prompt-tuning loop.** When a fixture fails:

| Failure | Fix in the prompt |
|---|---|
| Amount is 1000× too small (`38.5`) | Strengthen §MONEY rule 4 and the sanity check. Add the exact failing string to the conversion table. |
| Amount is 1000× too large | Suffix double-applied. Check rules 2/3 wording. |
| Date is month/day swapped | Add the exact failing date string to the §DATE example list. |
| Total line became an item | Add the exact phrasing to the SKIP list. |
| Item count off by one | Usually the header line became an item, or a priceless note did. Add the exact line to the SKIP list. |
| Title includes the date | Add the exact header shape to the §TITLE examples. |
| Category consistently wrong | Add the exact Indonesian term to that category's example list. |
| `source === 'llm_repair'` on a clean fixture | The first call is producing invalid output. Look at the `console.warn` for the Zod issues and patch the OUTPUT CONTRACT section. |

**Rule: fix the prompt, never the assertion.** The only assertion you may loosen is a category allow-list, and only after recording the reasoning in Open Questions.

Run `pnpm test:live` three times in a row before declaring victory — GLM is not deterministic, and a prompt that passes once in three is not shipped.

```bash
git add -A && git commit -m "F04: gated live integration test against GLM-5.2 over the full corpus"
```

---

### Task 11 — `POST /api/parse` — tests first

`app/api/parse/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireUserId = vi.fn<[], Promise<string>>()
const parseExpenseWithMeta = vi.fn()

vi.mock('@/lib/auth', () => ({ requireUserId }))
vi.mock('@/lib/llm/parseExpense', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm/types')>('@/lib/llm/types')
  return { ...actual, parseExpenseWithMeta }
})

const { POST } = await import('../route')

const req = (body: unknown) =>
  new Request('http://localhost/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const GOOD_BODY = { rawText: 'ayam geprek 25k', todayISO: '2026-08-19' }
const GOOD_RESULT = {
  expense: {
    title: 'jajan',
    occurred_on: '2026-08-19',
    items: [{ name: 'ayam geprek', amount_idr: 25000, category: 'food' }],
  },
  source: 'llm',
  degraded: false,
  usage: { inputTokens: 1800, outputTokens: 90 },
}

beforeEach(() => {
  vi.clearAllMocks()
  requireUserId.mockResolvedValue('user_1')
  parseExpenseWithMeta.mockResolvedValue(GOOD_RESULT)
})

describe('POST /api/parse — auth', () => {
  it('401s when unauthenticated, and never calls the LLM', async () => {
    requireUserId.mockRejectedValue(new Error('unauthenticated'))
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'unauthorized' },
    })
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })
})

describe('POST /api/parse — body validation', () => {
  it('200s on a valid body', async () => {
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      expense: GOOD_RESULT.expense,
      source: 'llm',
      degraded: false,
    })
  })

  it('does not leak token usage to the client', async () => {
    const body = await (await POST(req(GOOD_BODY))).json()
    expect(body).not.toHaveProperty('usage')
  })

  it('400s on malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{oops',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400s on a missing or wrongly-shaped field', async () => {
    for (const bad of [
      {},
      { rawText: 'x' },
      { todayISO: '2026-08-19' },
      { rawText: 'x', todayISO: '19/8/2026' },
      { rawText: 'x', todayISO: '2026-8-19' },
      { rawText: 123, todayISO: '2026-08-19' },
    ]) {
      const res = await POST(req(bad))
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
  })

  it('400s on empty rawText', async () => {
    const res = await POST(req({ rawText: '   ', todayISO: '2026-08-19' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('empty_input')
  })

  it('413s above the 8000-char cap, without calling the LLM', async () => {
    const res = await POST(req({ rawText: 'a'.repeat(8001), todayISO: '2026-08-19' }))
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('input_too_long')
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })
})

describe('POST /api/parse — parser outcomes', () => {
  it('reports degraded results honestly', async () => {
    parseExpenseWithMeta.mockResolvedValue({
      ...GOOD_RESULT,
      source: 'fallback',
      degraded: true,
    })
    const body = await (await POST(req(GOOD_BODY))).json()
    expect(body).toMatchObject({ ok: true, source: 'fallback', degraded: true })
  })

  it('422s on no_items_found with renderable copy', async () => {
    const { ParseError } = await import('@/lib/llm/types')
    parseExpenseWithMeta.mockRejectedValue(
      new ParseError('no_items_found', 'Nggak nemu satu pun pengeluaran di teks ini.'),
    )
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('no_items_found')
    expect(body.error.message).toContain('Nggak nemu')
  })

  it('500s on an unexpected throw, without leaking the message', async () => {
    parseExpenseWithMeta.mockRejectedValue(
      new Error('LLM_API_KEY=sk-super-secret rejected'),
    )
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server_error')
    expect(JSON.stringify(body)).not.toContain('sk-super-secret')
  })
})

describe('POST /api/parse — rate limiting', () => {
  it('429s after the burst allowance for one user', async () => {
    for (let i = 0; i < 10; i++) await POST(req(GOOD_BODY))
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
  })
})
```

```bash
pnpm vitest run app/api/parse/__tests__/route.test.ts
```

Expected: fails on `Cannot find module '../route'`.

```bash
git add -A && git commit -m "F04: failing tests for POST /api/parse"
```

---

### Task 12 — `app/api/parse/route.ts`

```ts
import { z } from 'zod'
import { requireUserId } from '@/lib/auth'
import { parseExpenseWithMeta } from '@/lib/llm/parseExpense'
import { isParseError, MAX_RAW_TEXT_CHARS } from '@/lib/llm/types'

// Node runtime: the Anthropic SDK and `server-only` need it, and the edge
// runtime's shorter limits do not suit a 25s upstream call.
export const runtime = 'nodejs'
// Vercel Hobby ceiling. parseExpense's own deadline is 45s, so this is headroom.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const Body = z.object({
  rawText: z.string().max(MAX_RAW_TEXT_CHARS),
  todayISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const COPY = {
  unauthorized: 'Sesi kamu habis. Login lagi ya.',
  bad_request: 'Ada yang salah sama datanya. Coba refresh halamannya.',
  empty_input: 'Teksnya masih kosong. Tulis dulu pengeluarannya ya.',
  input_too_long:
    'Teksnya kepanjangan (maks 8.000 karakter). Potong dulu, atau bagi jadi dua catatan.',
  rate_limited: 'Kebanyakan request. Tunggu sebentar terus coba lagi ya.',
  server_error: 'Lagi ada gangguan di server. Coba lagi sebentar lagi.',
} as const

function fail(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return Response.json({ ok: false, error: { code, message } }, { status, headers })
}

/**
 * Abuse control. D3 says ANY Google account may sign in, so /api/parse is an
 * open door onto metered LLM spend: one signed-in stranger with a script can
 * burn the z.ai budget in minutes.
 *
 * v0.1.0 defence, in layers:
 *   1. Auth required (this route).
 *   2. Hard 8.000-char input cap — bounds the cost of any single call.
 *   3. max_tokens 4000 — bounds output cost.
 *   4. The burst limiter below.
 *
 * The limiter is BEST EFFORT only. Serverless instances do not share memory, so
 * an attacker spread across N warm instances gets N× the allowance. It stops
 * an accidental render loop and a casual curl loop; it does not stop a
 * determined attacker. The real fix is a durable counter — see OQ-5. Do not
 * mistake this for a security control.
 */
const WINDOW_MS = 60_000
const BURST = 10
declare global {
  // eslint-disable-next-line no-var
  var __parseHits: Map<string, number[]> | undefined
}
const hits = (globalThis.__parseHits ??= new Map<string, number[]>())

function overBurst(userId: string): boolean {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  if (hits.size > 5000) hits.clear() // crude unbounded-growth guard
  return recent.length > BURST
}

export async function POST(request: Request): Promise<Response> {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return fail(401, 'unauthorized', COPY.unauthorized)
  }

  if (overBurst(userId)) {
    return fail(429, 'rate_limited', COPY.rate_limited, { 'retry-after': '60' })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return fail(400, 'bad_request', COPY.bad_request)
  }

  const body = Body.safeParse(json)
  if (!body.success) {
    const tooLong =
      typeof (json as { rawText?: unknown })?.rawText === 'string' &&
      ((json as { rawText: string }).rawText.length > MAX_RAW_TEXT_CHARS)
    return tooLong
      ? fail(413, 'input_too_long', COPY.input_too_long)
      : fail(400, 'bad_request', COPY.bad_request)
  }

  if (body.data.rawText.trim() === '') {
    return fail(400, 'empty_input', COPY.empty_input)
  }

  try {
    const result = await parseExpenseWithMeta(body.data)
    // Deliberately omit `usage` — token counts are our business, not the client's.
    return Response.json({
      ok: true,
      expense: result.expense,
      source: result.source,
      degraded: result.degraded,
    })
  } catch (e) {
    if (isParseError(e)) {
      const status =
        e.reason === 'input_too_long' ? 413 : e.reason === 'empty_input' ? 400 : 422
      return fail(status, e.reason, e.userMessage)
    }
    // Never surface the raw message — it can contain the base URL or key fragments.
    console.error('[F04 /api/parse] unexpected', e)
    return fail(500, 'server_error', COPY.server_error)
  }
}
```

> The 413 branch handles the case where Zod's `.max()` rejects before we can distinguish "too long" from "wrong shape". The check re-reads the raw JSON, which is why it inspects `json` rather than `body.data`.

```bash
pnpm vitest run app/api/parse/__tests__/route.test.ts
pnpm test
pnpm build
```

Expected: all tests green; `next build` succeeds and lists `/api/parse` as a dynamic (ƒ) route.

```bash
git add -A && git commit -m "F04: POST /api/parse — auth, Zod body, input cap, burst limit, friendly errors"
```

---

### Task 13 — Cost & latency notes

Create `lib/llm/COST.md` (a doc, not code — F05 and future-you will want it):

```markdown
# F04 — cost, latency, and why we don't stream

## Tokens per parse (measured — refresh these from `pnpm test:live` output)

| Part | Tokens | Notes |
|---|---:|---|
| System prompt | ~1,700 | Constant. Rebuilt per request only to swap TODAY. |
| Tool schema (`record_expense`) | ~280 | Constant. |
| Wrapper + `<paste>` markers | ~40 | Constant. |
| User's pasted text | 40–350 | 5–15 lines is typical; the 8,000-char cap is ~2,300 tokens worst case. |
| **Input total, typical** | **~2,050** | ~4,300 at the input cap. |
| Output (tool_use JSON, 6 items) | ~230 | ~35 tokens per item + envelope. |
| **Output total, typical** | **~230** | `max_tokens` 4,000 covers 50 items with headroom. |

A repair round-trip roughly **doubles input** (the prompt is resent plus the failed
tool_use and the error) and adds another ~230 output. Budget ~2× for the p99.

Cost per parse = `2050 × input_rate + 230 × output_rate`. Fill in z.ai's GLM-5.2
rates (see OQ-4) — at any plausible rate this is fractions of a rupiah, and the
binding constraint is z.ai's rate limit and our own abuse surface, not unit cost.

The system prompt is ~88% of input tokens. If cost ever becomes the binding
constraint, prompt caching is the lever (OQ-6), not trimming the prompt — the
prompt's length is exactly what keeps the 1000× money bug away.

## Latency

Expected p50 3–7 s, p95 10–18 s for a 6-item paste. Hard-capped at 25 s
(primary) + 15 s (repair) = 40 s, inside `maxDuration = 60`.

## Why we don't stream

1. **Nothing to render early.** The review table needs complete rows: a half-built
   `{"name": "roti bu` is not a row. Streaming would show a table that reflows on
   every token — worse UX than a clean skeleton.
2. **Validation is all-or-nothing.** Zod runs on the finished tool input. There is
   no partial-validation story, and partial JSON cannot be safely `JSON.parse`d.
3. **The repair loop needs the full response** to build the `tool_result` turn.
4. **Streaming complicates the fallback.** A stream that dies at token 40 leaves
   an ambiguous partial; a non-streaming call either returns or throws.
5. **Simplicity is the core tenet.** A non-streaming Route Handler is ~20 lines;
   a streaming one needs an SSE/`ReadableStream` bridge on both ends.

**Revisit if:** p95 exceeds ~20 s. Then stream `content_block_delta` /
`input_json_delta` and progressively fill the table. That is an F05 concern and a
strictly additive change — `parseExpense`'s signature does not move.
```

```bash
git add -A && git commit -m "F04: cost & latency notes, no-streaming rationale"
```

---

### Task 14 — Final verification

```bash
pnpm test                       # everything except live
pnpm lint
pnpm build
set -a && source .env.local && set +a && pnpm test:live   # ×3
```

Manual end-to-end (needs F02's session):

```bash
pnpm dev
# In a browser signed in via Google, from the devtools console on the app origin:
```

```js
await (await fetch('/api/parse', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    rawText: `bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k`,
    todayISO: '2026-09-01',
  }),
})).json()
```

Expected:

```json
{
  "ok": true,
  "source": "llm",
  "degraded": false,
  "expense": {
    "title": "bakar duit tuesday",
    "occurred_on": "2026-08-18",
    "items": [
      { "name": "roti buaya", "amount_idr": 38500, "category": "food" },
      { "name": "ayam sambal hitam", "amount_idr": 45000, "category": "food" },
      { "name": "perumahan laddaland", "amount_idr": 49000, "category": "entertainment" },
      { "name": "kungfu soccer", "amount_idr": 49000, "category": "entertainment" },
      { "name": "fan fries plaza blok m", "amount_idr": 58850, "category": "food" },
      { "name": "pak gembus", "amount_idr": 26000, "category": "food" }
    ]
  }
}
```

Items sum to 266350 → `Rp 266.350`. Matches ROADMAP §1.

Also verify the never-blocked promise by temporarily breaking the key:

```bash
LLM_API_KEY=bogus pnpm dev
# re-run the fetch above
```

Expected: still `200`, with `"source": "fallback"`, `"degraded": true`, six items, all `category: "other"`, `occurred_on: "2026-08-18"`, title `bakar duit tuesday`. **The user is never hard-blocked.**

```bash
git add -A && git commit -m "F04: LLM parsing engine complete"
git push -u origin f04-llm-parsing
```

---

## Definition of done

- [ ] `pnpm test` green; `pnpm lint` clean; `pnpm build` succeeds
- [ ] `pnpm test:live` green **three consecutive runs**
- [ ] Every fixture's amounts and `occurred_on` are exact against real GLM-5.2
- [ ] Canonical fixture totals exactly `266350`
- [ ] With a bogus API key, `/api/parse` still returns 200 with `degraded: true` and six items
- [ ] No forbidden parameter is ever sent (asserted in `parseExpense.test.ts`)
- [ ] `parseExpense` and `ParseError` exported exactly as documented in *Interfaces I publish*
- [ ] `lib/llm/COST.md` has real measured token counts, not the placeholders
- [ ] `rawText` never appears in any log line

---

## Open questions for the integrator

**OQ-1 — What is `perumahan laddaland`?**
In the canonical roadmap example, `perumahan laddaland 49k` sits directly beside `kungfu soccer 49k` at an identical, cinema-ticket-shaped price. That strongly suggests both are film titles (Laddaland is a 2011 Thai horror film), which would make it `entertainment`. But the literal Indonesian word *perumahan* means "housing", which is a category slug. I have written the fixture to accept `entertainment | housing | other` rather than encode a guess into an assertion. **Ask the user what they actually spent that 49k on**, then tighten `FIXTURES[0].expect.categories[2]` to a single value and, if it is `entertainment`, add the term to the entertainment examples in the system prompt.

**OQ-2 — `lib/format.ts` ownership — RESOLVED, but verify the exact `parseIdrLoose` behaviour.**
ROADMAP §4.7 specifies the file but §5 assigns it to no feature. Checking `docs/plans/F03-data-layer.md`: F03 declares itself **"Owner of: … `lib/format.ts`"** (§5.3). So F04 must **not** write that file. Task 2 stands as written — it is now purely a dependency gate: run it, and if a case fails, the fix belongs in F03's file, not in a private copy under `lib/llm/`. The one thing still worth confirming with F03: whether `parseIdrLoose('1.5jt')` returns `1500000` (sloppy dot-as-decimal in a `jt` context) or `null`. `fallbackParse` relies on the former. F03's §5.3 should be read before Task 3.

Related: F03's `lib/format.ts` also exports `addMonths` / `monthRange` beyond the §4.7 list. Harmless to F04, but confirms F03 is the live owner.

**OQ-3 — Quantity semantics: `2x nasi goreng 30k`.**
I decided the trailing number is the **total already paid**, not a unit price — so 30000, not 60000. Rationale: in real Indonesian expense notes the writer records what left their wallet, and inventing a multiplication risks silently doubling a real number, which is worse than under-reading a rare one. The `@` marker is the escape hatch for the unit-price case. **This is reversible in one prompt paragraph plus one fixture** — flag it if the user's actual notes use the other convention.

**OQ-4 — GLM-5.2 pricing and rate limits on z.ai.**
Needed to fill in `lib/llm/COST.md` and to size the burst limiter. Also: does z.ai return `retry-after` on 429, and does its 429 body match the Anthropic error envelope (so `Anthropic.RateLimitError` is thrown rather than a generic `APIError`)? Worth a single deliberate over-limit test.

**OQ-5 — Durable rate limiting.**
The in-memory burst limiter in `route.ts` does not survive across serverless instances. The real fix is a per-user daily counter. Options: (a) a `parse_usage` table — clean, but a **contract delta to §4.2**; (b) Vercel KV / Upstash — a new dependency and a free-tier consideration; (c) accept the risk for v0.1.0 and monitor the z.ai bill. I recommend **(c) for v0.1.0**, because the schema in §4.2 is intentionally minimal and the input cap already bounds per-call cost. **Get a decision before launch**, because D3 (any Google account) makes this a real exposure the moment the domain is public.

**OQ-6 — Prompt caching.**
The system prompt is ~1,700 tokens and byte-identical across requests except for the TODAY line. `cache_control: { type: 'ephemeral' }` on a system text block is standard Anthropic Messages API, but it is outside the portable surface I committed to in §0.1 and may be ignored or rejected by z.ai. **Deliberately not implemented.** If cost becomes a concern, run one experiment: put the constant part of the prompt in a cached block with TODAY moved into the user turn, and check whether `usage.cache_read_input_tokens` is populated. If the field is absent, revert immediately — a silently-ignored `cache_control` is harmless but a rejected one breaks every parse.

**OQ-7 — Repair via `tool_result` with `is_error: true`.**
This is the standard Messages API shape for feeding a tool failure back. Most Anthropic-compatible servers implement it, but it is the least-exercised corner of the wire protocol on non-Claude backends. If the repair round-trip 400s in Task 10, the fallback is a plain user text turn: `{ role: 'user', content: REPAIR_PREAMBLE + issues }` with the assistant tool_use turn dropped. That loses the tool-call linkage but works everywhere. **Verify empirically in Task 10** (force it by hardcoding a bad first response) and record which shape z.ai accepts.

**OQ-8 — Does GLM-5.2 honour forced `tool_choice` reliably?**
`tool_choice: { type: 'tool', name: 'record_expense' }` is the whole structured-output strategy. Task 10's `source === 'llm'` assertion is the check: if the model ever replies with prose despite the forced choice, `parseExpenseWith` degrades to the fallback and the live test fails loudly. If that turns out to be frequent rather than rare, the mitigation is to keep the forced tool **and** add `Now call record_expense.` as the last line of the user turn as well as the system prompt.

**OQ-9 — Should `degraded: true` block saving?**
Currently no: F05 gets a warning banner and the user can save whatever the fallback produced (all `other` categories). The alternative is to force a category choice before enabling Save. I lean toward **not blocking** — D1 says the user can retag with one tap, and a saved-but-mistagged expense is recoverable while a lost paste is not. **F05's call.**

**OQ-10 — Test runner — RESOLVED, but the install may be a duplicate.**
`docs/plans/F03-data-layer.md` also chooses Vitest, so the runner choice is consistent across features. That means Contract Delta #1 above is likely to be introduced by **whichever of F03/F04 lands first**, not by F04 specifically. Before running Task 0, check whether `vitest` is already in `package.json` and whether `vitest.config.ts` already exists; if so, skip the install and only verify that the `include` glob covers `lib/**/*.test.ts` **and** `app/**/*.test.ts` (F04 adds the `app/` half for the route test). Do not create a second config file.
