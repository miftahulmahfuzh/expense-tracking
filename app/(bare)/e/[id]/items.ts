import type { Category } from '@/lib/categories'

/**
 * The client-side shape of an expense group, and the optimistic reducer over its items.
 *
 * WHY THESE TYPES ARE RE-DECLARED RATHER THAN IMPORTED. `ItemRow` and `GroupDetail` live in
 * `lib/db/queries.ts`, which imports the Drizzle client — and `ExpenseEditor` is a
 * `'use client'` module. A type-only import is erased at build time, but it is one careless
 * edit away from a value import that drags the database into the browser bundle. F06 made the
 * same call for `PhotoDTO` and R-77 recorded it: duplication is only safe while divergence
 * breaks something, so `expenseEditor.test.ts` asserts these stay assignable from F03's rows.
 *
 * The reducer is exported separately from the component so it can be tested as what it is: a
 * pure function. React state transitions are the easiest thing in a React app to get wrong and
 * the hardest to see going wrong.
 */

export interface EditableItem {
  id: string
  name: string
  amountIdr: number
  category: Category
  sortOrder: number
}

export interface EditableMeta {
  title: string
  /** 'YYYY-MM-DD' */
  occurredOn: string
  note: string | null
}

export type ItemAction =
  | { type: 'patch'; id: string; patch: Partial<Omit<EditableItem, 'id'>> }
  | { type: 'remove'; id: string }
  | { type: 'insert'; item: EditableItem }

export function reduceItems(state: EditableItem[], action: ItemAction): EditableItem[] {
  switch (action.type) {
    case 'patch':
      return state.map((item) => (item.id === action.id ? { ...item, ...action.patch } : item))
    case 'remove':
      return state.filter((item) => item.id !== action.id)
    case 'insert':
      /*
       * Sorted by (sortOrder, id) — the same ORDER BY `getGroupDetail` uses. That is what
       * makes "Urungkan" put a restored row back in its ORIGINAL position instead of at the
       * bottom: the row is re-inserted with the sort order it had, and this sort is what
       * honours it before the server render arrives to confirm it.
       */
      return [...state, action.item].sort(
        (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
  }
}

export function totalOf(items: readonly EditableItem[]): number {
  return items.reduce((sum, item) => sum + item.amountIdr, 0)
}

/** Where a brand-new item goes: after everything currently on screen. */
export function nextSortOrder(items: readonly EditableItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
}
