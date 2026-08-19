import { DEFAULT_CATEGORY, toCategory, type Category } from '@/lib/categories'
import type { ParseSource } from '@/lib/llm/types'
import type { StagedPhoto } from '@/lib/photos/types'
import type { ParsedExpense } from '@/lib/schema/expense'

/**
 * The whole /new state machine, pure and testable — no React, no jsdom, no render.
 *
 * WHY ONE REDUCER RATHER THAN TEN useState CALLS, in order of weight:
 *
 *  1. Persistence needs ONE serialisable object. With ten `useState`s the save effect's
 *     dependency array lists all ten, and any one missed silently drops a field from the
 *     stored draft — invisible until a user loses a long paste. Here it is one
 *     `useEffect(() => saveDraft(state.draft), [state.draft])`.
 *  2. Item mutations are array splices, not assignments. The same `items.map(i => i.key ===
 *     key ? {...i, name} : i)` written out six times across three components is the exact
 *     shape of code that grows an off-by-one.
 *  3. Focus is a CONSEQUENCE of a transition. "Delete a row, then focus the next row's ✕"
 *     has to be resolved from the array as it was BEFORE the splice; a reducer emits
 *     `focus` and `items` atomically, parallel states cannot without re-deriving indices
 *     from data that has already moved.
 *  4. `parse_success` touches five fields at once. Five `set*` calls are five renders and
 *     five chances to leave the UI half-transitioned.
 *
 * What stays local `useState` in the components: purely ephemeral UI no sibling reads and
 * nothing persists — which chip opened the sheet, whether "Teks asli" is expanded, whether
 * the re-parse confirm is showing. The rule for a reviewer: if it belongs in localStorage,
 * or two components read it, it belongs here.
 */

export const DRAFT_VERSION = 1 as const

/** Mirrors lib/schema/expense.ts exactly, so the client never builds a payload Zod rejects. */
export const MAX_ITEMS = 50
export const MAX_NAME = 120
export const MAX_TITLE = 120
export const MAX_NOTE = 2_000
export const MAX_AMOUNT = 1_000_000_000

export { DEFAULT_CATEGORY }

/** One editable line in the review table. */
export type DraftItem = {
  /** Client-only stable identity. Survives reorder and persistence. Never sent to the server. */
  key: string
  name: string
  /** Whole rupiah. null = empty, or the last thing typed could not be parsed. */
  amountIdr: number | null
  /** Set only when MoneyInput reported a parse failure, so the error can quote it back. */
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
  /** YYYY-MM-DD, an Asia/Jakarta calendar day (D9/D10). */
  occurredOn: string
  items: DraftItem[]
  note: string
  /** Completed Blob uploads owned by F06. Plain JSON, so it round-trips through localStorage. */
  photos: StagedPhoto[]
  source: DraftSource | null
  touchedAt: number
}

/**
 * `code` drives behaviour; `message` is ready-to-render Indonesian.
 *
 * F04 authors every server-side message and its wire contract guarantees they are safe to
 * render verbatim, so F05 renders them rather than maintaining a second, drifting
 * vocabulary. `copy.ts` supplies only the handful the browser detects on its own.
 */
export type ParseFailure = {
  code:
    | 'offline'
    | 'timeout'
    | 'invalid_response' // detected client-side
    | 'unauthorized'
    | 'bad_request'
    | 'empty_input' // from POST /api/parse
    | 'input_too_long'
    | 'no_items_found'
    | 'rate_limited'
    | 'server_error'
  message: string
}

export type ParseStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number; expectedRows: number }
  | { kind: 'error'; failure: ParseFailure }

export type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string }

export type FieldErrors = {
  title?: string
  occurredOn?: string
  note?: string
  /** Keyed by DraftItem.key. */
  items: Record<string, { name?: string; amount?: string }>
  /** Form-level, e.g. "Tambahkan minimal satu item." */
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
  /** True once the localStorage restore attempt finished — blocks the write-before-read race. */
  restored: boolean
}

export const NO_ERRORS: FieldErrors = { items: {} }

let keySeq = 0

/**
 * A row identity. `crypto.randomUUID` needs a secure context, which every deployment of
 * this app has, but a plain-http `next dev` on a LAN address does not — hence the fallback,
 * which only has to be unique within one draft.
 */
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

/**
 * How many skeleton rows to show, guessed from the paste so the table does not jump when the
 * real answer lands. Line 0 is usually the title, hence the −1.
 */
