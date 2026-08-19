/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F05 — the pure half of /new: reducer, storage codec, validator.
 *
 *  This is where the real risk in the feature lives, and all of it is testable
 *  without React, jsdom or a render — which is the fourth reason the plan gives
 *  for choosing one reducer over ten useState calls.
 *
 *  The cases worth having are the ones where a bug is invisible:
 *   - focus after a delete, resolved from the PRE-splice array;
 *   - a parse failure still landing the user in an editable table;
 *   - a stored draft from a newer deploy being discarded, not downgraded;
 *   - a date that Date() silently rolls over (2026-02-31).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DRAFT_VERSION,
  MAX_AMOUNT,
  MAX_ITEMS,
  draftFromParsed,
  draftTotal,
  emptyItem,
  estimateRows,
  initialDraft,
  initialState,
  reducer,
  type AddExpenseState,
  type DraftExpense,
} from '../draft'
import {
  DRAFT_TTL_MS,
  ENVELOPE_VERSION,
  MAX_RAW_CHARS,
  clearDraft,
  draftKey,
  isDraftMeaningful,
  loadDraft,
  saveDraft,
} from '../draftStorage'
import { errorSummary, isValidIsoDate, validateDraft } from '../validate'

const TODAY = '2026-08-19'
const USER = 'usr000000001'

/** The canonical §1 paste, as F04 returns it. */
const parsed = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [
    { name: 'roti buaya', amount_idr: 38_500, category: 'food' as const },
    { name: 'ayam sambal hitam', amount_idr: 45_000, category: 'food' as const },
  ],
}

/** A draft with one usable row, for the validator cases. */
function validDraft(): DraftExpense {
  return {
    ...initialDraft(TODAY),
    stage: 'review',
    title: 'bakar duit tuesday',
    items: [{ ...emptyItem('food'), name: 'roti buaya', amountIdr: 38_500 }],
  }
}

function review(): AddExpenseState {
  return reducer(initialState(TODAY), { type: 'manual_entry' })
}

describe('reducer · stage transitions', () => {
  it('manual_entry opens the review table with exactly one blank row', () => {
    const state = review()
    expect(state.draft.stage).toBe('review')
    expect(state.draft.items).toHaveLength(1)
    expect(state.draft.source).toBe('manual')
  })

  it('manual_entry keeps rows that already exist rather than adding a second blank one', () => {
    const first = reducer(initialState(TODAY), {
      type: 'parse_success',
      parsed,
      source: 'llm',
      degraded: false,
    })
    const state = reducer(reducer(first, { type: 'back_to_paste' }), { type: 'manual_entry' })
    expect(state.draft.items).toHaveLength(2)
  })

  it('parse_success fills title, date, rows and source in one transition', () => {
    const state = reducer(initialState(TODAY), {
      type: 'parse_success',
      parsed,
      source: 'llm',
      degraded: false,
    })
    expect(state.draft.stage).toBe('review')
    expect(state.draft.title).toBe('bakar duit tuesday')
    expect(state.draft.occurredOn).toBe('2026-08-18')
    expect(state.draft.items.map((i) => i.amountIdr)).toEqual([38_500, 45_000])
    expect(state.draft.source).toBe('llm')
    expect(state.parse).toEqual({ kind: 'idle' })
  })

  it('set_raw clears the banner from the previous attempt', () => {
    const failed = reducer(initialState(TODAY), {
      type: 'parse_failure',
      failure: { code: 'rate_limited', message: 'Kebanyakan request.' },
    })
    expect(reducer(failed, { type: 'set_raw', value: 'x' }).parse).toEqual({ kind: 'idle' })
  })

  it('parse_success carries F04 s degraded flag onto the state', () => {
    const state = reducer(initialState(TODAY), {
      type: 'parse_success',
      parsed,
      source: 'fallback',
      degraded: true,
    })
    expect(state.degraded).toBe(true)
  })

  it('a fallback table clears degraded — its own banner explains it, and two notices would not', () => {
    const withFlag = reducer(initialState(TODAY), {
      type: 'parse_success',
      parsed,
      source: 'fallback',
      degraded: true,
    })
    const failed = reducer(withFlag, {
      type: 'parse_failure',
      failure: { code: 'offline', message: 'x' },
      fallback: parsed,
    })
    expect(failed.degraded).toBe(false)
    expect(failed.parse).toMatchObject({ kind: 'error' })
  })

  it('restore raises the notice; restore_none does not', () => {
    const draft = validDraft()
    expect(reducer(initialState(TODAY), { type: 'restore', draft })).toMatchObject({
      restored: true,
      restoredNotice: true,
    })
    expect(reducer(initialState(TODAY), { type: 'restore_none' })).toMatchObject({
      restored: true,
      restoredNotice: false,
    })
  })

  it('tapping Rapikan is acknowledgement enough to drop the restore notice', () => {
    const restored = reducer(initialState(TODAY), { type: 'restore', draft: validDraft() })
    expect(reducer(restored, { type: 'parse_start' }).restoredNotice).toBe(false)
  })

  it('dismiss_restored drops the notice without touching the draft', () => {
    const restored = reducer(initialState(TODAY), { type: 'restore', draft: validDraft() })
    const dismissed = reducer(restored, { type: 'dismiss_restored' })
    expect(dismissed.restoredNotice).toBe(false)
    expect(dismissed.draft).toEqual(restored.draft)
  })

  it('parse_start sizes the skeleton from the paste', () => {
    let state = reducer(initialState(TODAY), { type: 'set_raw', value: 'a\nb\nc\nd\ne' })
    state = reducer(state, { type: 'parse_start' })
    expect(state.parse).toMatchObject({ kind: 'loading', expectedRows: 4 })
  })
})

