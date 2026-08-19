# F05 — Add Expense Flow (`/new`)

> Plan version 1 · target release v0.1.0 · depends on **F02** (auth), **F03** (data layer + contracts), **F04** (parser), **F06** (photos), **F10** (design system).
> Builds against **ROADMAP_v0.1.0.md §4 (Shared contract — AUTHORITATIVE)** and against the F02/F03/F04/F06 plans as published. Every divergence is listed at the end, under Contract deltas.

---

## 0. What this feature is

`/new` is the one screen the product exists for. A user pastes a blob of Indonesian free text, taps **Rapikan**, gets a correct editable table, optionally attaches photos, taps **Simpan**, and lands on `/e/<id>`.

**Single page. Three visual stages. No wizard, no route changes, no `?step=` query param.**

```
┌─ /new ─────────────────────────────────────────────┐
│  STAGE 1  PASTE                                     │
│    big autofocus textarea + placeholder example     │
│    sticky [ Rapikan ]        "isi manual" ───┐      │
│         │                                    │      │
│         ▼ POST /api/parse (F04)              │      │
│    ┌────────────────────┐                    │      │
│    │ skeleton table     │  >8s: "masih…"     │      │
│    └────────────────────┘                    │      │
│         │ ok                │ fail           │      │
│         ▼                   ▼                ▼      │
│  STAGE 2  REVIEW  ◄── friendly banner + fallback    │
│    title · date · rows(name, amount, chip, ✕)       │
│    + Tambah item · Rapikan ulang                    │
│                                                     │
│  STAGE 3  PHOTOS + SAVE   (same scroll, below)      │
│    <PhotoPicker mode="staged"/>  (F06)              │
│    sticky: live total + [ Simpan ]                  │
│         │                                           │
│         ▼ createExpense({ …, photos })              │
│    router.push('/e/' + id)                          │
└─────────────────────────────────────────────────────┘
```

Note that **three visual stages map to two state stages**. `stage` is `'paste' | 'review'`. Photos + Save are not a third state — they are the bottom of the review scroll, always visible, always reachable. A third state would mean a "next" button, which is navigation the product explicitly does not want. This is a deliberate design decision, not an oversight.

**Target device:** iPhone XS Max, 414×896 CSS px, safe-area insets, Safari. Every layout decision below assumes a 414 px-wide viewport with a 44 px minimum tap target.

---

## 1. State model — decision and justification

### Decision: **one `useReducer` over a `DraftExpense`-centred state object.** Not `useState` per concern.

Reasons, in order of weight:

1. **Persistence needs one serialisable object.** The draft must survive an accidental back-navigation. With 8–10 `useState` calls I would need an effect whose dependency array lists every one of them, and any missed dependency silently drops a field from the saved draft — a class of bug that is invisible until a user loses a long paste. With a reducer there is exactly one `useEffect(() => save(state.draft), [state.draft])`.
2. **Item mutations are array-splice logic**, not value assignment. `setItems(items.map(i => i.key === key ? {...i, name} : i))` repeated six times across three components is the exact shape of code that grows an off-by-one. In a reducer it is six named cases in one pure function.
3. **Focus management is a consequence of a state transition.** "Delete a row → move focus to the next row's delete button" must be computed from the array *before* the splice. A reducer can emit `focus` alongside `items` atomically; parallel `useState`s cannot without an extra effect that re-derives indices from stale data.
4. **The reducer is a pure function I can unit test** without React, jsdom, or a render. Tasks 2–4 test the reducer, the storage codec, and the validator as plain TypeScript. That is where the real risk lives.
5. Transitions like `parse_success` touch **five fields at once** (`stage`, `title`, `occurredOn`, `items`, `source`). Five `set*` calls in a row are five renders and five chances to leave the UI half-transitioned.

What stays as local `useState`: **purely ephemeral, single-component UI that is never persisted and never read by a sibling.** Concretely — the category sheet's open/closed key, the amount input's `focused` flag, the "teks asli" disclosure. The rule for reviewers: *if it belongs in localStorage, or two components read it, it belongs in the reducer.*

### Exact TypeScript type of the draft state

`app/new/draft.ts` — the authoritative shape (full source in Task 2):

```ts
export const DRAFT_VERSION = 1 as const

/** One editable line in the review table. */
export type DraftItem = {
  /** Client-only stable identity. Survives reorder + persistence. Never sent to the server. */
  key: string
  name: string
  /** Whole rupiah. null = empty, or the last thing typed could not be parsed. */
  amountIdr: number | null
  /** Set only when F10's MoneyInput reported a parse failure, so the error can quote it. */
  amountRaw: string | null
  category: Category
}

/** F04's ParseSource is 'llm' | 'llm_repair' | 'fallback'; we add the manual escape hatch. */
export type DraftSource = ParseSource | 'manual'

/** The persisted unit. This and only this goes to localStorage. */
export type DraftExpense = {
  version: typeof DRAFT_VERSION
  stage: 'paste' | 'review'
  rawText: string
  title: string
  /** YYYY-MM-DD, Asia/Jakarta day (D9/D10). */
  occurredOn: string
  items: DraftItem[]
  note: string
  /** Completed Blob uploads owned by F06. Plain JSON, so it round-trips through localStorage. */
  photos: StagedPhoto[]
  source: DraftSource | null
  touchedAt: number
}

/** `code` drives behaviour; `message` is ready-to-render Indonesian. F04 authors the
 *  server-side messages (its wire contract guarantees they are safe to render verbatim);
 *  copy.ts supplies the handful the client detects on its own. */
export type ParseFailure = {
  code:
    | 'offline' | 'timeout' | 'invalid_response'          // detected client-side
    | 'unauthorized' | 'bad_request' | 'empty_input'      // from POST /api/parse
    | 'input_too_long' | 'no_items_found' | 'rate_limited' | 'server_error'
  message: string
}

export type ParseStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number; expectedRows: number }
  | { kind: 'error'; failure: ParseFailure }

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }

export type FieldErrors = {
  title?: string
  occurredOn?: string
  /** keyed by DraftItem.key */
  items: Record<string, { name?: string; amount?: string }>
  /** form-level, e.g. "Tambahkan minimal satu item." */
  form?: string
}

export type FocusRequest =
  | { target: 'item-name'; key: string }
  | { target: 'item-delete'; key: string }
  | { target: 'add-item' }
  | { target: 'element'; id: string }
  | null

/** The whole reducer state. Only `draft` is persisted. */
export type AddExpenseState = {
  draft: DraftExpense
  parse: ParseStatus
  save: SaveStatus
  errors: FieldErrors
  focus: FocusRequest
  /** true once the localStorage restore attempt has completed (blocks the write-before-read race) */
  restored: boolean
}
```

---

## 2. Draft persistence design

**Key:** `et:new-draft:<userId>` — per user, so a shared iPad does not leak one person's paste into another's `/new`. `userId` comes from the server component (F02 `requireUserId()`), so it is available before first paint.

**Serialisation shape** (`app/new/draftStorage.ts`):

```jsonc
{
  "v": 1,                    // envelope version — bumped when DraftExpense changes shape
  "savedAt": 1755590400000,  // epoch ms, for the 7-day expiry sweep
  "draft": { /* DraftExpense, version: 1 */ }
}
```

Two version numbers on purpose: `v` on the envelope is what the *loader* switches on; `draft.version` is what the *shape guard* asserts. Forward compatibility is a `MIGRATIONS: Record<number, (raw: unknown) => DraftExpense | null>` map — a future `v: 2` loader keeps a `1 → 2` entry, and any envelope with a `v` higher than we know about is discarded rather than guessed at (a newer tab must never be downgraded into corruption).

**Rules:**

| Event | Behaviour |
| --- | --- |
| Mount | Read once in an effect (never during render → no hydration mismatch). Discard if `v` is unknown, the shape is invalid, or `savedAt` is older than 7 days. |
| Any draft change | Write, debounced 400 ms. Wrapped in try/catch — a `QuotaExceededError` must never break typing. |
| Tab backgrounded | Flush immediately on `visibilitychange` / `pagehide`. iOS can freeze a tab without ever firing the debounce timer. |
| `rawText` > 20 000 chars | Truncate on write only (the in-memory draft keeps the full text). A paste that large is pathological; we protect the quota rather than the edge case. |
| Successful save | `clearDraft(userId)` **before** `router.push`, so a fast back-tap does not resurrect a saved draft. |
| Empty draft | `isDraftMeaningful()` is false → `removeItem` rather than write an empty envelope. |
| Restore with content | Show a dismissible line: *"Draf sebelumnya dipulihkan."* with a **Mulai baru** button. Silent restore of a stale draft is more confusing than a one-line notice. |

**Photos in the draft:** `StagedPhoto[]` is persisted verbatim — it is plain JSON by F06's design, which is exactly why it round-trips through `JSON.stringify` safely. The blobs already exist in Vercel Blob at that point (F06 uploads during picking, decision D-C), so a restored draft gives you back real thumbnails. Blobs from drafts that are never saved are F06's orphan sweep; the draft envelope is where their pathnames can be found.

---

## 3. Component breakdown

### Files I create

| Path | Kind | Responsibility |
| --- | --- | --- |
| `app/new/page.tsx` | Server | `requireUserId()`, `todayJakartaISO()`, render the client shell. |
| `app/new/AddExpenseClient.tsx` | Client | Reducer host, persistence effects, parse orchestration, save orchestration, viewport hook. |
| `app/new/draft.ts` | Pure | Types, `initialState`, `reducer`, `draftTotal`, `draftFromParsed`. |
| `app/new/draftStorage.ts` | Pure-ish | `loadDraft` / `saveDraft` / `clearDraft` / migrations / shape guard. |
| `app/new/validate.ts` | Pure | `validateDraft(draft) → { errors, focus, count } \| null`. |
| `app/new/copy.ts` | Pure | Every string F05 authors, plus the canonical placeholder. |
| `app/new/useParse.ts` | Client hook | `POST /api/parse`, abort, 35 s timeout, offline detect, local fallback, elapsed ms. |
| `app/new/PasteStage.tsx` | Client | Textarea, placeholder, error banner, skeleton, sticky **Rapikan**, *isi manual*. |
| `app/new/ReviewStage.tsx` | Client | Title/date fields, item list, add/remove, note, *Rapikan ulang*, PhotoPicker slot, sticky total + **Simpan**. |
| `app/new/ItemRow.tsx` | Client | One editable row: name, amount, category chip, delete ✕. |
| `app/new/ReviewSkeleton.tsx` | Client | Pulse skeleton sized from the paste's line count. |
| `app/new/StickyBar.tsx` | Client | Sticky footer chrome: safe-area padding, blur, `mt-auto`. |
| `lib/hooks/useVisualViewport.ts` | Client hook | Publishes `--app-h` / `--kb-inset` CSS vars. In `lib/` so F07 can reuse it. |

**Everything under `app/new/` and one hook. That is the whole surface.** An earlier draft of this
plan also specified `components/expense/AmountInput.tsx`, `CategoryChip.tsx` and `CategorySheet.tsx`.
Cross-reading F10's plan showed all three already exist there, built for the same reasons — so F05
builds none of them (Tasks 7 and 8 record the decision). F05 ships **zero** shared components, which
is the right answer: the design system owns the design system.

### What I take from F10 (do **not** rebuild)

| F10 primitive | What F05 uses it for |
| --- | --- |
| `Button` | Rapikan, Simpan, the inline re-parse confirm |
| `Field` + `Input` + `TextArea` | every labelled control on the page, with id/aria wiring |
| `MoneyInput` | the amount cell — IDR on blur, digits on focus, `parseIdrLoose` built in |
| `Chip` | the per-row category chip (emoji + label, never colour alone) |
| `CategoryPicker` | the 2×4 grid in a bottom sheet, closing itself after a pick |
| `Sheet` | indirectly, via `CategoryPicker` — a real `<dialog>` with `showModal()` |
| `Money` | the live total |
| `@theme` tokens, `press`, `CONTROL_CLASS`, the global 16 px input floor | everything else |

Exact signatures under Interfaces I consume.

### What I take from F06 (do **not** rebuild)

`<PhotoPicker mode="staged">` and the `StagedPhoto` type. F05 renders the picker, persists its `value` into the draft, and hands that array to `createExpense({ photos })` — F06's decision D-C, which uploads during picking so Simpan stays a single fast round trip. F05 contains **zero** upload, compression, or Blob code, and never imports `attachPhoto`.

---

## 4. iOS specifics — the non-negotiables

| Concern | Implementation |
| --- | --- |
| **Safari zoom-on-focus** | Every control comes from F10's `Input` / `TextArea` / `MoneyInput`, which share `CONTROL_CLASS` and sit under F10's global 16 px floor. F05 adds no bare `<input>` and overrides no font size downward. Task 14 audits this mechanically, because a single missed 14 px field ruins the flow with an un-undoable zoom. |
| **Keyboard covering the sticky bar** | `useVisualViewport()` writes `--app-h` from `visualViewport.height`. The page root is `height: var(--app-h, 100dvh)`, the scroller is `flex-1 overflow-y-auto`, the bar is `sticky bottom-0` **inside** the scroller. When the keyboard opens, `--app-h` shrinks and the bar rides above it. |
| **`100dvh` not `100vh`** | `100dvh` is only the fallback for the CSS var; `100vh` appears nowhere in this feature. |
| **Numeric keypad** | Amounts go through F10's `MoneyInput`, which uses `type="text"` + `inputMode="decimal"`. On iOS that is a digits-only pad; `type="number"` is never used because it rejects the `k`/`jt` suffixes outright. See Task 7 and Open question 3. |
| **`enterKeyHint`** | `"next"` on item name, `"done"` on title and on amounts (passed through `Input` / `MoneyInput`, which spread the native attributes). Not set on the paste textarea — Enter must insert a newline there. |
| **Safe area** | Sticky bar: `padding-bottom: max(env(safe-area-inset-bottom), 12px)`. |
| **Tap targets** | Delete ✕ and category chip are ≥44×44 px. The ✕ gets an expanded hit area via padding, not `transform: scale`. |
| **No swipe-to-delete** | Explicitly out of scope. Horizontal swipe on the web fights Safari's edge-back gesture and momentum scroll everywhere else. A visible ✕ is discoverable, accessible, and free. |
| **`-webkit-tap-highlight-color`** | F10's global reset owns this. |
| **Autofocus reality** | We `.focus()` the textarea on mount for a visible caret, but iOS will not raise the keyboard without a user gesture. We do not fight this and we do not fake it. If a draft was restored with content, we skip the focus entirely so the CTA is not pushed off-screen. |

