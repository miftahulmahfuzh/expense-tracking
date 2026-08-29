// F03a Task 7 — lib/schema/expense.ts.
//
// ParsedExpense is roadmap §4.3, AUTHORITATIVE, and is byte-for-byte the shape of the
// GLM tool's input_schema (F04). The action inputs below it are the parse gate on every
// Server Action argument — which is attacker-controlled, because reconciliation R-5
// established that proxy.ts does not cover Server Functions and each action is its own
// security boundary.

import { describe, expect, it } from 'vitest'
import {
  AddItemInput,
  AmountIdrSchema,
  AttachPhotoInput,
  CategorySchema,
  CreateExpenseInput,
  DateISOSchema,
  IdSchema,
  MonthKeySchema,
  NewPhotoInputSchema,
  NoteSchema,
  ParseRequest,
  ParsedExpense,
  ParsedItem,
  TitleSchema,
  UpdateExpenseMetaInput,
  UpdateItemInput,
} from '@/lib/schema/expense'

/** Roadmap §1's canonical paste, as the parser must render it. */
const CANONICAL = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [
    { name: 'roti buaya', amount_idr: 38500, category: 'meals' },
    { name: 'ayam sambal hitam', amount_idr: 45000, category: 'meals' },
    { name: 'perumahan laddaland', amount_idr: 49000, category: 'entertainment' },
    { name: 'kungfu soccer', amount_idr: 49000, category: 'entertainment' },
    { name: 'fan fries plaza blok m', amount_idr: 58850, category: 'meals' },
    { name: 'pak gembus', amount_idr: 26000, category: 'meals' },
  ],
}

describe('ParsedExpense — the canonical example (roadmap §1, §4.3)', () => {
  it('accepts it and totals Rp 266.350', () => {
    const parsed = ParsedExpense.parse(CANONICAL)
    expect(parsed.items).toHaveLength(6)
    expect(parsed.title).toBe('bakar duit tuesday')
    expect(parsed.occurred_on).toBe('2026-08-18')
    expect(parsed.items.reduce((sum, i) => sum + i.amount_idr, 0)).toBe(266350)
  })

  it('trims the title rather than storing the whitespace', () => {
    expect(ParsedExpense.parse({ ...CANONICAL, title: '  bakar duit tuesday  ' }).title).toBe(
      'bakar duit tuesday',
    )
  })

  it('is snake_case at the LLM boundary — that asymmetry is intentional', () => {
    // §4.3 uses snake_case because it is the tool input_schema; §4.4's action inputs use
    // camelCase. The two must not be quietly harmonised.
    expect(Object.keys(ParsedExpense.parse(CANONICAL))).toEqual(['title', 'occurred_on', 'items'])
    expect(Object.keys(ParsedItem.parse(CANONICAL.items[0]))).toEqual([
      'name',
      'amount_idr',
      'category',
    ])
  })
})

describe('ParsedExpense — rejections', () => {
  const bad: ReadonlyArray<readonly [string, unknown]> = [
    ['no items', { ...CANONICAL, items: [] }],
    ['51 items', { ...CANONICAL, items: Array(51).fill(CANONICAL.items[0]) }],
    ['a title of only whitespace', { ...CANONICAL, title: '   ' }],
    ['a 121-char title', { ...CANONICAL, title: 'x'.repeat(121) }],
    ['a missing title', { occurred_on: '2026-08-18', items: CANONICAL.items }],
    ['a dd/mm/yyyy date', { ...CANONICAL, occurred_on: '18/08/2026' }],
    ['a timestamp', { ...CANONICAL, occurred_on: '2026-08-18T00:00:00Z' }],
    ['a negative amount', { ...CANONICAL, items: [{ ...CANONICAL.items[0], amount_idr: -1 }] }],
    [
      'an amount over 1e9',
      { ...CANONICAL, items: [{ ...CANONICAL.items[0], amount_idr: 1_000_000_001 }] },
    ],
    ['a fractional amount', { ...CANONICAL, items: [{ ...CANONICAL.items[0], amount_idr: 1.5 }] }],
    [
      'an amount as a string',
      { ...CANONICAL, items: [{ ...CANONICAL.items[0], amount_idr: '45000' }] },
    ],
    [
      'an invented category',
      { ...CANONICAL, items: [{ ...CANONICAL.items[0], category: 'makanan' }] },
    ],
    [
      'a 121-char item name',
      { ...CANONICAL, items: [{ ...CANONICAL.items[0], name: 'x'.repeat(121) }] },
    ],
    [
      'an item name of only whitespace',
      { ...CANONICAL, items: [{ ...CANONICAL.items[0], name: ' ' }] },
    ],
  ]

  it.each(bad)('rejects %s', (_label, value) => {
    expect(ParsedExpense.safeParse(value).success).toBe(false)
  })

  it('accepts exactly 50 items and exactly 1e9', () => {
    // The boundaries themselves are legal — off-by-one in either direction is a bug the
    // user hits on a long receipt.
    expect(
      ParsedExpense.safeParse({ ...CANONICAL, items: Array(50).fill(CANONICAL.items[0]) }).success,
    ).toBe(true)
    expect(
      ParsedExpense.safeParse({
        ...CANONICAL,
        items: [{ ...CANONICAL.items[0], amount_idr: 1_000_000_000 }],
      }).success,
    ).toBe(true)
    expect(
      ParsedExpense.safeParse({ ...CANONICAL, items: [{ ...CANONICAL.items[0], amount_idr: 0 }] })
        .success,
    ).toBe(true)
  })
})