describe('reducer · the never-a-dead-end promise', () => {
  it('parse_failure with a fallback still lands in review', () => {
    const failure = { code: 'offline' as const, message: 'Tidak ada koneksi.' }
    const state = reducer(initialState(TODAY), { type: 'parse_failure', failure, fallback: parsed })

    expect(state.draft.stage).toBe('review')
    expect(state.draft.items).toHaveLength(2)
    expect(state.draft.source).toBe('fallback')
    // The banner survives the transition — that is what explains the rough table.
    expect(state.parse).toEqual({ kind: 'error', failure })
  })

  it('no_items_found opens the manual table with one blank row and keeps rawText', () => {
    let state = reducer(initialState(TODAY), { type: 'set_raw', value: 'catatan tanpa angka' })
    state = reducer(state, {
      type: 'parse_failure',
      failure: { code: 'no_items_found', message: 'Nggak nemu.' },
    })

    expect(state.draft.stage).toBe('review')
    expect(state.draft.items).toHaveLength(1)
    expect(state.draft.rawText).toBe('catatan tanpa angka')
  })

  it.each(['unauthorized', 'input_too_long', 'rate_limited', 'empty_input'] as const)(
    '%s keeps the user on the paste stage with the draft intact',
    (code) => {
      let state = reducer(initialState(TODAY), { type: 'set_raw', value: 'roti buaya 38500' })
      state = reducer(state, { type: 'parse_failure', failure: { code, message: 'x' } })

      expect(state.draft.stage).toBe('paste')
      expect(state.draft.rawText).toBe('roti buaya 38500')
      expect(state.draft.items).toHaveLength(0)
    },
  )
})