---

## 5. Error handling matrix

F04 already degrades LLM failures into its deterministic parser and returns **200 with `degraded: true`**, so most "the LLM broke" cases never reach this table at all — they arrive as a normal review table plus a warning banner. What follows is everything that is left.

| Situation | Detection | User sees | Where they land |
| --- | --- | --- | --- |
| Offline | `navigator.onLine === false`, or a `TypeError` from `fetch` | `CLIENT_COPY.offline` — *"Tidak ada koneksi. Kami rapikan seadanya di perangkat kamu…"* | Review, pre-filled by the **local** `fallbackParse` |
| Timeout (>35 s client) | `AbortController` | `CLIENT_COPY.timeout` | Review, local fallback |
| 200 + `degraded: true` | F04's envelope | `DEGRADED_NOTICE` — *"Kami cuma bisa merapikan sebagian…"*, a `role="status"` not an alert, because nothing actually failed | Review, real data, every category `other` |
| 422 `no_items_found` | F04 found no priced line at all | F04's `message` | Review, **one blank row**, `rawText` kept — F04's plan asks for exactly this |
| 413 `input_too_long` | F04 | F04's `message` + a live character count | Paste (draft intact) |
| 429 `rate_limited` | F04's burst limiter | F04's `message` | Paste (draft intact) |
| 401 `unauthorized` | status 401 | F04's `message` + **Masuk lagi** → `/api/auth/signin` | Paste (draft intact, and **no** fallback table — signing in comes first) |
| 400 / 500 / unreadable body | anything else | F04's `message`, or `CLIENT_COPY.server_error` when the body could not be read | Review, local fallback |
| `ParsedExpense.safeParse` fails on a 200 | zod | `CLIENT_COPY.invalid_response` | Review, local fallback |
| Save failed | `createExpense` rejects | `SAVE_FAILED` inline above the button | Review, **draft untouched, nothing cleared** |

**Never a dead end, never `alert()`, never a stack trace.** A parse failure is a *degraded success*: the user always ends up in the review table with something to edit. That is the single most important behaviour in this plan. Note that F05 never builds a message out of an exception, so there is no path by which an internal string reaches the screen.

---

## 6. Validation rules (run on Simpan, not on every keystroke)

| Field | Rule | Message |
| --- | --- | --- |
| `title` | trimmed length 1–120 | `"Judul belum diisi."` / `"Judul terlalu panjang (maks 120)."` |
| `occurredOn` | `/^\d{4}-\d{2}-\d{2}$/` **and** UTC round-trips (rejects `2026-02-31`) | `"Tanggal tidak valid."` |
| `items` | ≥1, ≤50 | `"Tambahkan minimal satu item."` / `"Maksimal 50 item."` |
| `item.name` | trimmed length 1–120 | `"Nama item belum diisi."` |
| `item.amountIdr` | non-null integer, 0 ≤ n ≤ 1 000 000 000 | `"Nominal belum diisi."` / `"Nominal tidak dikenali."` |

The Simpan button is **never `disabled` for validation**. A disabled button on mobile is a dead end with no explanation — the user taps, nothing happens, and there is no affordance telling them why. Instead: tap → validate → render inline errors → move focus to the first invalid control → announce the count in a `role="alert"`. This is both better UX and better a11y. The button *is* disabled while `save.kind === 'saving'` (double-submit guard) and while F06 reports in-flight uploads.

Limits mirror §4.3 exactly, so the client never constructs a payload F03's Zod schema will reject.

---

## 7. Implementation tasks

Each task ends with a build/test gate and a commit. Work on a branch:

```bash
cd /home/miftah/expense-tracking
git checkout -b feat/f05-add-expense
```

---

### Task 0 — Preflight: verify every upstream symbol exists

F05 sits downstream of five features. Ten minutes here saves an afternoon of red squiggles.

```bash
cd /home/miftah/expense-tracking
cat > /tmp/f05-preflight.sh <<'SH'
set -u
fail=0
chk() { # chk <label> <file> <regex>
  if [ -f "$2" ] && grep -qE "$3" "$2"; then echo "PASS  $1"; else echo "FAIL  $1  ($2)"; fail=1; fi
}
chk "F03 CATEGORIES"           lib/categories.ts         'export const CATEGORIES'
chk "F03 CATEGORY_META"        lib/categories.ts         'export const CATEGORY_META'
chk "F03 ParsedExpense value"  lib/schema/expense.ts     'export const ParsedExpense'
chk "F03 ParsedExpense type"   lib/schema/expense.ts     'export type ParsedExpense'
chk "F03 formatIdr"            lib/format.ts             'export function formatIdr'
chk "F03 parseIdrLoose"        lib/format.ts             'parseIdrLoose'
chk "F03 todayJakartaISO"      lib/format.ts             'todayJakartaISO'
chk "F02 requireUserId"        lib/auth.ts               'requireUserId'
chk "F03 createExpense"        app/actions/expenses.ts   'export async function createExpense'
chk "F03 createExpense photos" lib/schema/expense.ts     'photos'
chk "F04 /api/parse"           app/api/parse/route.ts    'export async function POST'
chk "F04 fallbackParse"        lib/llm/fallbackParse.ts  'export function fallbackParse'
chk "F04 ParseSource"          lib/llm/types.ts          'export type ParseSource'
chk "F06 StagedPhoto"          lib/photos/types.ts       'export type StagedPhoto'
chk "F06 PhotoPicker"          components/photos/PhotoPicker.tsx 'export function PhotoPicker'
chk "F06 staged mode"          components/photos/PhotoPicker.tsx "mode: 'staged'"
chk "F06 onBusyChange"         components/photos/PhotoPicker.tsx 'onBusyChange'
chk "F10 Button"               components/ui/Button.tsx        'export function Button'
chk "F10 Sheet showModal"      components/ui/Sheet.tsx         'showModal'
chk "F10 Chip"                 components/ui/Chip.tsx          'export function Chip'
chk "F10 CategoryPicker"       components/ui/CategoryPicker.tsx 'export function CategoryPicker'
chk "F10 Field"                components/ui/Field.tsx         'export function Field'
chk "F10 Input"                components/ui/Field.tsx         'export function Input'
chk "F10 TextArea"             components/ui/Field.tsx         'export function TextArea'
chk "F10 MoneyInput"           components/ui/MoneyInput.tsx    'export function MoneyInput'
chk "F10 Money"                components/ui/Money.tsx         'export function Money'
# F05's focus manager targets controls by id, and passes refs into Input/TextArea.
chk "F10 Input honours id"     components/ui/Field.tsx         'id \?\?|id=\{id'
chk "F10 Input forwards ref"   components/ui/Field.tsx         'forwardRef'

# fallbackParse runs in the BROWSER on the offline path. A stray `server-only` anywhere in
# its module graph turns that rescue into a build error.
if grep -q "server-only" lib/llm/fallbackParse.ts 2>/dev/null; then
  echo "FAIL  F04 fallbackParse imports server-only (must stay client-importable)"; fail=1
else
  echo "PASS  F04 fallbackParse is client-importable"
fi
exit $fail
SH
bash /tmp/f05-preflight.sh
```

Expected output when all upstream work has landed — 23 `PASS` lines and exit code 0.

Failures **expected today**, all tracked under Contract deltas: `F03 createExpense photos` (F03 still
declares `photoIds`), `F06 onBusyChange`, and possibly the two `F10 Input` rows. Each needs an
upstream one-liner, not a workaround here. Task 9 documents the fallback if `Input` turns out not to
forward refs.

Any other `FAIL` is an integration mismatch. **Do not paper over it with a local re-implementation.** Take it to Contract deltas / Open questions and resolve it with the owning feature. The only sanctioned unblock is a temporary `app/new/_shims.ts` re-exporting a stub with a `// TODO(F05): remove when Fxx lands` comment, tracked in the PR description.

```bash
git add -A && git commit -m "chore(f05): preflight contract check for /new"
```

---

### Task 1 — Route skeleton so the build stays green

Create the server page and a placeholder client so every later task can be verified with `npm run build`.

**`app/new/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { requireUserId } from '@/lib/auth'
import { todayJakartaISO } from '@/lib/format'
import { AddExpenseClient } from './AddExpenseClient'

export const metadata: Metadata = { title: 'Tambah pengeluaran' }
// The Jakarta "today" must be computed per request, never at build time.
export const dynamic = 'force-dynamic'

export default async function NewExpensePage() {
  // Middleware already guards /new, but F02 is explicit that middleware is a convenience
  // redirect and requireUserId() is the real boundary. Call it here regardless.
  const userId = await requireUserId()
  return <AddExpenseClient userId={userId} todayISO={todayJakartaISO()} />
}
```

**`app/new/AddExpenseClient.tsx`** — placeholder for now, replaced in Task 13:

```tsx
'use client'
export function AddExpenseClient({ userId, todayISO }: { userId: string; todayISO: string }) {
  return <div className="p-4 text-[16px]">{userId} · {todayISO}</div>
}
```

```bash
npm run build
```

Expected: build succeeds, route table lists `ƒ /new` (dynamic).

```bash
git add -A && git commit -m "feat(f05): /new route skeleton"
```

---

### Task 2 — `app/new/draft.ts`: types + reducer

The whole state machine, pure and testable.