describe('primitives', () => {
  it('IdSchema matches lib/id.ts isValidId', () => {
    expect(IdSchema.safeParse('abcDEF123_-x').success).toBe(true)
    for (const bad of ['', 'short', 'a'.repeat(13), 'has spaces!', 'abcdefghijk/']) {
      expect(IdSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('DateISOSchema and MonthKeySchema mirror the §4.3 regexes', () => {
    expect(DateISOSchema.safeParse('2026-08-18').success).toBe(true)
    expect(DateISOSchema.safeParse('2026-8-18').success).toBe(false)
    expect(MonthKeySchema.safeParse('2026-08').success).toBe(true)
    expect(MonthKeySchema.safeParse('2026-13').success).toBe(false)
    expect(MonthKeySchema.safeParse('2026-00').success).toBe(false)
  })

  it('AmountIdrSchema is a whole rupiah in [0, 1e9]', () => {
    expect(AmountIdrSchema.safeParse(0).success).toBe(true)
    expect(AmountIdrSchema.safeParse(1_000_000_000).success).toBe(true)
    expect(AmountIdrSchema.safeParse(-1).success).toBe(false)
    expect(AmountIdrSchema.safeParse(1.5).success).toBe(false)
    expect(AmountIdrSchema.safeParse(Number.NaN).success).toBe(false)
  })

  it('CategorySchema is the 17 slugs', () => {
    expect(CategorySchema.safeParse('meals').success).toBe(true)
    expect(CategorySchema.safeParse('Food').success).toBe(false)
    expect(CategorySchema.options).toHaveLength(17)
  })

  it('TitleSchema trims then bounds; NoteSchema allows empty but caps at 2000', () => {
    expect(TitleSchema.parse('  a  ')).toBe('a')
    expect(TitleSchema.safeParse('   ').success).toBe(false)
    expect(NoteSchema.parse('  ')).toBe('')
    expect(NoteSchema.safeParse('x'.repeat(2_000)).success).toBe(true)
    expect(NoteSchema.safeParse('x'.repeat(2_001)).success).toBe(false)
  })
})

describe('CreateExpenseInput (reconciliation R-2)', () => {
  it('accepts a bare ParsedExpense', () => {
    expect(CreateExpenseInput.safeParse(CANONICAL).success).toBe(true)
  })

  it('accepts note, rawText and staged photos', () => {
    const parsed = CreateExpenseInput.parse({
      ...CANONICAL,
      note: 'ditraktir',
      rawText: 'bakar duit tuesday - 18/8/2026\nroti buaya 38500',
      photos: [
        {
          blobUrl: 'https://example.public.blob.vercel-storage.com/photos/abc.jpg',
          blobPathname: 'photos/abc.jpg',
          width: 1600,
          height: 1200,
          sizeBytes: 280_000,
        },
      ],
    })
    expect(parsed.photos).toHaveLength(1)
  })

  it('takes `photos`, not `photoIds` — photoIds was unimplementable', () => {
    // expense_photos.group_id is NOT NULL with an FK, so no photo row and therefore no
    // photo id can exist before its group does. R-2: bytes upload first, then
    // createExpense inserts group + items + photo rows in one db.batch().
    expect('photoIds' in CreateExpenseInput.shape).toBe(false)
    expect('photos' in CreateExpenseInput.shape).toBe(true)
    const withIds = CreateExpenseInput.parse({ ...CANONICAL, photoIds: ['abcDEF123_-x'] })
    expect(withIds).not.toHaveProperty('photoIds')
  })

  /*
   * This bound is STRUCTURAL, and is no longer the number a user meets. The per-group cap
   * became configuration (`PHOTO_MAX_PER_GROUP`, default 20) and is enforced per request in
   * app/actions/expenses.ts; 50 here is only the outer edge of a sane payload, and exists so
   * a malformed env var cannot widen this schema. tests/photos.cap.test.ts asserts the
   * relationship between the two — that this bound never undercuts PHOTO_CAP_CEILING, which
   * is the way the env var silently stops working above 20.
   */
  it('bounds the gallery structurally at 50 photos, above any configured cap', () => {
    const photo = {
      blobUrl: 'https://example.public.blob.vercel-storage.com/photos/a.jpg',
      blobPathname: 'photos/a.jpg',
      width: 1,
      height: 1,
      sizeBytes: 1,
    }
    expect(
      CreateExpenseInput.safeParse({ ...CANONICAL, photos: Array(50).fill(photo) }).success,
    ).toBe(true)
    expect(
      CreateExpenseInput.safeParse({ ...CANONICAL, photos: Array(51).fill(photo) }).success,
    ).toBe(false)
  })
})

describe('NewPhotoInputSchema', () => {
  const ok = {
    blobUrl: 'https://example.public.blob.vercel-storage.com/photos/a.jpg',
    blobPathname: 'photos/a.jpg',
    width: 1600,
    height: 1200,
    sizeBytes: 280_000,
  }

  it("matches F06's StagedPhoto exactly — every field required", () => {
    expect(NewPhotoInputSchema.safeParse(ok).success).toBe(true)
    for (const key of Object.keys(ok)) {
      const partial = { ...ok } as Record<string, unknown>
      delete partial[key]
      expect(NewPhotoInputSchema.safeParse(partial).success).toBe(false)
    }
  })

  it('requires a real URL', () => {
    expect(NewPhotoInputSchema.safeParse({ ...ok, blobUrl: 'photos/a.jpg' }).success).toBe(false)
  })
})

describe('UpdateExpenseMetaInput', () => {
  it('accepts a single field and clearing the note', () => {
    expect(UpdateExpenseMetaInput.parse({ title: 'baru' })).toEqual({ title: 'baru' })
    expect(UpdateExpenseMetaInput.parse({ note: null })).toEqual({ note: null })
    expect(UpdateExpenseMetaInput.parse({ occurredOn: '2026-08-18' }).occurredOn).toBe('2026-08-18')
  })

  it('rejects an empty patch — "nothing to update" is a caller bug', () => {
    expect(UpdateExpenseMetaInput.safeParse({}).success).toBe(false)
  })

  it('is camelCase, unlike the §4.3 LLM boundary', () => {
    expect(UpdateExpenseMetaInput.safeParse({ occurred_on: '2026-08-18' }).success).toBe(false)
  })
})

describe('AddItemInput (reconciliation R-16)', () => {
  it('accepts the three required fields', () => {
    expect(AddItemInput.parse({ name: 'kopi', amountIdr: 26000, category: 'meals' })).toEqual({
      name: 'kopi',
      amountIdr: 26000,
      category: 'meals',
    })
  })

  it('accepts an optional sortOrder so undo restores the original position', () => {
    // Without it the restored row lands at the bottom of the list, which reads as a
    // second bug on top of the delete the user just undid.
    expect(
      AddItemInput.parse({ name: 'kopi', amountIdr: 26000, category: 'meals', sortOrder: 3 })
        .sortOrder,
    ).toBe(3)
    expect(
      AddItemInput.safeParse({ name: 'kopi', amountIdr: 26000, category: 'meals', sortOrder: -1 })
        .success,
    ).toBe(false)
    expect(
      AddItemInput.safeParse({ name: 'kopi', amountIdr: 26000, category: 'meals', sortOrder: 1.5 })
        .success,
    ).toBe(false)
  })

  it('omitting sortOrder leaves it undefined — unchanged behaviour', () => {
    expect(
      AddItemInput.parse({ name: 'kopi', amountIdr: 26000, category: 'meals' }).sortOrder,
    ).toBeUndefined()
  })
})

describe('UpdateItemInput', () => {
  it('accepts any single field', () => {
    expect(UpdateItemInput.parse({ amountIdr: 1 }).amountIdr).toBe(1)
    expect(UpdateItemInput.parse({ category: 'health' }).category).toBe('health')
  })

  it('rejects an empty patch', () => {
    expect(() => UpdateItemInput.parse({})).toThrow()
  })
})

describe('AttachPhotoInput', () => {
  it('requires a group id and a URL, and leaves the dimensions optional', () => {
    expect(
      AttachPhotoInput.safeParse({
        groupId: 'abcDEF123_-x',
        blobUrl: 'https://example.public.blob.vercel-storage.com/photos/a.jpg',
        blobPathname: 'photos/a.jpg',
      }).success,
    ).toBe(true)
    expect(
      AttachPhotoInput.safeParse({
        groupId: 'nope',
        blobUrl: 'https://example.public.blob.vercel-storage.com/photos/a.jpg',
        blobPathname: 'photos/a.jpg',
      }).success,
    ).toBe(false)
  })
})

describe('ParseRequest (§4.5)', () => {
  it('requires non-empty text and a Jakarta today', () => {
    expect(ParseRequest.parse({ rawText: '  kopi 26k  ', todayISO: '2026-08-18' }).rawText).toBe(
      'kopi 26k',
    )
    expect(ParseRequest.safeParse({ rawText: '   ', todayISO: '2026-08-18' }).success).toBe(false)
    expect(ParseRequest.safeParse({ rawText: 'kopi', todayISO: 'today' }).success).toBe(false)
    expect(
      ParseRequest.safeParse({ rawText: 'x'.repeat(20_001), todayISO: '2026-08-18' }).success,
    ).toBe(false)
  })
})