describe('reducer · item mutations and focus', () => {
  it('add_item appends and asks for focus on the new name field', () => {
    const state = reducer(review(), { type: 'add_item' })
    expect(state.draft.items).toHaveLength(2)
    expect(state.focus).toEqual({ target: 'item-name', key: state.draft.items[1]!.key })
  })

  it('add_item inherits the previous row s category', () => {
    let state = review()
    const key = state.draft.items[0]!.key
    state = reducer(state, { type: 'set_item_category', key, value: 'transport' })
    state = reducer(state, { type: 'add_item' })
    expect(state.draft.items[1]!.category).toBe('transport')
  })

  it('add_item refuses past MAX_ITEMS and says so at form level', () => {
    let state = review()
    for (let i = 1; i < MAX_ITEMS; i += 1) state = reducer(state, { type: 'add_item' })
    expect(state.draft.items).toHaveLength(MAX_ITEMS)

    const blocked = reducer(state, { type: 'add_item' })
    expect(blocked.draft.items).toHaveLength(MAX_ITEMS)
    expect(blocked.errors.form).toBe(`Maksimal ${MAX_ITEMS} item.`)
  })

  it('remove_item moves focus to the FOLLOWING row', () => {
    let state = reducer(reducer(review(), { type: 'add_item' }), { type: 'add_item' })
    const [a, b] = state.draft.items
    state = reducer(state, { type: 'remove_item', key: a!.key })

    expect(state.draft.items).toHaveLength(2)
    expect(state.focus).toEqual({ target: 'item-delete', key: b!.key })
  })

  it('removing the LAST row falls back to the previous one', () => {
    let state = reducer(review(), { type: 'add_item' })
    const [a, b] = state.draft.items
    state = reducer(state, { type: 'remove_item', key: b!.key })
    expect(state.focus).toEqual({ target: 'item-delete', key: a!.key })
  })

  it('removing the ONLY row sends focus to + Tambah item', () => {
    const state = review()
    const emptied = reducer(state, { type: 'remove_item', key: state.draft.items[0]!.key })
    expect(emptied.draft.items).toHaveLength(0)
    expect(emptied.focus).toEqual({ target: 'add-item' })
  })

  it('remove_item on an unknown key is a no-op, not a crash', () => {
    const state = review()
    expect(reducer(state, { type: 'remove_item', key: 'nope' })).toBe(state)
  })

  it('remove_item drops that row s errors and leaves the others', () => {
    let state = reducer(review(), { type: 'add_item' })
    const [a, b] = state.draft.items
    state = reducer(state, {
      type: 'invalid',
      errors: { items: { [a!.key]: { name: 'x' }, [b!.key]: { name: 'y' } } },
      focus: null,
    })
    state = reducer(state, { type: 'remove_item', key: a!.key })

    expect(state.errors.items[a!.key]).toBeUndefined()
    expect(state.errors.items[b!.key]).toEqual({ name: 'y' })
  })

  it('set_item_amount clamps out-of-range and non-integer values to null', () => {
    let state = review()
    const key = state.draft.items[0]!.key

    state = reducer(state, { type: 'set_item_amount', key, value: 45_000 })
    expect(state.draft.items[0]!.amountIdr).toBe(45_000)

    state = reducer(state, { type: 'set_item_amount', key, value: MAX_AMOUNT + 1 })
    expect(state.draft.items[0]!.amountIdr).toBeNull()

    state = reducer(state, { type: 'set_item_amount', key, value: -1 })
    expect(state.draft.items[0]!.amountIdr).toBeNull()

    state = reducer(state, { type: 'set_item_amount', key, value: 1.5 })
    expect(state.draft.items[0]!.amountIdr).toBeNull()
  })

  it('item_amount_unparsed keeps the raw text so the error can quote it', () => {
    let state = review()
    const key = state.draft.items[0]!.key
    state = reducer(state, { type: 'item_amount_unparsed', key, rawText: 'dua puluh' })

    expect(state.draft.items[0]!.amountRaw).toBe('dua puluh')
    expect(state.draft.items[0]!.amountIdr).toBeNull()
    expect(validateDraft(state.draft)?.errors.items[key]?.amount).toContain('dua puluh')
  })

  it('editing a field clears only that field s error', () => {
    let state = review()
    const key = state.draft.items[0]!.key
    state = reducer(state, {
      type: 'invalid',
      errors: { items: { [key]: { name: 'a', amount: 'b' } } },
      focus: null,
    })

    state = reducer(state, { type: 'set_item_name', key, value: 'roti' })
    expect(state.errors.items[key]).toEqual({ amount: 'b' })

    state = reducer(state, { type: 'set_item_amount', key, value: 1 })
    expect(state.errors.items[key]).toBeUndefined()
  })

  it('truncates an over-long item name rather than letting the server reject it', () => {
    const state = review()
    const key = state.draft.items[0]!.key
    const next = reducer(state, { type: 'set_item_name', key, value: 'x'.repeat(500) })
    expect(next.draft.items[0]!.name).toHaveLength(120)
  })
})

describe('reducer · save and reset', () => {
  it('save_start clears stale errors so a retry does not show the old ones', () => {
    let state = reducer(review(), {
      type: 'invalid',
      errors: { items: {}, form: 'x' },
      focus: null,
    })
    state = reducer(state, { type: 'save_start' })
    expect(state.save).toEqual({ kind: 'saving' })
    expect(state.errors.form).toBeUndefined()
  })

  it('save_failure leaves the draft completely untouched', () => {
    const before = review()
    const after = reducer(reducer(before, { type: 'save_start' }), {
      type: 'save_failure',
      message: 'Gagal menyimpan.',
    })
    expect(after.draft).toEqual(before.draft)
    expect(after.save).toEqual({ kind: 'error', message: 'Gagal menyimpan.' })
  })

  it('reset returns to an empty paste stage and stays restored', () => {
    const state = reducer(review(), { type: 'reset', todayISO: TODAY })
    expect(state.draft.stage).toBe('paste')
    expect(state.draft.items).toHaveLength(0)
    // restored must stay true, or the persistence effect treats this as the pre-read state.
    expect(state.restored).toBe(true)
  })
})