```tsx
import { CATEGORIES, type Category } from '@/lib/categories'
import type { ParsedExpense } from '@/lib/schema/expense' // F03 merges the const and the inferred type
import type { ParseSource } from '@/lib/llm/types'
import type { StagedPhoto } from '@/lib/photos/types'

export const DRAFT_VERSION = 1 as const
export const MAX_ITEMS = 50
export const MAX_NAME = 120
export const MAX_AMOUNT = 1_000_000_000
export const DEFAULT_CATEGORY: Category = 'other'

export type DraftItem = {
  key: string
  name: string
  amountIdr: number | null
  amountRaw: string | null
  category: Category
}

/** F04's ParseSource is 'llm' | 'llm_repair' | 'fallback'; we add the manual escape hatch. */
export type DraftSource = ParseSource | 'manual'

export type DraftExpense = {
  version: typeof DRAFT_VERSION
  stage: 'paste' | 'review'
  rawText: string
  title: string
  occurredOn: string
  items: DraftItem[]
  note: string
  photos: StagedPhoto[]
  source: DraftSource | null
  touchedAt: number
}

export type ParseFailure = {
  code:
    | 'offline' | 'timeout' | 'invalid_response'
    | 'unauthorized' | 'bad_request' | 'empty_input'
    | 'input_too_long' | 'no_items_found' | 'rate_limited' | 'server_error'
  message: string
}

export type ParseStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number; expectedRows: number }
  | { kind: 'error'; failure: ParseFailure }

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }

export type FieldErrors = {
  title?: string
  occurredOn?: string
  items: Record<string, { name?: string; amount?: string }>
  form?: string
}

export type FocusRequest =
  | { target: 'item-name'; key: string }
  | { target: 'item-delete'; key: string }
  | { target: 'add-item' }
  | { target: 'element'; id: string }
  | null

export type AddExpenseState = {
  draft: DraftExpense
  parse: ParseStatus
  save: SaveStatus
  errors: FieldErrors
  focus: FocusRequest
  restored: boolean
}

export const NO_ERRORS: FieldErrors = { items: {} }

let keySeq = 0
export function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  keySeq += 1
  return `k${Date.now().toString(36)}-${keySeq}`
}

export function emptyItem(category: Category = DEFAULT_CATEGORY): DraftItem {
  return { key: newKey(), name: '', amountIdr: null, amountRaw: null, category }
}

export function initialDraft(todayISO: string): DraftExpense {
  return {
    version: DRAFT_VERSION,
    stage: 'paste',
    rawText: '',
    title: '',
    occurredOn: todayISO,
    items: [],
    note: '',
    photos: [],
    source: null,
    touchedAt: Date.now(),
  }
}

export function initialState(todayISO: string): AddExpenseState {
  return {
    draft: initialDraft(todayISO),
    parse: { kind: 'idle' },
    save: { kind: 'idle' },
    errors: NO_ERRORS,
    focus: null,
    restored: false,
  }
}

/** Whole-rupiah sum of everything currently parseable. Unparseable rows contribute 0. */
export function draftTotal(items: DraftItem[]): number {
  let total = 0
  for (const item of items) total += item.amountIdr ?? 0
  return total
}

/** How many skeleton rows to show, guessed from the paste so the table does not jump. */
export function estimateRows(rawText: string): number {
  const lines = rawText.split('\n').filter((l) => l.trim().length > 0).length
  return Math.min(8, Math.max(3, lines - 1))
}

function safeCategory(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : DEFAULT_CATEGORY
}

/** ParsedExpense (the F04↔F05 boundary type) → editable draft fields. */
export function draftFromParsed(
  parsed: ParsedExpense,
  base: DraftExpense,
  source: DraftSource,
): DraftExpense {
  return {
    ...base,
    stage: 'review',
    title: parsed.title,
    occurredOn: parsed.occurred_on,
    items: parsed.items.slice(0, MAX_ITEMS).map((item) => ({
      key: newKey(),
      name: item.name,
      amountIdr: item.amount_idr,
      amountRaw: null,
      category: safeCategory(item.category),
    })),
    source,
    touchedAt: Date.now(),
  }
}

export type Action =
  | { type: 'restore'; draft: DraftExpense }
  | { type: 'restore_none' }
  | { type: 'set_raw'; value: string }
  | { type: 'parse_start' }
  | { type: 'parse_success'; parsed: ParsedExpense; source: DraftSource }
  | { type: 'parse_failure'; failure: ParseFailure; fallback?: ParsedExpense | null }
  | { type: 'manual_entry' }
  | { type: 'back_to_paste' }
  | { type: 'set_title'; value: string }
  | { type: 'set_date'; value: string }
  | { type: 'set_note'; value: string }
  | { type: 'set_item_name'; key: string; value: string }
  | { type: 'set_item_amount'; key: string; value: number | null }
  | { type: 'item_amount_unparsed'; key: string; rawText: string }
  | { type: 'set_item_category'; key: string; value: Category }
  | { type: 'add_item' }
  | { type: 'remove_item'; key: string }
  | { type: 'set_photos'; photos: StagedPhoto[] }
  | { type: 'save_start' }
  | { type: 'save_failure'; message: string }
  | { type: 'invalid'; errors: FieldErrors; focus: FocusRequest }
  | { type: 'clear_focus' }
  | { type: 'reset'; todayISO: string }

function touch(draft: DraftExpense, patch: Partial<DraftExpense>): DraftExpense {
  return { ...draft, ...patch, touchedAt: Date.now() }
}

function mapItem(
  draft: DraftExpense,
  key: string,
  fn: (item: DraftItem) => DraftItem,
): DraftExpense {
  return touch(draft, { items: draft.items.map((i) => (i.key === key ? fn(i) : i)) })
}

/** Clear the error attached to one item field as soon as the user edits it. */
function clearItemError(errors: FieldErrors, key: string, field: 'name' | 'amount'): FieldErrors {
  const current = errors.items[key]
  if (!current || current[field] === undefined) return errors
  const next = { ...current }
  delete next[field]
  const items = { ...errors.items }
  if (Object.keys(next).length === 0) delete items[key]
  else items[key] = next
  return { ...errors, items, form: undefined }
}

export function reducer(state: AddExpenseState, action: Action): AddExpenseState {
  switch (action.type) {
    case 'restore':
      return { ...state, draft: action.draft, restored: true }

    case 'restore_none':
      return { ...state, restored: true }

    case 'set_raw':
      return { ...state, draft: touch(state.draft, { rawText: action.value }), parse: { kind: 'idle' } }

    case 'parse_start':
      return {
        ...state,
        parse: { kind: 'loading', startedAt: Date.now(), expectedRows: estimateRows(state.draft.rawText) },
        save: { kind: 'idle' },
      }

    case 'parse_success':
      return {
        ...state,
        draft: draftFromParsed(action.parsed, state.draft, action.source),
        parse: { kind: 'idle' },
        errors: NO_ERRORS,
        focus: null,
      }

    case 'parse_failure': {
      // Degraded success: if we salvaged anything at all, put the user in the table.
      if (action.fallback) {
        return {
          ...state,
          draft: draftFromParsed(action.fallback, state.draft, 'fallback'),
          parse: { kind: 'error', failure: action.failure },
          errors: NO_ERRORS,
        }
      }
      // F04's 'no_items_found' arrives with nothing to show. Its plan asks for the manual
      // escape hatch rather than a dead end: one blank row, rawText kept.
      if (action.failure.code === 'no_items_found') {
        return {
          ...state,
          draft: touch(state.draft, { stage: 'review', source: 'manual', items: [emptyItem()] }),
          parse: { kind: 'error', failure: action.failure },
          errors: NO_ERRORS,
        }
      }
      // unauthorized / input_too_long / rate_limited: stay on paste, draft intact.
      return { ...state, parse: { kind: 'error', failure: action.failure } }
    }

    case 'manual_entry':
      return {
        ...state,
        draft: touch(state.draft, {
          stage: 'review',
          source: state.draft.source ?? 'manual',
          items: state.draft.items.length > 0 ? state.draft.items : [emptyItem()],
        }),
        parse: { kind: 'idle' },
        errors: NO_ERRORS,
      }

    case 'back_to_paste':
      return { ...state, draft: touch(state.draft, { stage: 'paste' }), parse: { kind: 'idle' } }

    case 'set_title':
      return {
        ...state,
        draft: touch(state.draft, { title: action.value }),
        errors: { ...state.errors, title: undefined, form: undefined },
      }

    case 'set_date':
      return {
        ...state,
        draft: touch(state.draft, { occurredOn: action.value }),
        errors: { ...state.errors, occurredOn: undefined, form: undefined },
      }

    case 'set_note':
      return { ...state, draft: touch(state.draft, { note: action.value }) }

    case 'set_item_name':
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (i) => ({ ...i, name: action.value.slice(0, MAX_NAME) })),
        errors: clearItemError(state.errors, action.key, 'name'),
      }

    // F10's MoneyInput owns the text state and runs parseIdrLoose on blur, so manual entry
    // is exactly as forgiving as the LLM path ("45k", "45rb", "1,5jt", "Rp 38.500").
    // It hands us either a number or nothing; we clamp, because the schema cap is ours.
    case 'set_item_amount': {
      const value =
        action.value === null || !Number.isInteger(action.value) || action.value < 0 || action.value > MAX_AMOUNT
          ? null
          : action.value
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (i) => ({ ...i, amountIdr: value, amountRaw: null })),
        errors: clearItemError(state.errors, action.key, 'amount'),
      }
    }

    case 'item_amount_unparsed':
      // Keep what they typed so the inline error can quote it back at them.
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (i) => ({
          ...i,
          amountIdr: null,
          amountRaw: action.rawText,
        })),
      }

    case 'set_item_category':
      return { ...state, draft: mapItem(state.draft, action.key, (i) => ({ ...i, category: action.value })) }

    case 'add_item': {
      if (state.draft.items.length >= MAX_ITEMS) {
        return { ...state, errors: { ...state.errors, form: `Maksimal ${MAX_ITEMS} item.` } }
      }
      // Inherit the previous row's category: consecutive lines are usually the same kind of spend.
      const previous = state.draft.items[state.draft.items.length - 1]
      const item = emptyItem(previous?.category ?? DEFAULT_CATEGORY)
      return {
        ...state,
        draft: touch(state.draft, { items: [...state.draft.items, item] }),
        errors: { ...state.errors, form: undefined },
        focus: { target: 'item-name', key: item.key },
      }
    }

    case 'remove_item': {
      const index = state.draft.items.findIndex((i) => i.key === action.key)
      if (index === -1) return state
      const items = state.draft.items.filter((i) => i.key !== action.key)
      // Focus must be resolved from the PRE-splice array or it lands on the wrong row.
      const next = state.draft.items[index + 1] ?? state.draft.items[index - 1]
      const focus: FocusRequest =
        items.length === 0 || !next ? { target: 'add-item' } : { target: 'item-delete', key: next.key }
      const remaining = { ...state.errors.items }
      delete remaining[action.key]
      return {
        ...state,
        draft: touch(state.draft, { items }),
        errors: { ...state.errors, items: remaining, form: undefined },
        focus,
      }
    }

    case 'set_photos':
      return { ...state, draft: touch(state.draft, { photos: action.photos }) }

    case 'save_start':
      return { ...state, save: { kind: 'saving' }, errors: NO_ERRORS }

    case 'save_failure':
      return { ...state, save: { kind: 'error', message: action.message } }

    case 'invalid':
      return { ...state, save: { kind: 'idle' }, errors: action.errors, focus: action.focus }

    case 'clear_focus':
      return { ...state, focus: null }

    case 'reset':
      return { ...initialState(action.todayISO), restored: true }

    default: {
      const never: never = action
      return never
    }
  }
}
```

**Verify:**

```bash
npx tsc --noEmit
```

Expected: no output (exit 0).

```bash
git add -A && git commit -m "feat(f05): draft types + reducer"
```

---

### Task 3 — `app/new/draftStorage.ts`: versioned localStorage codec

```tsx
import { DRAFT_VERSION, type DraftExpense } from './draft'

const PREFIX = 'et:new-draft'
export const ENVELOPE_VERSION = 1
export const MAX_RAW_CHARS = 20_000
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function draftKey(userId: string): string {
  return `${PREFIX}:${userId}`
}

type Envelope = { v: number; savedAt: number; draft: DraftExpense }

/**
 * Forward compatibility: a future ENVELOPE_VERSION 2 keeps a `1` entry here that upgrades
 * the old shape. An envelope with a version we do not know about is discarded, never
 * guessed at — a newer tab must not be downgraded into corruption.
 */
const MIGRATIONS: Record<number, (raw: unknown) => DraftExpense | null> = {}

function isDraftShape(value: unknown): value is DraftExpense {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  if (d.version !== DRAFT_VERSION) return false
  if (d.stage !== 'paste' && d.stage !== 'review') return false
  if (typeof d.rawText !== 'string' || typeof d.title !== 'string') return false
  if (typeof d.occurredOn !== 'string' || typeof d.note !== 'string') return false
  if (!Array.isArray(d.items) || !Array.isArray(d.photos)) return false
  for (const item of d.items) {
    if (typeof item !== 'object' || item === null) return false
    const i = item as Record<string, unknown>
    if (typeof i.key !== 'string' || typeof i.name !== 'string') return false
    if (typeof i.category !== 'string') return false
    if (i.amountIdr !== null && typeof i.amountIdr !== 'number') return false
    if (i.amountRaw !== null && typeof i.amountRaw !== 'string') return false
  }
  for (const photo of d.photos) {
    if (typeof photo !== 'object' || photo === null) return false
    const p = photo as Record<string, unknown>
    if (typeof p.blobUrl !== 'string' || typeof p.blobPathname !== 'string') return false
  }
  return true
}

/** True when the draft holds something a user would be upset to lose. */
export function isDraftMeaningful(draft: DraftExpense): boolean {
  return (
    draft.rawText.trim().length > 0 ||
    draft.title.trim().length > 0 ||
    draft.note.trim().length > 0 ||
    draft.photos.length > 0 ||
    draft.items.some((i) => i.name.trim().length > 0 || i.amountIdr !== null)
  )
}

export function loadDraft(userId: string): DraftExpense | null {
  if (typeof window === 'undefined') return null
  let text: string | null = null
  try {
    text = window.localStorage.getItem(draftKey(userId))
  } catch {
    return null // Safari private mode / storage disabled
  }
  if (!text) return null

  let envelope: Envelope
  try {
    envelope = JSON.parse(text) as Envelope
  } catch {
    clearDraft(userId)
    return null
  }
  if (typeof envelope?.savedAt !== 'number' || Date.now() - envelope.savedAt > DRAFT_TTL_MS) {
    clearDraft(userId)
    return null
  }

  let draft: unknown = envelope.draft
  if (envelope.v !== ENVELOPE_VERSION) {
    const migrate = MIGRATIONS[envelope.v]
    if (!migrate) {
      clearDraft(userId)
      return null
    }
    draft = migrate(envelope.draft)
  }
  if (!isDraftShape(draft)) {
    clearDraft(userId)
    return null
  }
  return draft
}

export function saveDraft(userId: string, draft: DraftExpense): void {
  if (typeof window === 'undefined') return
  if (!isDraftMeaningful(draft)) {
    clearDraft(userId)
    return
  }
  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    savedAt: Date.now(),
    // Truncate only what we persist; the in-memory draft keeps the full paste.
    draft: { ...draft, rawText: draft.rawText.slice(0, MAX_RAW_CHARS) },
  }
  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(envelope))
  } catch {
    // QuotaExceededError must never break typing. Losing the draft beats a frozen keyboard.
  }
}

export function clearDraft(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    /* ignore */
  }
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): versioned localStorage draft codec"
```

---

### Task 4 — `app/new/validate.ts` + unit tests

```tsx
import { MAX_AMOUNT, MAX_ITEMS, MAX_NAME, NO_ERRORS } from './draft'
import type { DraftExpense, FieldErrors, FocusRequest } from './draft'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  // The round-trip rejects 2026-02-31, which Date happily rolls over into March.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export type ValidationResult = { errors: FieldErrors; focus: FocusRequest; count: number }

/** Returns null when the draft is safe to send to createExpense. */
export function validateDraft(draft: DraftExpense): ValidationResult | null {
  const errors: FieldErrors = { items: {} }
  let focus: FocusRequest = null
  let count = 0

  const title = draft.title.trim()
  if (title.length === 0) errors.title = 'Judul belum diisi.'
  else if (title.length > MAX_NAME) errors.title = `Judul terlalu panjang (maks ${MAX_NAME}).`
  if (errors.title) {
    count += 1
    focus = { target: 'element', id: 'draft-title' }
  }

  if (!isValidIsoDate(draft.occurredOn)) {
    errors.occurredOn = 'Tanggal tidak valid.'
    count += 1
    focus ??= { target: 'element', id: 'draft-date' }
  }

  if (draft.items.length === 0) {
    errors.form = 'Tambahkan minimal satu item.'
    count += 1
    focus ??= { target: 'add-item' }
  } else if (draft.items.length > MAX_ITEMS) {
    errors.form = `Maksimal ${MAX_ITEMS} item.`
    count += 1
  }

  for (const item of draft.items) {
    const itemErrors: { name?: string; amount?: string } = {}
    const name = item.name.trim()
    if (name.length === 0) itemErrors.name = 'Nama item belum diisi.'
    else if (name.length > MAX_NAME) itemErrors.name = `Maks ${MAX_NAME} karakter.`

    if (item.amountIdr === null) {
      itemErrors.amount =
        item.amountRaw === null ? 'Nominal belum diisi.' : `"${item.amountRaw}" tidak dikenali sebagai nominal.`
    } else if (!Number.isInteger(item.amountIdr) || item.amountIdr < 0) {
      itemErrors.amount = 'Nominal harus angka bulat ≥ 0.'
    } else if (item.amountIdr > MAX_AMOUNT) {
      itemErrors.amount = 'Nominal terlalu besar.'
    }

    if (itemErrors.name || itemErrors.amount) {
      errors.items[item.key] = itemErrors
      count += itemErrors.name && itemErrors.amount ? 2 : 1
      focus ??= { target: 'item-name', key: item.key }
    }
  }

  if (count === 0) return null
  return { errors: { ...NO_ERRORS, ...errors }, focus, count }
}

export function errorSummary(count: number): string {
  return count === 1 ? 'Ada 1 isian yang perlu diperbaiki.' : `Ada ${count} isian yang perlu diperbaiki.`
}
```