export function estimateRows(rawText: string): number {
  const lines = rawText.split('\n').filter((line) => line.trim().length > 0).length
  return Math.min(8, Math.max(3, lines - 1))
}

/** ParsedExpense — the F04↔F05 boundary type — to editable draft fields. */
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
      // toCategory (F03a) rather than a local guard: one coercion, one place (R-77).
      category: toCategory(item.category),
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
  return touch(draft, { items: draft.items.map((item) => (item.key === key ? fn(item) : item)) })
}

/** Clear the error attached to one item field as soon as the user edits that field. */
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
      // Clearing `parse` means editing the text dismisses the banner about the last attempt.
      return {
        ...state,
        draft: touch(state.draft, { rawText: action.value }),
        parse: { kind: 'idle' },
      }

    case 'parse_start':
      return {
        ...state,
        parse: {
          kind: 'loading',
          startedAt: Date.now(),
          expectedRows: estimateRows(state.draft.rawText),
        },
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
      // DEGRADED SUCCESS. If anything at all was salvaged, put the user in the table. This
      // is the single most important behaviour in the feature: a parse failure is never a
      // dead end, it is a table that may need more editing than usual.
      if (action.fallback) {
        return {
          ...state,
          draft: draftFromParsed(action.fallback, state.draft, 'fallback'),
          parse: { kind: 'error', failure: action.failure },
          errors: NO_ERRORS,
          focus: null,
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
          focus: null,
        }
      }
      // unauthorized / input_too_long / rate_limited / empty_input: stay on paste, draft
      // intact. Signing in or shortening the text comes before editing a table.
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
        draft: touch(state.draft, { title: action.value.slice(0, MAX_TITLE) }),
        errors: { ...state.errors, title: undefined, form: undefined },
      }

    case 'set_date':
      return {
        ...state,
        draft: touch(state.draft, { occurredOn: action.value }),
        errors: { ...state.errors, occurredOn: undefined, form: undefined },
      }

    case 'set_note':
      return {
        ...state,
        draft: touch(state.draft, { note: action.value.slice(0, MAX_NOTE) }),
        errors: { ...state.errors, note: undefined },
      }

    case 'set_item_name':
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (item) => ({
          ...item,
          name: action.value.slice(0, MAX_NAME),
        })),
        errors: clearItemError(state.errors, action.key, 'name'),
      }

    /*
     * MoneyInput owns the text and runs parseIdrLoose itself, so manual entry is exactly as
     * forgiving as the LLM path ("45k", "45rb", "1,5jt", "Rp 38.500"). It hands us a number
     * or nothing; we clamp, because the schema cap is ours to honour. R-52e: this fires on
     * every accepted change, not only on blur — which is fine, the handler assigns rather
     * than accumulates, so it is idempotent.
     */
    case 'set_item_amount': {
      const raw = action.value
      const value =
        raw === null || !Number.isInteger(raw) || raw < 0 || raw > MAX_AMOUNT ? null : raw
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (item) => ({
          ...item,
          amountIdr: value,
          amountRaw: null,
        })),
        errors: clearItemError(state.errors, action.key, 'amount'),
      }
    }

    case 'item_amount_unparsed':
      // Keep what they typed so the inline error can quote it back at them. Losing it is
      // worse than showing it wrong.
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (item) => ({
          ...item,
          amountIdr: null,
          amountRaw: action.rawText,
        })),
      }

    case 'set_item_category':
      return {
        ...state,
        draft: mapItem(state.draft, action.key, (item) => ({ ...item, category: action.value })),
      }

    case 'add_item': {
      if (state.draft.items.length >= MAX_ITEMS) {
        return { ...state, errors: { ...state.errors, form: `Maksimal ${MAX_ITEMS} item.` } }
      }
      // Inherit the previous row's category: consecutive lines of a paste are usually the
      // same kind of spend, so this is right more often than DEFAULT_CATEGORY would be.
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
      const index = state.draft.items.findIndex((item) => item.key === action.key)
      if (index === -1) return state
      const items = state.draft.items.filter((item) => item.key !== action.key)
      // Focus must be resolved from the PRE-splice array or it lands on the wrong row.
      const next = state.draft.items[index + 1] ?? state.draft.items[index - 1]
      const focus: FocusRequest =
        items.length === 0 || !next
          ? { target: 'add-item' }
          : { target: 'item-delete', key: next.key }
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
      // `restored: true` so the persistence effect does not treat a deliberate reset as the
      // pre-read state and refuse to clear storage.
      return { ...initialState(action.todayISO), restored: true }

    default: {
      const never: never = action
      return never
    }
  }
}