describe('helpers', () => {
  it('draftTotal ignores unparseable rows', () => {
    expect(draftTotal([{ ...emptyItem(), amountIdr: 100 }, emptyItem()])).toBe(100)
  })

  it('draftTotal reproduces the canonical Rp 266.350', () => {
    const amounts = [38_500, 45_000, 49_000, 49_000, 58_850, 26_000]
    expect(draftTotal(amounts.map((n) => ({ ...emptyItem(), amountIdr: n })))).toBe(266_350)
  })

  it('estimateRows clamps to 3..8', () => {
    expect(estimateRows('a\nb')).toBe(3)
    expect(estimateRows(Array(30).fill('x').join('\n'))).toBe(8)
  })

  it('estimateRows guesses 6 for the canonical 7-line paste', () => {
    expect(estimateRows(Array(7).fill('x').join('\n'))).toBe(6)
  })

  it('draftFromParsed coerces an unknown category rather than trusting the wire', () => {
    const draft = draftFromParsed(
      { ...parsed, items: [{ name: 'x', amount_idr: 1, category: 'crypto' as never }] },
      initialDraft(TODAY),
      'llm',
    )
    expect(draft.items[0]!.category).toBe('other')
  })

  it('draftFromParsed caps at MAX_ITEMS', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `x${i}`,
      amount_idr: 1,
      category: 'other' as const,
    }))
    expect(
      draftFromParsed({ ...parsed, items: many }, initialDraft(TODAY), 'llm').items,
    ).toHaveLength(MAX_ITEMS)
  })
})

describe('validate', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(validDraft())).toBeNull()
  })

  it('rejects an empty draft with both a title error and a form error', () => {
    const result = validateDraft(initialState(TODAY).draft)
    expect(result?.errors.title).toBe('Judul belum diisi.')
    expect(result?.errors.form).toBe('Tambahkan minimal satu item.')
    // Focus goes to the FIRST problem in reading order, which is the title.
    expect(result?.focus).toEqual({ target: 'element', id: 'draft-title' })
  })

  it('rejects 2026-02-31, which Date silently rolls into March', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('18/8/2026')).toBe(false)
    expect(isValidIsoDate('2026-08-18')).toBe(true)
  })

  it('counts a row with two problems as two', () => {
    const draft = { ...validDraft(), items: [emptyItem()] }
    const result = validateDraft(draft)
    expect(result?.count).toBe(2)
    expect(result?.errors.items[draft.items[0]!.key]).toEqual({
      name: 'Nama item belum diisi.',
      amount: 'Jumlah belum diisi.',
    })
  })

  it('sends focus to the first bad ROW when the header fields are fine', () => {
    const bad = emptyItem()
    const draft = { ...validDraft(), items: [validDraft().items[0]!, bad] }
    expect(validateDraft(draft)?.focus).toEqual({ target: 'item-name', key: bad.key })
  })

  it('rejects an amount over the schema cap', () => {
    const draft = validDraft()
    draft.items[0]!.amountIdr = MAX_AMOUNT + 1
    expect(validateDraft(draft)?.errors.items[draft.items[0]!.key]?.amount).toBe(
      'Jumlah terlalu besar.',
    )
  })

  it('rejects a note longer than the schema allows', () => {
    const draft = { ...validDraft(), note: 'x'.repeat(2_001) }
    expect(validateDraft(draft)?.errors.note).toContain('maks 2000')
  })

  it('errorSummary is singular for one and plural for more', () => {
    expect(errorSummary(1)).toBe('Ada 1 isian yang perlu diperbaiki.')
    expect(errorSummary(3)).toBe('Ada 3 isian yang perlu diperbaiki.')
  })
})

/* ── storage ──────────────────────────────────────────────────────────────────
 * The suite runs in the `node` environment, so there is no window. A minimal
 * localStorage stand-in is enough: the codec only ever calls getItem, setItem and
 * removeItem, and standing one up is how the quota branch becomes testable at all.
 * ─────────────────────────────────────────────────────────────────────────── */

type FakeStorage = {
  store: Map<string, string>
  throwOnWrite: boolean
  throwOnRead: boolean
}

const fake: FakeStorage = { store: new Map(), throwOnWrite: false, throwOnRead: false }

beforeEach(() => {
  fake.store.clear()
  fake.throwOnWrite = false
  fake.throwOnRead = false
  vi.stubGlobal('window', {
    localStorage: {
      getItem(key: string) {
        if (fake.throwOnRead) throw new Error('SecurityError')
        return fake.store.get(key) ?? null
      },
      setItem(key: string, value: string) {
        if (fake.throwOnWrite) throw new Error('QuotaExceededError')
        fake.store.set(key, value)
      },
      removeItem(key: string) {
        fake.store.delete(key)
      },
    },
  })
})