**Unit tests** — `app/new/__tests__/draft.test.ts`. F04's plan already sets up vitest; reuse that config.

```ts
import { describe, expect, it } from 'vitest'
import { emptyItem, initialState, reducer, draftTotal, estimateRows } from '../draft'
import { validateDraft, isValidIsoDate } from '../validate'

const TODAY = '2026-08-19'

describe('reducer', () => {
  it('add_item appends and asks for focus on the new name field', () => {
    const s1 = reducer(initialState(TODAY), { type: 'manual_entry' })
    const s2 = reducer(s1, { type: 'add_item' })
    expect(s2.draft.items).toHaveLength(2)
    expect(s2.focus).toEqual({ target: 'item-name', key: s2.draft.items[1].key })
  })

  it('remove_item moves focus to the following row', () => {
    let s = reducer(initialState(TODAY), { type: 'manual_entry' })
    s = reducer(s, { type: 'add_item' })
    s = reducer(s, { type: 'add_item' })
    const [a, b] = s.draft.items
    s = reducer(s, { type: 'remove_item', key: a.key })
    expect(s.draft.items).toHaveLength(2)
    expect(s.focus).toEqual({ target: 'item-delete', key: b.key })
  })

  it('set_item_amount clamps out-of-range values to null', () => {
    let s = reducer(initialState(TODAY), { type: 'manual_entry' })
    const key = s.draft.items[0].key
    s = reducer(s, { type: 'set_item_amount', key, value: 45_000 })
    expect(s.draft.items[0].amountIdr).toBe(45_000)
    s = reducer(s, { type: 'set_item_amount', key, value: 2_000_000_000 })
    expect(s.draft.items[0].amountIdr).toBeNull()
  })

  it('item_amount_unparsed keeps the raw text for the error message', () => {
    let s = reducer(initialState(TODAY), { type: 'manual_entry' })
    const key = s.draft.items[0].key
    s = reducer(s, { type: 'item_amount_unparsed', key, rawText: 'dua puluh' })
    expect(s.draft.items[0].amountRaw).toBe('dua puluh')
    expect(validateDraft(s.draft)?.errors.items[key]?.amount).toContain('dua puluh')
  })

  it('parse_failure with a fallback still lands in review', () => {
    const failure = { code: 'offline' as const, message: 'Tidak ada koneksi.' }
    const s = reducer(initialState(TODAY), {
      type: 'parse_failure',
      failure,
      fallback: { title: 'x', occurred_on: TODAY, items: [{ name: 'a', amount_idr: 1, category: 'other' }] },
    })
    expect(s.draft.stage).toBe('review')
    expect(s.parse).toEqual({ kind: 'error', failure })
  })

  it('no_items_found opens the manual table with one blank row', () => {
    const s = reducer(initialState(TODAY), {
      type: 'parse_failure',
      failure: { code: 'no_items_found', message: 'Nggak ketemu angkanya.' },
    })
    expect(s.draft.stage).toBe('review')
    expect(s.draft.items).toHaveLength(1)
  })

  it('unauthorized keeps the user on the paste stage', () => {
    const s = reducer(initialState(TODAY), {
      type: 'parse_failure',
      failure: { code: 'unauthorized', message: 'Sesi kamu habis.' },
    })
    expect(s.draft.stage).toBe('paste')
  })
})

describe('helpers', () => {
  it('draftTotal ignores unparseable rows', () => {
    expect(draftTotal([{ ...emptyItem(), amountIdr: 100 }, emptyItem()])).toBe(100)
  })
  it('estimateRows clamps to 3..8', () => {
    expect(estimateRows('a\nb')).toBe(3)
    expect(estimateRows(Array(30).fill('x').join('\n'))).toBe(8)
  })
  it('isValidIsoDate rejects 2026-02-31', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-08-18')).toBe(true)
  })
  it('validateDraft rejects an empty draft', () => {
    const result = validateDraft(initialState(TODAY).draft)
    expect(result?.errors.title).toBeDefined()
    expect(result?.errors.form).toBe('Tambahkan minimal satu item.')
  })
})
```

```bash
npx vitest run app/new/__tests__/draft.test.ts
```

Expected: `Test Files 1 passed`, `Tests 11 passed`.

```bash
git add -A && git commit -m "feat(f05): draft validation + reducer unit tests"
```

---

### Task 5 — `lib/hooks/useVisualViewport.ts`: keyboard-aware viewport

This is the whole answer to "the sticky save button must not be covered by the keyboard". iOS does **not** shrink the layout viewport when the keyboard opens — only the *visual* viewport shrinks — so `100dvh` alone is not enough.

```tsx
'use client'
import { useEffect } from 'react'

/**
 * Publishes two CSS custom properties on <html>:
 *   --app-h     usable height in px (visual viewport, i.e. minus the iOS keyboard)
 *   --kb-inset  height of the keyboard overlay in px, 0 when closed
 * Lives in lib/hooks so F07's detail page can reuse it.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport

    const apply = () => {
      const height = vv ? vv.height : window.innerHeight
      root.style.setProperty('--app-h', `${Math.round(height)}px`)
      const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
    }

    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    window.addEventListener('resize', apply)

    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--app-h')
      root.style.removeProperty('--kb-inset')
    }
  }, [])
}
```

**`app/new/StickyBar.tsx`** — the footer chrome both stages share:

```tsx
'use client'
import type { ReactNode } from 'react'

export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-20 mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 pt-3 backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      {children}
    </div>
  )
}
```

`mt-auto` + `sticky bottom-0` inside a `flex flex-col` scroller pins the bar to the bottom on short pages and floats it over content on long ones — with no `position: fixed`, so there is nothing to manually offset.

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): visual-viewport hook + sticky bar chrome"
```

---

### Task 6 — `app/new/useParse.ts`: the parse call

Built against **F04's published wire contract**: 200 returns the envelope `{ ok: true, expense, source, degraded }`, every error returns `{ ok: false, error: { code, message } }` where `message` is Indonesian copy F04 guarantees is safe to render verbatim. F05 therefore does **not** invent copy for server-side failures — it renders F04's. It only authors the handful the browser detects on its own.

```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ParsedExpense } from '@/lib/schema/expense'
import { fallbackParse } from '@/lib/llm/fallbackParse'
import type { ParseSource } from '@/lib/llm/types'
import { CLIENT_COPY } from './copy'
import type { ParseFailure } from './draft'

/** F04's route declares maxDuration 60 with an internal 45 s deadline. We stop waiting at 35 s:
 *  past that the user has given up, and we have a local fallback to offer them instead. */
const CLIENT_TIMEOUT_MS = 35_000
export const SLOW_HINT_MS = 8_000

export type ParseOutcome =
  | { ok: true; parsed: ParsedExpense; source: ParseSource; degraded: boolean }
  | { ok: false; failure: ParseFailure; fallback: ParsedExpense | null }

type ApiOk = { ok: true; expense: unknown; source: ParseSource; degraded: boolean }
type ApiErr = { ok: false; error: { code: string; message: string } }

const KNOWN_CODES = new Set([
  'unauthorized', 'bad_request', 'empty_input',
  'input_too_long', 'no_items_found', 'rate_limited', 'server_error',
])

/**
 * Best-effort local rescue. This is the whole reason the offline path is not a dead end:
 * with no network there is no server to ask for a fallback, and F04 keeps fallbackParse
 * pure and free of `server-only` precisely so it can run in the browser.
 */
function localFallback(rawText: string, todayISO: string): ParsedExpense | null {
  try {
    const parsed = fallbackParse({ rawText, todayISO })
    if (!parsed) return null
    const check = ParsedExpense.safeParse(parsed)
    return check.success ? check.data : null
  } catch {
    return null
  }
}

export function useParse() {
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!running) {
      setElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 500)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => () => abortRef.current?.abort(), [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }, [])

  const run = useCallback(async (rawText: string, todayISO: string): Promise<ParseOutcome> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        ok: false,
        failure: { code: 'offline', message: CLIENT_COPY.offline },
        fallback: localFallback(rawText, todayISO),
      }
    }

    const controller = new AbortController()
    abortRef.current = controller
    const timer = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
    setRunning(true)

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, todayISO }),
        signal: controller.signal,
      })

      const body = (await response.json().catch(() => null)) as ApiOk | ApiErr | null

      if (!response.ok || !body || body.ok !== true) {
        const raw = (body as ApiErr | null)?.error
        const code = raw && KNOWN_CODES.has(raw.code) ? (raw.code as ParseFailure['code']) : 'server_error'
        return {
          ok: false,
          // F04's message is user-facing Indonesian by contract. We only substitute our own
          // copy when the body was unreadable (proxy error page, truncated response).
          failure: { code, message: raw?.message || CLIENT_COPY.server_error },
          // unauthorized must NOT drop the user into a table — signing in comes first.
          fallback: code === 'unauthorized' ? null : localFallback(rawText, todayISO),
        }
      }

      const check = ParsedExpense.safeParse(body.expense)
      if (!check.success) {
        return {
          ok: false,
          failure: { code: 'invalid_response', message: CLIENT_COPY.invalid_response },
          fallback: localFallback(rawText, todayISO),
        }
      }
      return { ok: true, parsed: check.data, source: body.source, degraded: body.degraded }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const code: ParseFailure['code'] = aborted ? 'timeout' : offline ? 'offline' : 'server_error'
      return {
        ok: false,
        failure: { code, message: CLIENT_COPY[code] },
        fallback: localFallback(rawText, todayISO),
      }
    } finally {
      window.clearTimeout(timer)
      abortRef.current = null
      setRunning(false)
    }
  }, [])

  return { run, cancel, running, elapsedMs }
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): /api/parse hook with abort, offline + fallback handling"
```

---

### Task 7 — Adopt F10's `MoneyInput`. Do **not** build an `AmountInput`.

My first draft of this plan specified a `components/expense/AmountInput.tsx` that formats IDR on
blur and shows raw digits on focus. **F10 already ships exactly that** as `components/ui/MoneyInput.tsx`,
with the same reasoning written into its own comments (`type="text"` because a `number` input rejects
the `k`/`jt` suffixes; plain digits while focused because editing thousands separators on a phone
keyboard is miserable). Building a second one would be pure drift.

So F05 builds nothing here. It consumes:

```ts
// components/ui/MoneyInput.tsx  (F10)
export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  value: number | null                          // whole rupiah, or null when empty
  onValueChange: (value: number | null) => void // fires on blur when the parse succeeded, and on clear
  onParseError?: (rawText: string) => void      // fires on blur when the text could not be parsed
  className?: string
}
```

That maps one-to-one onto the two reducer actions from Task 2:

| MoneyInput callback | dispatch |
| --- | --- |
| `onValueChange(n)` | `{ type: 'set_item_amount', key, value: n }` |
| `onParseError(raw)` | `{ type: 'item_amount_unparsed', key, rawText: raw }` |

**On `inputMode`.** The brief mandates `inputMode="numeric"`; F10 ships `inputMode="decimal"`. F05
accepts F10's choice rather than overriding it on one screen. On iOS both render a digits-only pad
with no letters, so neither one lets a user literally type `45k` on the device — the difference is
only the separator key. The forgiving `45k` / `45rb` / `1,5jt` handling is preserved where it
actually matters (paste, re-parse, hardware keyboards, and pasting into the field), because F10 runs
`parseIdrLoose` on blur just as this plan required. Recorded in Open questions.

**Verify** (this is a read, not a change — confirm before writing `ItemRow`):

```bash
grep -n 'onValueChange\|onParseError\|inputMode' components/ui/MoneyInput.tsx
```

Expected: the three props above, and `inputMode="decimal"`.

```bash
git commit --allow-empty -m "chore(f05): adopt F10 MoneyInput, drop planned AmountInput"
```

---

### Task 8 — Adopt F10's `Chip` + `CategoryPicker`. Do **not** build a `CategorySheet`.

Same story. F10's `Chip` is already category-specific, and `CategoryPicker` is already the 2×4 grid
in a `Sheet`, closing itself after a pick:

```ts
// components/ui/Chip.tsx  (F10)
export interface ChipProps {
  category: Category
  size?: 'sm' | 'md'          // 'md' = standalone control → what a row uses
  onClick?: () => void        // present ⇒ renders a <button>
  selected?: boolean
  labelHidden?: boolean
  className?: string
}

