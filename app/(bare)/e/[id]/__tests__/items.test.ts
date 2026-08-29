/**
 * The optimistic reducer behind `/e/[id]`.
 *
 * This is the state machine every edit on the detail screen passes through before the server
 * confirms it, so a bug here shows the user a number that is wrong for 200ms and right
 * afterwards — the hardest kind to notice and the easiest to disbelieve. Pure function, so it
 * is tested as one.
 *
 * The `insert` ordering case is the one with a product requirement attached: "Urungkan" has to
 * put a deleted row back where it was, which is what R-16's optional `sortOrder` exists for.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ItemRow } from '@/lib/db/queries'

import { nextSortOrder, reduceItems, totalOf, type EditableItem, type EditableMeta } from '../items'
import type { GroupDetail } from '@/lib/db/queries'

const items: EditableItem[] = [
  { id: 'itm000000001', name: 'roti buaya', amountIdr: 38_500, category: 'meals', sortOrder: 0 },
  {
    id: 'itm000000002',
    name: 'kungfu soccer',
    amountIdr: 49_000,
    category: 'entertainment',
    sortOrder: 1,
  },
  { id: 'itm000000003', name: 'pak gembus', amountIdr: 26_000, category: 'meals', sortOrder: 2 },
]

describe('reduceItems', () => {
  it('patches one item and leaves the others identical', () => {
    const next = reduceItems(items, {
      type: 'patch',
      id: 'itm000000002',
      patch: { amountIdr: 45_000, category: 'housing' },
    })

    expect(next[1]).toEqual({ ...items[1], amountIdr: 45_000, category: 'housing' })
    expect(next[0]).toBe(items[0])
    expect(next[2]).toBe(items[2])
    // Never mutates: React compares the previous and next optimistic state by reference.
    expect(items[1]!.amountIdr).toBe(49_000)
  })

  it('ignores a patch for an id that is no longer there', () => {
    expect(reduceItems(items, { type: 'patch', id: 'gone', patch: { name: 'x' } })).toEqual(items)
  })

  it('removes by id', () => {
    const next = reduceItems(items, { type: 'remove', id: 'itm000000001' })
    expect(next.map((i) => i.id)).toEqual(['itm000000002', 'itm000000003'])
  })

  it('re-inserts a restored item at its ORIGINAL position, not at the end', () => {
    const deleted = items[1]!
    const without = reduceItems(items, { type: 'remove', id: deleted.id })

    const restored = reduceItems(without, {
      type: 'insert',
      item: { ...deleted, id: 'optimistic_1_kungfu soccer' },
    })

    expect(restored.map((i) => i.name)).toEqual(['roti buaya', 'kungfu soccer', 'pak gembus'])
  })

  it('appends a brand-new item after everything on screen', () => {
    const sortOrder = nextSortOrder(items)
    expect(sortOrder).toBe(3)

    const next = reduceItems(items, {
      type: 'insert',
      item: {
        id: 'optimistic_3_es teh',
        name: 'es teh',
        amountIdr: 6_000,
        category: 'meals',
        sortOrder,
      },
    })

    expect(next.at(-1)!.name).toBe('es teh')
  })

  it('breaks a sortOrder tie on id, so the order cannot flicker between renders', () => {
    const tied: EditableItem[] = [
      { id: 'b', name: 'b', amountIdr: 1, category: 'other', sortOrder: 0 },
      { id: 'c', name: 'c', amountIdr: 1, category: 'other', sortOrder: 0 },
    ]
    const next = reduceItems(tied, {
      type: 'insert',
      item: { id: 'a', name: 'a', amountIdr: 1, category: 'other', sortOrder: 0 },
    })
    expect(next.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('totalOf and nextSortOrder', () => {
  it('sums the canonical paste', () => {
    expect(totalOf(items)).toBe(113_500)
  })

  it('is 0 and 0 for an empty group', () => {
    expect(totalOf([])).toBe(0)
    expect(nextSortOrder([])).toBe(0)
  })

  it('does not assume sortOrder is dense or sorted', () => {
    expect(
      nextSortOrder([
        { ...items[0]!, sortOrder: 41 },
        { ...items[1]!, sortOrder: 7 },
      ]),
    ).toBe(42)
  })
})

/**
 * `EditableItem` / `EditableMeta` are re-declared in a client module rather than imported from
 * `lib/db/queries.ts`, which imports the Drizzle client (R-77's PhotoDTO reasoning). Duplication
 * is only safe while divergence breaks something — this is that something.
 */
describe('client types stay assignable from F03s rows', () => {
  it('accepts an ItemRow as an EditableItem', () => {
    expectTypeOf<ItemRow>().toExtend<EditableItem>()
    expectTypeOf<EditableItem>().toExtend<ItemRow>()
  })

  it('accepts a GroupDetails meta fields as EditableMeta', () => {
    expectTypeOf<Pick<GroupDetail, 'title' | 'occurredOn' | 'note'>>().toExtend<EditableMeta>()
  })
})