describe('draftStorage', () => {
  it('round-trips a meaningful draft', () => {
    const draft = validDraft()
    saveDraft(USER, draft)
    expect(loadDraft(USER)).toEqual(draft)
  })

  it('keys per user, so one person s paste never appears in another s /new', () => {
    saveDraft(USER, validDraft())
    expect(loadDraft('usr000000002')).toBeNull()
    expect(fake.store.has(draftKey(USER))).toBe(true)
  })

  it('removes rather than stores an empty draft', () => {
    fake.store.set(draftKey(USER), 'stale')
    saveDraft(USER, initialDraft(TODAY))
    expect(fake.store.has(draftKey(USER))).toBe(false)
  })

  it('isDraftMeaningful notices each thing a user would hate to lose', () => {
    const base = initialDraft(TODAY)
    expect(isDraftMeaningful(base)).toBe(false)
    expect(isDraftMeaningful({ ...base, rawText: ' x ' })).toBe(true)
    expect(isDraftMeaningful({ ...base, title: 'x' })).toBe(true)
    expect(isDraftMeaningful({ ...base, note: 'x' })).toBe(true)
    expect(isDraftMeaningful({ ...base, items: [emptyItem()] })).toBe(false)
    expect(isDraftMeaningful({ ...base, items: [{ ...emptyItem(), amountIdr: 0 }] })).toBe(true)
    expect(
      isDraftMeaningful({
        ...base,
        photos: [{ blobUrl: 'u', blobPathname: 'p', width: 1, height: 1, sizeBytes: 1 }],
      }),
    ).toBe(true)
  })

  it('truncates only what it PERSISTS, never the in-memory draft', () => {
    const draft = { ...validDraft(), rawText: 'x'.repeat(MAX_RAW_CHARS + 500) }
    saveDraft(USER, draft)

    expect(draft.rawText).toHaveLength(MAX_RAW_CHARS + 500)
    expect(loadDraft(USER)?.rawText).toHaveLength(MAX_RAW_CHARS)
  })

  it('survives a QuotaExceededError without throwing — a frozen keyboard is worse', () => {
    fake.throwOnWrite = true
    expect(() => saveDraft(USER, validDraft())).not.toThrow()
    expect(loadDraft(USER)).toBeNull()
  })

  it('survives storage being unreadable at all (Safari private mode)', () => {
    fake.throwOnRead = true
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft past the 7-day TTL', () => {
    const envelope = {
      v: ENVELOPE_VERSION,
      savedAt: Date.now() - DRAFT_TTL_MS - 1,
      draft: validDraft(),
    }
    fake.store.set(draftKey(USER), JSON.stringify(envelope))

    expect(loadDraft(USER)).toBeNull()
    expect(fake.store.has(draftKey(USER))).toBe(false)
  })

  it('discards an envelope version it does not know, rather than guessing', () => {
    fake.store.set(
      draftKey(USER),
      JSON.stringify({ v: 99, savedAt: Date.now(), draft: validDraft() }),
    )
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft whose shape does not match the current version', () => {
    fake.store.set(
      draftKey(USER),
      JSON.stringify({
        v: ENVELOPE_VERSION,
        savedAt: Date.now(),
        draft: { ...validDraft(), version: DRAFT_VERSION + 1 },
      }),
    )
    expect(loadDraft(USER)).toBeNull()
  })

  it.each([
    ['unparseable JSON', 'not json at all'],
    ['a missing savedAt', JSON.stringify({ v: ENVELOPE_VERSION, draft: validDraft() })],
    [
      'a bad item row',
      JSON.stringify({
        v: ENVELOPE_VERSION,
        savedAt: Date.now(),
        draft: { ...validDraft(), items: [{ key: 1 }] },
      }),
    ],
    [
      'a bad photo row',
      JSON.stringify({
        v: ENVELOPE_VERSION,
        savedAt: Date.now(),
        draft: { ...validDraft(), photos: [{ blobUrl: 'u' }] },
      }),
    ],
    [
      'an unknown stage',
      JSON.stringify({
        v: ENVELOPE_VERSION,
        savedAt: Date.now(),
        draft: { ...validDraft(), stage: 'photos' },
      }),
    ],
  ])('discards %s and clears the key', (_label, stored) => {
    fake.store.set(draftKey(USER), stored)
    expect(loadDraft(USER)).toBeNull()
    expect(fake.store.has(draftKey(USER))).toBe(false)
  })

  it('clearDraft removes the key', () => {
    saveDraft(USER, validDraft())
    clearDraft(USER)
    expect(loadDraft(USER)).toBeNull()
  })
})