// components/ui/CategoryPicker.tsx  (F10)
export interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  value?: Category | null
  onSelect: (category: Category) => void   // the picker closes itself after this
  title?: string                            // default "Pilih kategori"
}
```

Two consequences for F05's earlier design, both fine:

1. **The picker closes itself.** F05 no longer needs a `sheetKey → onClose` dance; it sets
   `sheetKey` on chip tap and clears it in `onClose`.
2. **`Chip` does not forward a ref.** My design returned focus to the triggering chip after the
   sheet closed. F10's `Sheet` is a real `<dialog>` opened with `showModal()`, and the browser
   restores focus to the previously focused element on `close()` — which *is* the chip. Verify this
   in the Task 15 sweep rather than adding a ref F10 does not expose; if it does not hold, ask F10
   for `ref` forwarding on `Chip` rather than re-implementing the picker.

**Also confirm F10's `Sheet` behaviour** that F05 depends on — it uses `<dialog>` + `showModal()`,
which gives the focus trap, Escape, and backdrop dismissal natively, plus an explicit body-scroll
lock. Nothing for F05 to add.

```bash
grep -n 'showModal\|onClose\|lockBody' components/ui/Sheet.tsx
grep -n 'grid-cols-2' components/ui/CategoryPicker.tsx
```

Expected: `showModal()` present, `lockBody()` present, `grid-cols-2` present (the 2×4 grid).

```bash
git commit --allow-empty -m "chore(f05): adopt F10 Chip + CategoryPicker, drop planned CategorySheet"
```

---

### Task 9 — `app/new/ItemRow.tsx`

Two lines on a 414 px screen: **name + ✕** on top, **category chip + amount** below. One line would
squeeze the name to about 12 characters. Every control here comes from F10; the row is layout,
labelling, and wiring only.

```tsx
'use client'
import type { Ref } from 'react'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import type { DraftItem } from './draft'

export type ItemRowProps = {
  item: DraftItem
  index: number
  errors?: { name?: string; amount?: string }
  onNameChange: (value: string) => void
  onAmountChange: (value: number | null) => void
  onAmountUnparsed: (rawText: string) => void
  onOpenCategory: () => void
  onRemove: () => void
  nameRef?: Ref<HTMLInputElement>
  deleteRef?: Ref<HTMLButtonElement>
}

export function ItemRow({
  item,
  index,
  errors,
  onNameChange,
  onAmountChange,
  onAmountUnparsed,
  onOpenCategory,
  onRemove,
  nameRef,
  deleteRef,
}: ItemRowProps) {
  const label = item.name.trim() || `item ${index + 1}`

  return (
    <li className="border-b border-[var(--color-border)] py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Field owns the label, the generated id, and the aria-describedby wiring.
              hideLabel keeps it screen-reader-only — the placeholder is not a label. */}
          <Field label={`Nama item ${index + 1}`} hideLabel error={errors?.name}>
            <Input
              id={`item-${item.key}-name`}
              ref={nameRef}
              type="text"
              enterKeyHint="next"
              autoComplete="off"
              autoCapitalize="none"
              placeholder="Nama item"
              value={item.name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </Field>
        </div>

        <button
          type="button"
          ref={deleteRef}
          onClick={onRemove}
          // 44×44 tap target even though the glyph is small. No swipe gesture: on the web a
          // horizontal swipe fights Safari's edge-back gesture and momentum scroll.
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] press"
          aria-label={`Hapus ${label}`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ✕
          </span>
        </button>
      </div>

      <div className="mt-2 flex items-start gap-2">
        <Chip category={item.category} size="md" onClick={onOpenCategory} />
        <div className="ml-auto w-[9.5rem]">
          <Field label={`Nominal ${label}`} hideLabel error={errors?.amount}>
            <MoneyInput
              id={`item-${item.key}-amount`}
              className="text-right"
              value={item.amountIdr}
              onValueChange={onAmountChange}
              onParseError={onAmountUnparsed}
              enterKeyHint="done"
            />
          </Field>
        </div>
      </div>
    </li>
  )
}
```

Two integration points to confirm while writing this (both are Task 0 preflight candidates):

- **`Input` must honour an explicit `id`** rather than always using `Field`'s generated one — F05's
  focus manager targets `item-<key>-name` and `draft-title` by id.
- **`Input` must forward a ref.** If F10's `Input` does not, use a plain `<input className={CONTROL_CLASS}>`
  inside the `Field` (F10 exports `CONTROL_CLASS` and `useFieldContext()` for exactly this case)
  rather than dropping the label wiring.

`Chip` with an `onClick` renders a `<button>` and carries the category emoji **and** label, so colour
is never the sole signal. The picker is hoisted to `ReviewStage` — **one** instance for the whole
list, not one per row. With 50 rows that is 49 fewer dialogs in the DOM.

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): editable item row"
```

---

### Task 10 — `app/new/ReviewSkeleton.tsx`

A skeleton, not a spinner: it shows the *shape* of what is coming, so the page does not reflow when the answer lands.

```tsx
export function ReviewSkeleton({ rows }: { rows: number }) {
  return (
    <div className="px-4 py-2" aria-hidden="true">
      <div className="mb-4 h-11 w-2/3 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      <div className="mb-5 h-11 w-1/2 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      <ul className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="border-b border-[var(--color-border)] pb-3">
            <div className="h-11 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
            <div className="mt-2 flex gap-2">
              <div className="h-11 w-28 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
              <div className="ml-auto h-11 w-[9.5rem] animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`aria-hidden` because the skeleton is decorative — the real announcement is the `role="status"` region in `PasteStage`.

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): parse skeleton table"
```

---

### Task 11 — `app/new/copy.ts` + `app/new/PasteStage.tsx`

**`app/new/copy.ts`** — one home for every string F05 authors. Note what is *not* here: copy for server-side parse failures. F04's wire contract promises a user-facing Indonesian `message` on every error response, so F05 renders that instead of maintaining a second, drifting vocabulary.

```ts
export const PLACEHOLDER = `bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k`

/** The only failures the browser detects by itself — everything else comes from F04. */
export const CLIENT_COPY = {
  offline: 'Tidak ada koneksi. Kami rapikan seadanya di perangkat kamu — silakan cek di bawah.',
  timeout: 'Terlalu lama diproses. Ini hasil sementara, silakan cek dan perbaiki.',
  invalid_response: 'Jawaban dari server tidak bisa dibaca. Kami isi seadanya — silakan cek.',
  server_error: 'Lagi ada gangguan. Kami isi seadanya — silakan cek dan perbaiki.',
} as const

/** Shown when we DID salvage something but it is not trustworthy (F04: degraded === true). */
export const DEGRADED_NOTICE = 'Kami cuma bisa merapikan sebagian. Cek lagi nama & kategorinya ya.'

export const SAVE_FAILED = 'Gagal menyimpan. Cek koneksi lalu coba lagi.'
export const SLOW_HINT = 'masih diproses…'
```

**`app/new/PasteStage.tsx`**

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextArea } from '@/components/ui/Field'
import { PLACEHOLDER, SLOW_HINT } from './copy'
import { ReviewSkeleton } from './ReviewSkeleton'
import { StickyBar } from './StickyBar'
import { estimateRows, type ParseStatus } from './draft'

