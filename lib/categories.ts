/**
 * The 8 expense categories. AUTHORITATIVE — roadmap §4.1.
 * Exactly 8 so the picker fits a 2×4 tap grid in a bottom sheet (F07/F10).
 * Order below IS the display order of that grid.
 *
 * Reconciliation R-7: F10 also authored a `lib/categories.ts`. This one wins, verbatim,
 * because F08 had already built against `CATEGORY_META` and against `color` being the
 * custom-property NAME. F10 owns the *values* of the `--color-cat-*` properties in
 * app/globals.css; this module owns the names. Neither keeps a private copy.
 */
export const CATEGORIES = [
  'food', // Makan & Jajan — warung, resto, kopi, snack
  'groceries', // Belanja Harian — Indomaret, Alfamart, supermarket
  'transport', // Transport — bensin, parkir, tol, ojek, grab
  'bills', // Tagihan — internet, listrik, pulsa, IPL, iuran
  'housing', // Tempat Tinggal — sewa apartemen, kos, service charge
  'entertainment', // Hiburan — bioskop, game, langganan streaming
  'health', // Kesehatan — obat, dokter, vitamin
  'other', // Lainnya
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
  food: {
    id: 'food',
    label: 'Makan & Jajan',
    emoji: '🍜',
    color: '--color-cat-food',
    hint: 'warung, resto, kopi, snack',
  },
  groceries: {
    id: 'groceries',
    label: 'Belanja Harian',
    emoji: '🛒',
    color: '--color-cat-groceries',
    hint: 'Indomaret, Alfamart, supermarket',
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    emoji: '🛵',
    color: '--color-cat-transport',
    hint: 'bensin, parkir, tol, ojek, grab',
  },
  bills: {
    id: 'bills',
    label: 'Tagihan',
    emoji: '🧾',
    color: '--color-cat-bills',
    hint: 'internet, listrik, pulsa, IPL, iuran',
  },
  housing: {
    id: 'housing',
    label: 'Tempat Tinggal',
    emoji: '🏠',
    color: '--color-cat-housing',
    hint: 'sewa apartemen, kos, service charge',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Hiburan',
    emoji: '🎬',
    color: '--color-cat-entertainment',
    hint: 'bioskop, game, langganan streaming',
  },
  health: {
    id: 'health',
    label: 'Kesehatan',
    emoji: '💊',
    color: '--color-cat-health',
    hint: 'obat, dokter, vitamin',
  },
  other: {
    id: 'other',
    label: 'Lainnya',
    emoji: '📦',
    color: '--color-cat-other',
    hint: 'tidak masuk kategori lain',
  },
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