export function PasteStage({
  rawText,
  parse,
  elapsedMs,
  slowAfterMs,
  restoredNotice,
  onRawChange,
  onParse,
  onManual,
  onDiscardRestored,
  onSignIn,
}: {
  rawText: string
  parse: ParseStatus
  elapsedMs: number
  slowAfterMs: number
  restoredNotice: boolean
  onRawChange: (value: string) => void
  onParse: () => void
  onManual: () => void
  onDiscardRestored: () => void
  onSignIn: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const loading = parse.kind === 'loading'
  const failure = parse.kind === 'error' ? parse.failure : null

  useEffect(() => {
    // Caret only. iOS will not raise the keyboard without a user gesture and we do not
    // pretend otherwise. Skip entirely when a draft was restored, so the CTA stays visible.
    if (!restoredNotice && rawText.length === 0) textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canParse = rawText.trim().length > 0 && !loading

  return (
    <>
      <div className="flex-1 px-4 pt-3">
        <h1 className="mb-1 text-xl font-semibold">Tambah pengeluaran</h1>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Tempel catatan belanjamu apa adanya. Biar kami yang rapikan.
        </p>

        {restoredNotice ? (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            <span className="flex-1">Draf sebelumnya dipulihkan.</span>
            <button
              type="button"
              onClick={onDiscardRestored}
              className="min-h-[44px] px-2 underline focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
            >
              Mulai baru
            </button>
          </div>
        ) : null}

        {failure ? (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2"
          >
            {/* F04 guarantees this message is Indonesian and safe to render verbatim. We never
                build a message out of an exception, so no internal string can leak here. */}
            <p className="text-sm">{failure.message}</p>
            {failure.code === 'unauthorized' ? (
              <Button variant="secondary" className="mt-2" onClick={onSignIn}>
                Masuk lagi
              </Button>
            ) : null}
            {failure.code === 'input_too_long' ? (
              <p className="mt-1 text-sm tabular-nums">
                {rawText.length.toLocaleString('id-ID')} karakter
              </p>
            ) : null}
          </div>
        ) : null}

        <Field label="Teks pengeluaran" hideLabel>
          <TextArea
            id="raw-text"
            ref={textareaRef}
            value={rawText}
            onChange={(event) => onRawChange(event.target.value)}
            disabled={loading}
            rows={10}
            placeholder={PLACEHOLDER}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // Generous leading: this is the one field people stare at. 16px comes from F10's
            // global control chrome; we do not restate it and we never go below it.
            className="leading-[1.7]"
          />
        </Field>

        <p role="status" aria-live="polite" className="sr-only">
          {loading ? 'Sedang merapikan teks.' : ''}
        </p>

        {loading ? (
          <div className="mt-4">
            {elapsedMs > slowAfterMs ? (
              <p className="mb-2 px-1 text-sm text-[var(--color-text-muted)]" aria-live="polite">
                {SLOW_HINT}
              </p>
            ) : null}
            <ReviewSkeleton rows={estimateRows(rawText)} />
          </div>
        ) : null}
      </div>

      <StickyBar>
        <Button type="button" full onClick={onParse} disabled={!canParse} loading={loading}>
          {loading ? 'Merapikan…' : 'Rapikan'}
        </Button>
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onManual}
            className="min-h-[44px] px-3 text-sm underline focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
          >
            isi manual
          </button>
        </div>
      </StickyBar>
    </>
  )
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): paste stage with skeleton + slow hint"
```

---

### Task 12 — `app/new/ReviewStage.tsx`

The largest component. It owns: title/date fields, the item list, the single hoisted `CategoryPicker`, focus fulfilment, *Rapikan ulang*, F06's `PhotoPicker`, and the sticky total + Simpan bar.

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import { Field, Input, TextArea } from '@/components/ui/Field'
import { Money } from '@/components/ui/Money'
import { PhotoPicker } from '@/components/photos/PhotoPicker'
import type { StagedPhoto } from '@/lib/photos/types'
import type { Category } from '@/lib/categories'
import { ItemRow } from './ItemRow'
import { StickyBar } from './StickyBar'
import { DEGRADED_NOTICE } from './copy'
import { errorSummary } from './validate'
import {
  draftTotal,
  type DraftExpense,
  type FieldErrors,
  type FocusRequest,
  type ParseFailure,
  type SaveStatus,
} from './draft'

export type ReviewStageProps = {
  draft: DraftExpense
  errors: FieldErrors
  focus: FocusRequest
  save: SaveStatus
  parseFailure: ParseFailure | null
  /** F04's ParseResult.degraded — true whenever source !== 'llm'. */
  degraded: boolean
  reparsing: boolean
  photosBusy: boolean
  onFocusHandled: () => void
  onTitleChange: (value: string) => void
  onDateChange: (value: string) => void
  onNoteChange: (value: string) => void
  onRawChange: (value: string) => void
  onItemName: (key: string, value: string) => void
  onItemAmount: (key: string, value: number | null) => void
  onItemAmountUnparsed: (key: string, rawText: string) => void
  onItemCategory: (key: string, category: Category) => void
  onAddItem: () => void
  onRemoveItem: (key: string) => void
  onPhotosChange: (photos: StagedPhoto[]) => void
  onPhotosBusyChange: (busy: boolean) => void
  onReparse: () => void
  onSave: () => void
}

export function ReviewStage(props: ReviewStageProps) {
  const { draft, errors, focus, save, parseFailure, degraded, reparsing, photosBusy } = props

  const nameRefs = useRef(new Map<string, HTMLInputElement | null>())
  const deleteRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const addRef = useRef<HTMLButtonElement>(null)

  const [sheetKey, setSheetKey] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [confirmReparse, setConfirmReparse] = useState(false)

  const total = draftTotal(draft.items)
  const sheetItem = draft.items.find((item) => item.key === sheetKey) ?? null

  // The single place that fulfils a focus request emitted by the reducer.
  useEffect(() => {
    if (!focus) return
    let element: HTMLElement | null = null
    if (focus.target === 'item-name') element = nameRefs.current.get(focus.key) ?? null
    else if (focus.target === 'item-delete') element = deleteRefs.current.get(focus.key) ?? null
    else if (focus.target === 'add-item') element = addRef.current
    else element = document.getElementById(focus.id)

    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    props.onFocusHandled()
  }, [focus, props])

  const errorCount =
    (errors.title ? 1 : 0) +
    (errors.occurredOn ? 1 : 0) +
    Object.keys(errors.items).length +
    (errors.form ? 1 : 0)

  return (
    <>
      <div className="flex-1 px-4 pt-3">
        {/* Landing here after a failure is the DESIGNED outcome, not an accident: the user
            always gets an editable table. The banner explains why it may look rough. */}
        {parseFailure ? (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2"
          >
            <p className="text-sm">{parseFailure.message}</p>
          </div>
        ) : degraded ? (
          <div
            role="status"
            className="mb-3 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2"
          >
            <p className="text-sm">{DEGRADED_NOTICE}</p>
          </div>
        ) : null}

        <Field label="Judul" error={errors.title}>
          <Input
            id="draft-title"
            type="text"
            enterKeyHint="done"
            autoCapitalize="none"
            value={draft.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </Field>

        <Field label="Tanggal" error={errors.occurredOn}>
          <Input
            id="draft-date"
            // Native picker: on iOS this is the wheel the user already knows. Do not build one.
            type="date"
            value={draft.occurredOn}
            onChange={(event) => props.onDateChange(event.target.value)}
          />
        </Field>

        <h2 className="mb-1 mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Item ({draft.items.length})
        </h2>
        <ul className="rounded-xl border border-[var(--color-border)] px-3">
          {draft.items.map((item, index) => (
            <ItemRow
              key={item.key}
              item={item}
              index={index}
              errors={errors.items[item.key]}
              nameRef={(element) => nameRefs.current.set(item.key, element)}
              deleteRef={(element) => deleteRefs.current.set(item.key, element)}
              onNameChange={(value) => props.onItemName(item.key, value)}
              onAmountChange={(value) => props.onItemAmount(item.key, value)}
              onAmountUnparsed={(rawText) => props.onItemAmountUnparsed(item.key, rawText)}
              onOpenCategory={() => setSheetKey(item.key)}
              onRemove={() => props.onRemoveItem(item.key)}
            />
          ))}
        </ul>

        <button
          type="button"
          ref={addRef}
          onClick={props.onAddItem}
          className="press mt-2 min-h-[44px] w-full rounded-md border border-dashed border-[var(--color-border)] text-[16px]"
        >
          + Tambah item
        </button>
        {errors.form ? (
          <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
            {errors.form}
          </p>
        ) : null}

        <details className="mt-5 rounded-xl border border-[var(--color-border)] p-3" open={showRaw}>
          <summary
            className="min-h-[44px] cursor-pointer list-none text-[16px]"
            onClick={(event) => {
              event.preventDefault()
              setShowRaw((open) => !open)
            }}
          >
            Teks asli
          </summary>
          <Field label="Teks pengeluaran asli" hideLabel className="mt-2">
            <TextArea
              id="raw-text-review"
              rows={6}
              value={draft.rawText}
              onChange={(event) => props.onRawChange(event.target.value)}
            />
          </Field>
          {confirmReparse ? (
            // An inline confirm, not window.confirm(): the plan bans alert-family dialogs.
            <div className="mt-2 rounded-lg bg-[var(--color-surface-2)] p-2 text-sm">
              <p className="mb-2">Perubahan manual di tabel akan tertimpa. Lanjut?</p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmReparse(false)
                    props.onReparse()
                  }}
                >
                  Ya, rapikan ulang
                </Button>
                <Button variant="secondary" onClick={() => setConfirmReparse(false)}>
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="mt-2"
              loading={reparsing}
              disabled={reparsing || draft.rawText.trim().length === 0}
              onClick={() => setConfirmReparse(true)}
            >
              Rapikan ulang
            </Button>
          )}
        </details>

        <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Foto
        </h2>
        {/* F06 owns compression, upload, progress, cancel and retry. F05 only holds the
            resulting StagedPhoto[] and hands it to createExpense (F06 decision D-C). */}
        <PhotoPicker
          mode="staged"
          value={draft.photos}
          onChange={props.onPhotosChange}
          onBusyChange={props.onPhotosBusyChange}
          disabled={save.kind === 'saving'}
        />

        <Field label="Catatan (opsional)">
          <TextArea
            id="draft-note"
            rows={2}
            value={draft.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
        </Field>

        <div className="h-6" />
      </div>

      <StickyBar>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">Total</span>
          {/* Recomputed on every keystroke, announced politely so it is not spammed. */}
          <span aria-live="polite" aria-atomic="true" className="text-xl font-semibold tabular-nums">
            <Money value={total} />
          </span>
        </div>
        {save.kind === 'error' ? (
          <p role="alert" className="mb-2 text-sm text-[var(--color-danger)]">
            {save.message}
          </p>
        ) : null}
        {errorCount > 0 ? (
          <p role="alert" className="mb-2 text-sm text-[var(--color-danger)]">
            {errorSummary(errorCount)}
          </p>
        ) : null}
        <Button
          type="button"
          full
          onClick={props.onSave}
          loading={save.kind === 'saving'}
          // Never disabled for validation — tap, then see why. Disabled only for
          // double-submit and while F06 still has bytes in flight.
          disabled={save.kind === 'saving' || photosBusy}
        >
          {photosBusy ? 'Menunggu foto…' : 'Simpan'}
        </Button>
      </StickyBar>

      {/* One picker for the whole list. F10's Sheet is a real <dialog> opened with
          showModal(), so the focus trap, Escape, backdrop dismissal and focus restoration
          to the triggering chip all come from the platform. */}
      <CategoryPicker
        open={sheetItem !== null}
        value={sheetItem?.category ?? null}
        title={sheetItem?.name.trim() ? `Kategori · ${sheetItem.name.trim()}` : 'Pilih kategori'}
        onSelect={(category) => {
          if (sheetItem) props.onItemCategory(sheetItem.key, category)
        }}
        onClose={() => setSheetKey(null)}
      />
    </>
  )
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat(f05): review stage with editable rows, live total, photos"
```

---

### Task 13 — `app/new/AddExpenseClient.tsx`: the host

Replaces the Task 1 placeholder. Owns the reducer, persistence, parse orchestration, and save.

```tsx
'use client'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpense } from '@/app/actions/expenses'
import type { StagedPhoto } from '@/lib/photos/types'
import type { Category } from '@/lib/categories'
import { useVisualViewport } from '@/lib/hooks/useVisualViewport'
import { initialState, reducer } from './draft'
import { clearDraft, isDraftMeaningful, loadDraft, saveDraft } from './draftStorage'
import { PasteStage } from './PasteStage'
import { ReviewStage } from './ReviewStage'
import { SLOW_HINT_MS, useParse } from './useParse'
import { validateDraft } from './validate'
import { SAVE_FAILED } from './copy'

const PERSIST_DEBOUNCE_MS = 400

export function AddExpenseClient({ userId, todayISO }: { userId: string; todayISO: string }) {
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, todayISO, initialState)
  const [restoredNotice, setRestoredNotice] = useState(false)
  const [photosBusy, setPhotosBusy] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const { run, running, elapsedMs } = useParse()

  useVisualViewport()

  // --- restore -------------------------------------------------------------
  // Read in an effect, never during render: reading localStorage while rendering would
  // make the server and client HTML disagree and blow up hydration.
  useEffect(() => {
    const restored = loadDraft(userId)
    if (restored && isDraftMeaningful(restored)) {
      dispatch({ type: 'restore', draft: restored })
      setRestoredNotice(true)
    } else {
      dispatch({ type: 'restore_none' })
    }
  }, [userId])

  // --- persist -------------------------------------------------------------
  const draft = state.draft
  useEffect(() => {
    if (!state.restored) return // never overwrite a stored draft before we have read it
    const id = window.setTimeout(() => saveDraft(userId, draft), PERSIST_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, state.restored, userId])

  // Flush immediately when the tab is backgrounded — iOS can freeze a tab without ever
  // firing the debounce timer, and that is exactly the mis-tap we promised to survive.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') saveDraft(userId, draft)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [draft, userId])

  // --- parse ---------------------------------------------------------------
  const doParse = useCallback(async () => {
    const rawText = state.draft.rawText.trim()
    if (rawText.length === 0 || running) return
    setRestoredNotice(false)
    dispatch({ type: 'parse_start' })
    const outcome = await run(rawText, todayISO)
    if (outcome.ok) {
      setDegraded(outcome.degraded)
      dispatch({ type: 'parse_success', parsed: outcome.parsed, source: outcome.source })
    } else {
      setDegraded(false)
      dispatch({ type: 'parse_failure', failure: outcome.failure, fallback: outcome.fallback })
    }
  }, [run, running, state.draft.rawText, todayISO])

  // --- save ----------------------------------------------------------------
  const savingRef = useRef(false)
  const doSave = useCallback(async () => {
    if (savingRef.current || photosBusy) return
    const invalid = validateDraft(state.draft)
    if (invalid) {
      dispatch({ type: 'invalid', errors: invalid.errors, focus: invalid.focus })
      return
    }
    savingRef.current = true
    dispatch({ type: 'save_start' })

    try {
      // One transaction: group + items + photo rows. The blobs are already in storage —
      // F06 uploads them while the user is still editing the table (decision D-C) — so
      // Simpan is a single fast round trip, not a multi-megabyte upload.
      const { id } = await createExpense({
        title: state.draft.title.trim(),
        occurred_on: state.draft.occurredOn,
        items: state.draft.items.map((item) => ({
          name: item.name.trim(),
          amount_idr: item.amountIdr as number,
          category: item.category,
        })),
        note: state.draft.note.trim() || undefined,
        rawText: state.draft.rawText.trim() || undefined,
        photos: state.draft.photos,
      })

      // Clear BEFORE navigating: a fast back-tap must not resurrect a saved draft.
      clearDraft(userId)
      router.push(`/e/${id}`)
      // Deliberately leave save.kind === 'saving' so the button stays busy through navigation.
    } catch {
      // Server Action messages are redacted in production, so we never try to read one.
      // The draft is untouched — the user can simply tap Simpan again.
      savingRef.current = false
      dispatch({ type: 'save_failure', message: SAVE_FAILED })
    }
  }, [photosBusy, router, state.draft, userId])

  const parseFailure = state.parse.kind === 'error' ? state.parse.failure : null

  const handlers = useMemo(
    () => ({
      onTitleChange: (value: string) => dispatch({ type: 'set_title', value }),
      onDateChange: (value: string) => dispatch({ type: 'set_date', value }),
      onNoteChange: (value: string) => dispatch({ type: 'set_note', value }),
      onRawChange: (value: string) => dispatch({ type: 'set_raw', value }),
      onItemName: (key: string, value: string) => dispatch({ type: 'set_item_name', key, value }),
      onItemAmount: (key: string, value: number | null) =>
        dispatch({ type: 'set_item_amount', key, value }),
      onItemAmountUnparsed: (key: string, rawText: string) =>
        dispatch({ type: 'item_amount_unparsed', key, rawText }),
      onItemCategory: (key: string, value: Category) =>
        dispatch({ type: 'set_item_category', key, value }),
      onAddItem: () => dispatch({ type: 'add_item' }),
      onRemoveItem: (key: string) => dispatch({ type: 'remove_item', key }),
      onPhotosChange: (photos: StagedPhoto[]) => dispatch({ type: 'set_photos', photos }),
      onFocusHandled: () => dispatch({ type: 'clear_focus' }),
    }),
    [],
  )

  return (
    // --app-h comes from useVisualViewport and shrinks when the iOS keyboard opens, which
    // is what keeps the sticky bar above it. 100dvh is only the fallback.
    <div className="flex flex-col" style={{ height: 'var(--app-h, 100dvh)' }}>
      <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        {state.draft.stage === 'paste' ? (
          <PasteStage
            rawText={state.draft.rawText}
            parse={state.parse}
            elapsedMs={elapsedMs}
            slowAfterMs={SLOW_HINT_MS}
            restoredNotice={restoredNotice}
            onRawChange={handlers.onRawChange}
            onParse={doParse}
            onManual={() => dispatch({ type: 'manual_entry' })}
            onDiscardRestored={() => {
              clearDraft(userId)
              setRestoredNotice(false)
              dispatch({ type: 'reset', todayISO })
            }}
            onSignIn={() => {
              window.location.href = '/api/auth/signin'
            }}
          />
        ) : (
          <ReviewStage
            draft={state.draft}
            errors={state.errors}
            focus={state.focus}
            save={state.save}
            parseFailure={parseFailure}
            degraded={degraded}
            reparsing={running}
            photosBusy={photosBusy}
            onPhotosBusyChange={setPhotosBusy}
            onReparse={doParse}
            onSave={doSave}
            {...handlers}
          />
        )}
      </main>
    </div>
  )
}
```

**Verify:**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean type-check, no lint errors, `ƒ /new` in the route table.

```bash
git add -A && git commit -m "feat(f05): wire reducer, persistence, parse and save on /new"
```

---

### Task 14 — Global prerequisites and a 16 px audit

Two things must exist somewhere in the app shell. If F10 already provides them, verify rather than duplicate.

```bash
grep -n 'viewport-fit=cover' app/layout.tsx
grep -rn 'font-size: *16px' app/globals.css
```

Expected: `viewport-fit=cover` present in the viewport export, and a global `input, textarea, select { font-size: 16px; }`.

If the global rule is missing, add it to `app/globals.css` (it belongs to F10, but F05 cannot ship without it — coordinate, do not fork the file):

```css
/* iOS Safari zooms the page when a focused control is under 16px. Non-negotiable. */
input,
textarea,
select {
  font-size: 16px;
}
```

Then audit our own controls. Keep this command in the PR description:

```bash
grep -rn 'text-\[1[0-5]px\]\|text-xs\|text-sm' app/new | grep -iE '<input|<textarea|<TextArea|<Input|<MoneyInput'
```

Expected: no output.

```bash
git add -A && git commit -m "chore(f05): confirm 16px input floor + viewport-fit"
```

---

### Task 15 — Accessibility sweep

Run through this list with the keyboard only, then with VoiceOver on the device.

| Check | Expected |
| --- | --- |
| Tab from the top of `/new` | textarea → Rapikan → isi manual, nothing skipped, focus ring visible everywhere |
| Every input has a name | axe: 0 `label` violations |
| `+ Tambah item` | the new row's **name** input receives focus and scrolls into view |
| Delete a middle row | focus lands on the **next** row's ✕ |
| Delete the last row | focus lands on `+ Tambah item` |
| Open the category picker | Tab cycles inside the dialog only (native `<dialog>` modal behaviour) |
| Escape / backdrop tap | picker closes, nothing changes, focus returns to the chip that opened it |
| The grid | `role="listbox"` with `role="option"` children and `aria-selected` — F10's semantics, not re-implemented here |
| Tap Simpan while invalid | `role="alert"` announces the count, focus jumps to the first bad field |
| Total changes | announced politely, not assertively |
| Skeleton visible | announced once via `role="status"`, not read row by row |

```bash
npx @axe-core/cli http://localhost:3000/new --exit || true
```

Expected: zero `critical`/`serious` violations. (Needs a signed-in session; otherwise run the axe browser extension against the live page.)

```bash
git add -A && git commit -m "chore(f05): accessibility sweep on /new"
```

---

### Task 16 — Manual QA script (414 × 896)

Run every time before merging. **This is the acceptance test for F05.**

**Setup**

```bash
npm run dev
```

Chrome DevTools → device toolbar → **Responsive**, 414 × 896, DPR 3, UA "iPhone". Sign in with Google. Then repeat the whole script on a physical iPhone XS Max in Safari — the keyboard behaviour in steps 3 and 10 cannot be validated in DevTools.

| # | Action | Expected |
| --- | --- | --- |
| 1 | Navigate to `/new` | Header "Tambah pengeluaran", textarea showing the canonical placeholder in grey, sticky **Rapikan** at the bottom above the home indicator, "isi manual" beneath it. Caret is in the textarea. No horizontal scroll. |
| 2 | Tap the textarea | The page does **not** zoom. If it does, some control is under 16 px — stop and fix. |
| 3 | With the keyboard open, look at the bottom | **Rapikan** sits directly above the keyboard, fully visible and tappable. *(Device only.)* |
| 4 | Paste the canonical input from ROADMAP §1 (7 lines) | Text wraps with generous line-height, nothing clipped. **Rapikan** becomes enabled. |
| 5 | Tap **Rapikan** | The button goes busy and cannot be tapped twice. A skeleton with **6** rows appears (7 lines − 1 title). No spinner anywhere. |
| 6 | If the parse takes longer than 8 s | `masih diproses…` appears above the skeleton. |
| 7 | Parse returns | Title = `bakar duit tuesday`. Date = `2026-08-18`. Six rows. Sticky total reads **Rp 266.350**. |
| 8 | **Edit an amount** — tap the `45.000` on `ayam sambal hitam` | The field switches to plain digits `45000` while focused. |
| 9 | Replace it with `52rb`, tap elsewhere | The field settles to `52.000`. Total updates to **Rp 273.350** with no layout jump. (`52rb` is typeable here from a hardware keyboard or a paste; on the device keypad you would type `52000` and get the same result.) |
| 10 | Tap into an amount on the **last** row | The row scrolls into view and the sticky total + Simpan bar stays above the keyboard. *(Device only.)* |
| 11 | **Change a category** — tap the chip on `perumahan laddaland` | F10's `CategoryPicker` slides up: a 2×4 grid of 8 categories, each with emoji **and** label, the current one ringed, background scroll locked. |
| 12 | Tap **Tempat Tinggal** | The picker closes itself, the chip updates, and focus returns to the chip (the `<dialog>` restores it). Total unchanged. |
| 13 | Re-open the picker, press **Escape** (or tap the backdrop) | It closes, nothing changes, focus returns to the chip. |
| 14 | **Delete a row** — tap ✕ on `kungfu soccer` (Rp 49.000) | The row disappears, 5 rows remain, total = **Rp 224.350**, focus is on the next row's ✕. No swipe gesture exists or is needed. |
| 15 | Tap **+ Tambah item** | An empty row appends, its name input is focused and scrolled into view, and it inherits the previous row's category. |
| 16 | Type `es teh`, move to amount, type `5k`, blur | Row reads `es teh · Rp 5.000`, total = **Rp 229.350**. |
| 17 | Clear the new row's name and tap **Simpan** | No `alert()`. Inline "Nama item belum diisi." under that field, "Ada 1 isian yang perlu diperbaiki." above the button, focus jumps to the empty name. |
| 18 | Fix the name. Open **Teks asli**, edit a line, tap **Rapikan ulang** | Inline confirm appears ("perubahan manual akan tertimpa"). Confirm → skeleton → the table repopulates from the edited text. |
| 19 | Attach 3 photos via the picker | F06 shows per-file progress; **Simpan** reads "Menunggu foto…" and is disabled until all three finish, then returns to "Simpan". |
| 20 | **Draft persistence** — hard-reload the page | Everything comes back: title, date, all rows with amounts and categories, the note, the 3 photos, and the raw text. A "Draf sebelumnya dipulihkan." line appears with **Mulai baru**. |
| 21 | Navigate to `/m/2026-08` and press Back | Same as step 20. Nothing is lost. |
| 22 | Tap **Simpan** | Button goes busy, then `/e/<id>` renders with the correct title, date, six items, **Rp 229.350** total and the 3 photos in the gallery. |
| 23 | Go back to `/new` | Empty paste stage. The draft was cleared. No restore notice. |
| 24 | **Offline path** — DevTools Network → Offline, reload `/new`, paste the canonical input, tap **Rapikan** | Amber banner *"Tidak ada koneksi. Kami rapikan seadanya di perangkat kamu…"*, and the user lands in a review table pre-filled by the **local** fallback parser (all categories `Lainnya`). **Not** a dead end, no stack trace. |
| 25 | Still offline, tap **Simpan** | Inline "Gagal menyimpan. Cek koneksi lalu coba lagi." above the button. The draft is intact. Go back online, tap **Simpan** again → succeeds. |
| 26 | **Rate limit** — tap Rapikan 11 times in a minute | F04's 429 copy appears on the paste stage, draft intact, no fallback table. |
| 27 | **Manual path** — fresh `/new`, tap "isi manual" | Review stage with exactly one empty row, today's Jakarta date pre-filled, empty title. |
| 28 | Rotate to landscape (896 × 414) | Layout still works, sticky bar still reachable, no clipped controls. |
| 29 | Dark mode (`prefers-color-scheme: dark`) | All F10 tokens resolve; no white-on-white; error and warning text still legible. |

Record the run in the PR description as a checklist. Any ✗ blocks merge.

```bash
git add -A && git commit -m "docs(f05): QA run recorded"
```

---

### Task 17 — Ship

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git push -u origin feat/f05-add-expense
```

Expected: all four green, branch pushed. Open a PR titled `F05 — Add Expense Flow (/new)` with the QA checklist and the resolved answers to the Open questions in the body.

---

## Contract deltas

Written **after** cross-reading the F02, F03, F04, F06 and F10 plans as they landed. Four of the six
deltas I originally expected turned out to be already satisfied — F04's error envelope, F03's inferred
types, F03's `CATEGORY_META`, and F10's `Sheet` behaviour — and I have retracted them rather than
leave stale asks in the record. What remains is below. **The three live cross-plan conflicts come
first, because each will break a build if nobody arbitrates it.**

### ⚠️ Live conflict 1 — `createExpense` input: F03 says `photoIds`, F06 says `photos`

- ROADMAP §4.4 and **F03's `CreateExpenseInput`** currently declare `photoIds: z.array(IdSchema).max(20).optional()`.
- **F06's decision D-C** (locked in its plan) replaces that with `photos?: NewPhotoInput[]` and states plainly that `photoIds` "was unimplementable as written".
- F06 is right: `expense_photos.group_id` is `NOT NULL` with an FK (§4.2), so **no photo row and therefore no photo id can exist before the group does**. There is nothing for `photoIds` to point at.

**F05 builds against F06's version:**

```ts
export const CreateExpenseInput = ParsedExpense.extend({
  note:    NoteSchema.optional(),
  rawText: z.string().max(20_000).optional(),
  photos:  z.array(NewPhotoInputSchema).max(20).optional(),   // was: photoIds
})
```

**F03 must drop `photoIds` and add `photos`.** If F03 refuses, F05 falls back to
`createExpense(...)` → `attachPhoto(...)` × n in a sequential loop, which costs atomicity (a
network drop mid-loop leaves a saved group with a partial gallery) and 1+N round trips on the tap
that most needs to feel instant. Both features already prefer the transactional version; this
just needs someone to change one Zod object.

### ⚠️ Live conflict 2 — `PhotoPicker` (staged mode) needs `onBusyChange`

F06's `PhotoPickerProps` for `mode: 'staged'` is `{ value, onChange, max?, disabled?, className? }`.
`onChange` fires only with **completed** uploads, so F05 has no way to tell that three photos are
still uploading — and will happily let the user tap **Simpan**, silently dropping them.

Requested addition (one line in F06, and F06 already tracks `inFlight` internally):

```ts
onBusyChange?: (busy: boolean) => void   // true while any upload is queued/uploading/retrying
```

Without it, F05's only options are to disable Simpan whenever `value.length` might be stale
(guesswork) or to let photos silently vanish. Neither is acceptable, so this one is a blocker.

### 3. `/api/parse` — **no delta.** Retracted.

My original draft asked for a structured error body and an `X-Parse-Source` header. F04's plan
already publishes exactly that and better: `{ ok: true, expense, source, degraded }` on 200,
`{ ok: false, error: { code, message } }` on every failure, with seven documented status codes and
a guarantee that `message` is Indonesian copy safe to render verbatim. F05 consumes it as published
and authors **no** copy of its own for server-side failures.

Note that F04's shape is an *envelope*, not the bare `ParsedExpense` that ROADMAP §4.5 describes
("Body `{ rawText, todayISO }` → `ParsedExpense`"). That is a delta **F04 owns and has already
documented**; F05 simply notes that it is building against the envelope, not against §4.5's literal
wording, so the roadmap should be reconciled to F04's version.

### 4. `fallbackParse` must stay client-importable — **constraint, not a change**

F04 publishes `fallbackParse(input: ParseInput): ParsedExpense | null` as "pure, synchronous, no
I/O, no network", and confines `import 'server-only'` to `lib/llm/client.ts`. F05 **imports it into
the browser bundle** — that is the entire reason the offline path lands in an editable table
instead of a dead end. So this is a standing constraint on F04's future edits, asserted by Task 0's
preflight: `lib/llm/fallbackParse.ts` and everything it transitively imports must stay free of
`server-only`, `process.env`, and Node built-ins.

### 5. `lib/schema/expense.ts` inferred types — **no delta.** Retracted.

F03 exports `export const ParsedExpense` alongside `export type ParsedExpense = z.infer<typeof ParsedExpense>`
(TypeScript declaration merging: the value and the type share a name legally). F05 uses that name
in both positions and needs nothing added.

### 6. `lib/categories.ts` `CATEGORY_META` — **no delta.** Retracted.

F03 already exports `CATEGORY_META: Readonly<Record<Category, CategoryMeta>>`. F05 only asks that
`CategoryMeta` keep its `label` + `emoji` + colour custom property, since F10's `Chip` and
`CategoryPicker` read them through `categoryStyle()`.

### ⚠️ Live conflict 3 — `lib/categories.ts` and `lib/format.ts` have two owners

F03's plan declares itself **"Owner of: `lib/db/*`, `lib/categories.ts`, `lib/schema/expense.ts`,
`lib/format.ts`, …"**. F10's plan declares **"F10 owns: … `lib/categories.ts`, `lib/cn.ts`, the money
half of `lib/format.ts`, …"**. Both write `CATEGORY_META`; F10 additionally adds `CATEGORY_ORDER`,
`categoryStyle()` and `formatIdrDigits()`.

F05 imports from both files and does not care who writes them, but it **does** care that the merged
result exports every symbol both plans promise. Whoever lands second must extend, not replace.
*Recommendation: F10 owns the presentational half (`CATEGORY_META`, `CATEGORY_ORDER`, `categoryStyle`,
`formatIdr*`), F03 owns the data half (`CATEGORIES`, `Category`, `parseIdrLoose`, `todayJakartaISO`,
`monthKey`), and one of them re-exports from the other so there is a single import path per symbol.*

### 7. F10's `Sheet` — **no delta.** Retracted.

I had asked F10 for a focus trap, `aria-modal`, Escape, backdrop dismissal and scroll lock. F10's
`Sheet` is a real `<dialog>` driven by `showModal()`, which gives the first four from the platform,
plus an explicit ref-counted `lockBody()`. Nothing to request. `CategoryPicker` sits on top of it and
closes itself after a pick, so F05's earlier hand-rolled `CategorySheet` is deleted from this plan
(Task 8).

### 8. Small requests to F10, none of them blocking

- **`Input` / `TextArea` must honour an explicit `id`** rather than always using the `Field`-generated
  one. F05's focus manager targets `draft-title`, `draft-date` and `item-<key>-name` by id.
- **`Input` / `TextArea` should forward a ref.** F05 focuses the new row's name input after
  `+ Tambah item` and the textarea on mount. Fallback if not: a bare `<input className={CONTROL_CLASS}>`
  inside the `Field`, using F10's exported `useFieldContext()` for the aria wiring — no label lost.
- **`Chip` ref forwarding** would be nice for explicit focus restoration, but `<dialog>` already
  restores focus to the trigger, so this is only a safety net. Verify in Task 15 before asking.

### 9. `/new` and the bottom tab bar — resolved by F10

F10 renders `TabBar` from `app/(chrome)/layout.tsx` only, and states that features never mount it
themselves. F05 therefore places `/new` **outside** the `(chrome)` route group, so no tab bar stacks
on top of its sticky footer. Confirm the group name when F10 lands; this is a one-line directory
decision, not a code change.

---

## Interfaces I publish

Very little, deliberately. After adopting F10's primitives (Tasks 7–8), F05 ships no shared
components at all — everything else under `app/new/` is private to the route.

```ts
// lib/hooks/useVisualViewport.ts   ← any page with a sticky bottom bar over a keyboard (F07)
export function useVisualViewport(): void
// Side effect: sets --app-h and --kb-inset (px) on <html> for the component's lifetime.
// Consumers style with `height: var(--app-h, 100dvh)`; 100vh must appear nowhere.

// app/new/draft.ts                 ← exported mainly for tests; F07 may reuse draftTotal
export function draftTotal(items: DraftItem[]): number
export type DraftItem = {
  key: string; name: string; amountIdr: number | null; amountRaw: string | null; category: Category
}
```

**Behavioural contracts I publish**

- `/new` clears `localStorage['et:new-draft:<userId>']` on a successful save, **before** navigating,
  so a fast back-tap cannot resurrect a saved draft.
- `/new` never leaves a `StagedPhoto` un-referenced on a *successful* save: every staged photo goes
  into `createExpense({ photos })`. Blobs from **abandoned** drafts are F06's orphan sweep, and the
  draft envelope in localStorage is where their pathnames can be found.
- `/new` is the only writer of the `et:new-draft:*` key space.
- `/new` lives outside F10's `(chrome)` route group, so it renders no tab bar.

---

## Interfaces I consume

Every symbol F05 imports from another feature, with the signature F05 compiles against — taken from
the F02/F03/F04/F06 plans as published, not from memory. **A mismatch here is a build break**, which
is what Task 0's preflight script asserts mechanically.

### From F02 — Auth

```ts
// lib/auth.ts
export function requireUserId(): Promise<string>   // throws / redirects when unauthenticated
```
Also assumed: `middleware.ts` already covers `/new`, so `page.tsx` does no redirecting of its own.
F02 is explicit that middleware is a convenience redirect and `requireUserId()` is the real boundary
— F05 calls it in the server component regardless.

### From F03 — Data layer & contracts

```ts
// lib/categories.ts
export const CATEGORIES: readonly ['food','groceries','transport','bills','housing','entertainment','health','other']
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>>
// CategoryMeta must expose: label (Indonesian), emoji, and a CSS custom-property name (colorVar)

// lib/format.ts
export function formatIdr(n: number): string                    // 38500 → "Rp 38.500"
export function parseIdrLoose(input: string): number | null     // "45k" | "45rb" | "1,5jt" | "Rp 38.500"
export function todayJakartaISO(now?: Date): string             // "2026-08-19"

// lib/schema/expense.ts
export const ParsedExpense: z.ZodObject<...>       // .safeParse() of the /api/parse payload
export type  ParsedExpense = z.infer<typeof ParsedExpense>      // declaration merging — same name
export type  ParsedItem    = z.infer<typeof ParsedItem>

// app/actions/expenses.ts
export function createExpense(raw: unknown): Promise<{ id: string }>
// F05 passes, and F03's CreateExpenseInput must accept:
//   { title, occurred_on, items: { name, amount_idr, category }[],
//     note?, rawText?, photos?: StagedPhoto[] }          ← see Live conflict 1
```

Assumptions F05 relies on: `createExpense` validates with Zod server-side, inserts group + items
(+ photos) in **one transaction** via `db.batch`, and takes ownership from `requireUserId()` rather
than from anything the client sends — §4.4's security invariant, which F03's plan implements
literally. F05 sends no `userId` and no ids of any kind.

### From F04 — LLM parsing

```ts
// POST /api/parse
// request:  { rawText: string; todayISO: string }
// 200:      { ok: true, expense: ParsedExpense, source: ParseSource, degraded: boolean }
// 400:      { ok: false, error: { code: 'bad_request' | 'empty_input', message } }
// 401:      { ok: false, error: { code: 'unauthorized',   message } }
// 413:      { ok: false, error: { code: 'input_too_long', message } }
// 422:      { ok: false, error: { code: 'no_items_found', message } }
// 429:      { ok: false, error: { code: 'rate_limited',   message } }
// 500:      { ok: false, error: { code: 'server_error',   message } }
// `message` is always Indonesian and safe to render verbatim — F05 renders it, never rewrites it.

// lib/llm/types.ts
export type ParseSource = 'llm' | 'llm_repair' | 'fallback'
export interface ParseInput { rawText: string; todayISO: string }

// lib/llm/fallbackParse.ts — pure, synchronous, no I/O, MUST be client-importable (delta 4)
export function fallbackParse(input: ParseInput): ParsedExpense | null
```

F05 does **not** import `parseExpense` / `parseExpenseWithMeta`: those pull in `lib/llm/client.ts`,
which imports `server-only` by design. The route handler is the only server-side caller.

F05 honours F04's four required behaviours: `empty_input` and `input_too_long` keep the user on the
paste stage with the draft intact; `no_items_found` opens the manual table with one blank row and
keeps `rawText`; `degraded === true` renders the table plus the "cek lagi nama & kategorinya" notice.

### From F06 — Photos

```ts
// lib/photos/types.ts
export type StagedPhoto = {
  blobUrl: string
  blobPathname: string
  width: number
  height: number
  sizeBytes: number
}
export type NewPhotoInput = StagedPhoto     // the alias used in createExpense's signature

// components/photos/PhotoPicker.tsx
export function PhotoPicker(props: {
  mode: 'staged'                            // /new has no groupId yet
  value: StagedPhoto[]
  onChange: (next: StagedPhoto[]) => void   // fires only with COMPLETED uploads
  onBusyChange?: (busy: boolean) => void    // ← requested addition, see Live conflict 2
  max?: number
  disabled?: boolean
  className?: string
}): JSX.Element
```

What F05 depends on beyond the props, all of it already stated in F06's plan:

- **Uploads happen inside the picker, during picking** (F06 decision D-C), not on Simpan. This is
  what makes the save tap one round trip instead of a multi-megabyte wait on cellular.
- `StagedPhoto` is **plain JSON** — no `File`, no `Blob`, no functions — because F05 round-trips the
  array through `JSON.stringify` into localStorage and back.
- Removing a photo in the picker calls F06's `discardStagedPhotos`; F05 never touches a blob.
- Orphan blobs from drafts that are never saved are F06's sweep, not F05's.
- F05 does **not** import `attachPhoto`. That is F07's path, for photos added to a group that
  already exists.

### From F10 — Design system

Taken from F10's published API appendix.

```ts
// components/ui/Button.tsx
interface ButtonBaseProps { variant?: …; size?: 'md' | 'lg'; fullWidth?: boolean; leadingIcon?: ReactNode }
interface ButtonProps extends ButtonBaseProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  loading?: boolean            // disables, keeps width, swaps the label for a spinner
}
export function Button(props: ButtonProps): JSX.Element   // type defaults to "button"

// components/ui/Field.tsx
interface FieldProps {
  label: string                // REQUIRED — this is the accessible name
  hideLabel?: boolean          // sr-only
  hint?: string
  error?: string               // presence = error state
  required?: boolean
  className?: string
  children: React.ReactNode
}
export function Field(props: FieldProps): JSX.Element
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element      // auto-wires id/aria
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element
export function useFieldContext(): { inputId: string; describedBy?: string; invalid: boolean } | null
export const CONTROL_CLASS: string   // borrow the input chrome for a custom control

// components/ui/MoneyInput.tsx  — replaces the AmountInput this plan originally specified
interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'> {
  value: number | null
  onValueChange: (value: number | null) => void   // on blur when parsed, and on clear
  onParseError?: (rawText: string) => void        // on blur when the text made no sense
}
export function MoneyInput(props: MoneyInputProps): JSX.Element
// type="text" + inputMode="decimal"; formats to "38.500" on blur, plain digits while focused.

// components/ui/Chip.tsx
interface ChipProps {
  category: Category
  size?: 'sm' | 'md'      // F05 rows use 'md' (standalone control)
  onClick?: () => void    // present ⇒ renders a <button>
  selected?: boolean
  labelHidden?: boolean
  className?: string
}
export function Chip(props: ChipProps): JSX.Element

// components/ui/CategoryPicker.tsx  — replaces the CategorySheet this plan originally specified
interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  value?: Category | null
  onSelect: (category: Category) => void   // the picker closes itself after this
  title?: string                            // default "Pilih kategori"
}
export function CategoryPicker(props: CategoryPickerProps): JSX.Element
// Renders a 2×4 grid inside Sheet: role="listbox" / role="option" / aria-selected.

// components/ui/Sheet.tsx  — consumed indirectly, through CategoryPicker
interface SheetProps { open: boolean; onClose: () => void; title: string; hideTitle?: boolean
  description?: string; footer?: ReactNode; showCloseButton?: boolean; className?: string; children: ReactNode }
export function Sheet(props: SheetProps): JSX.Element
// A real <dialog> + showModal(): focus trap, Escape and backdrop dismissal come from the platform.

// components/ui/Money.tsx
interface MoneyProps {
  value: number                       // whole rupiah
  size?: 'hero' | 'lg' | 'md' | 'sm'  // F05's live total uses 'lg'
  tone?: 'default' | 'muted' | 'danger' | 'success'
  showPrefix?: boolean; signed?: boolean; className?: string
}
export function Money(props: MoneyProps): JSX.Element
```

Note the shape mismatch F05 already absorbed: `Sheet` takes `title: string` and generates its own
`titleId` (an earlier draft of this plan passed a `titleId` and rendered its own heading), and `Field`
takes no `htmlFor` because it supplies the id through context. Both are handled in Tasks 9 and 12.

**Global CSS and tokens F05 depends on:** F10's `@theme` colour/spacing/type tokens, the `press`
utility, `CONTROL_CLASS`, the global 16 px control floor, `viewport-fit=cover` in `app/layout.tsx`,
`-webkit-tap-highlight-color: transparent`, a visible `:focus-visible` ring, and `sr-only`. F05
references tokens only through F10's components and a handful of `var(--color-*)` names; if F10's
token names differ from the `--color-surface` / `--color-border` / `--color-danger` family used in
the snippets above, rename at integration time — that is a find-and-replace, not a redesign.

---

## Open questions for the integrator

1. **Who fixes `createExpense`'s photo parameter?** F03 ships `photoIds`, F06 requires `photos`.
   F05 is written against `photos`. This is a one-object change in `lib/schema/expense.ts` plus the
   insert in `app/actions/expenses.ts`, and it blocks F05's save path. *Recommendation: F03 adopts
   F06's `photos: NewPhotoInput[]` and deletes `photoIds`, which is unimplementable as written.*

2. **Will F06 add `onBusyChange` to the staged picker?** Without it F05 cannot stop a user from
   saving while uploads are in flight, and those photos are lost silently. *Recommendation: yes —
   F06 already computes `inFlight` internally for its own UI.*

3. **`inputMode` on the amount field.** The brief mandates `numeric`; F10's `MoneyInput` ships
   `decimal`. F05 accepts F10's choice rather than overriding a design-system component on one
   screen. On iOS both are digits-only pads, so neither lets a user literally type `45k` on the
   device — they type `45000` and get the same answer, and `parseIdrLoose` still rescues `45k`,
   `45rb`, `1,5jt` and `Rp 38.500` from pastes, re-parses and hardware keyboards. *Alternative:*
   `inputMode="text"` + a `pattern` makes `45k` typeable at the cost of a worse keypad for the 95%
   case. *Recommendation: keep F10's `decimal`.* Confirm this reading of the brief is acceptable.

4. **How should a Server Action failure be distinguished?** Next redacts thrown error messages in
   production, so F05 maps every `createExpense` rejection to one generic string. If F03 would rather
   return `{ ok: false, code }`, F05 can show precise copy — and F07 will hit the same wall, so it is
   worth settling once.

5. **Should signing out sweep drafts?** The key is `et:new-draft:<userId>`, so a second user on the
   same phone cannot read the first user's paste. But the first user's draft lingers up to the 7-day
   TTL. *Recommendation: yes — one `Object.keys(localStorage)` loop in F02's sign-out handler.*

6. **One draft per user, or many?** Today a second unsaved `/new` overwrites the first. That matches
   the simplicity tenet and I believe it is right — confirm nobody expects a draft list.

7. **Confirm `/new` sits outside F10's `(chrome)` route group** so no tab bar stacks on its sticky
   footer. F10 states features never mount `TabBar` themselves, so this is just a directory choice —
   but it has to be made deliberately, before `app/new/` is created.

8. **`todayJakartaISO()` is computed on the server per request.** A tab left open across Jakarta
   midnight pre-fills yesterday's date on a *new* draft. *Recommendation: leave it — `force-dynamic`
   plus a visible, editable date field is enough. Do not add a client clock.*

9. **Does F06's `max` default match F05's expectation?** F05 does not pass `max` and relies on
   F06's `MAX_PHOTOS_PER_GROUP`. Confirm that constant is what the product wants on `/new` (F06's
   own examples suggest ~7–12).

10. **Who merges `lib/categories.ts` and `lib/format.ts`?** F03 and F10 both claim ownership (Live
    conflict 3). F05 imports `CATEGORIES`, `Category`, `CATEGORY_META`, `parseIdrLoose` (indirectly,
    via `MoneyInput`) and `todayJakartaISO` and needs one import path per symbol.

11. **Do F10's `Input` / `TextArea` honour an explicit `id` and forward refs?** Task 9 has a
    documented fallback, but the clean version needs both. One line each in F10.
