/**
 * The 17 expense categories. AUTHORITATIVE — roadmap §4.1.
 *
 * Order below IS the display order of the picker grid and of F08's chart series, and it is
 * grouped by FAMILY — eating, transport, bills & home, leisure, health, other — so that a
 * colour and the colours beside it mean related things in the same place.
 *
 * Reconciliation R-7: F10 also authored a `lib/categories.ts`. This one wins, verbatim,
 * because F08 had already built against `CATEGORY_META` and against `color` being the
 * custom-property NAME. F10 owns the *values* of the `--color-cat-*` properties in
 * app/globals.css; this module owns the names. Neither keeps a private copy.
 *
 * ONE FIELD HAS CHANGED SINCE. docs/design/DESIGN_INTEGRATION.md R-34 (the Claude Design
 * pull) replaces `emoji` with `code` — a two-letter ledger mark set in IBM Plex Mono.
 * Emoji rendering varies by OS, vendor and font version and cannot be tinted; a code is
 * the same glyph everywhere, takes the category colour, and aligns in a column at 10px.
 * It is also the accessibility channel: in a dense item row the code IS the category, so
 * the redundancy that makes the palette safe for colour-blind readers comes free on every
 * screen rather than only in the picker. Applied by F10.
 *
 * F14 REPLACED THE ORIGINAL EIGHT (card #6, docs/plans/F14-category-taxonomy.md). `food`
 * ("Makan & Jajan") was too generic to be worth reading and split into five; `groceries`
 * ("Belanja Harian") was deleted unused. `transport`, `bills` and `entertainment` survive
 * but NARROWED — bensin and parkir, internet and listrik/air, and bioskop respectively now
 * have their own categories, so the generic keeps only the remainder. That narrowing is why
 * the `hint`s below no longer match the roadmap's original examples: the hints are fed to
 * F04's prompt verbatim, and a hint that still advertised `bensin` under `transport` would
 * stop `fuel` from ever being chosen.
 *
 * WHY 17 AND NOT A TWO-LEVEL TAXONOMY: `expense_items.category` is one text column, and
 * nothing in the app is two-level. If cross-family totals are ever wanted ("all eating"),
 * add a `family` field here — the ordering above already groups them — rather than a parent
 * table. See §3 of the plan.
 */
import type { CSSProperties } from 'react'

export const CATEGORIES = [
  // -- makan & minum
  'meals', // Makan Harian — warung, kantin, nasi padang, gofood harian
  'jajan', // Jajan — gorengan, martabak, cireng, seblak
  'dining', // Fancy Makan Berat — restoran, steak, all-you-can-eat, makan besar
  'snacks', // Snack — keripik, biskuit, permen, cokelat
  'drinks', // Beverage — kopi, boba, es teh, jus, air botol
  // -- transport
  'transport', // Transport — gojek, grab, angkot, krl, tol, service motor
  'fuel', // Bensin — pertamax, pertalite, isi bensin
  'parking', // Sewa Parkir Motor — sewa parkir bulanan, parkir harian
  // -- tagihan & tempat tinggal
  'bills', // Tagihan — pulsa, paket data, IPL, iuran, BPJS
  'internet', // Internet — indihome, biznet, wifi bulanan
  'utilities', // Listrik & Air Apart — token listrik, PLN, air PDAM
  'housing', // Tempat Tinggal — sewa apartemen, kos, service charge
  // -- hiburan
  'entertainment', // Hiburan — game, top up, streaming, karaoke, billiard
  'cinema', // Bioskop — xxi, cgv, tiket film
  // -- kesehatan & perawatan
  'health', // Kesehatan — obat, apotek, dokter, vitamin, pijat refleksi
  'grooming', // Pangkas Rambut — potong rambut, barbershop, cukur
  // -- sisanya
  'other', // Lainnya — tidak masuk kategori lain
] as const

export type Category = (typeof CATEGORIES)[number]

/** Fallback used whenever an unknown string reaches us (e.g. an LLM hallucinating a category). */
export const DEFAULT_CATEGORY: Category = 'other'

export interface CategoryMeta {
  /** Stable machine id — this is what lands in expense_items.category. */
  id: Category
  /** Indonesian display label. */
  label: string
  /**
   * Two-letter uppercase ledger mark — the chip/row glyph. Unique across all 17 — and it, not the colour, is what
   * makes a category unambiguous once the set is past the number of tellable-apart hues.
   * Always set in `font-mono`, always tinted with the category colour.
   */
  code: string
  /**
   * Tailwind v4 `@theme` custom-property NAME (not a value). F10 defines the values in
   * app/globals.css; using the `--color-*` namespace means Tailwind auto-generates
   * `bg-cat-meals`, `text-cat-meals`, `border-cat-meals`, etc.
   */
  color: `--color-cat-${Category}`
  /** Short disambiguation hint, shown under the label in the picker and fed to F04's prompt. */
  hint: string
}

export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>> = {
  meals: {
    id: 'meals',
    label: 'Makan Harian',
    code: 'MH',
    color: '--color-cat-meals',
    hint: 'warung, kantin, nasi padang, gofood harian',
  },
  jajan: {
    id: 'jajan',
    label: 'Jajan',
    code: 'JJ',
    color: '--color-cat-jajan',
    hint: 'gorengan, martabak, cireng, seblak',
  },
  dining: {
    id: 'dining',
    label: 'Fancy Makan Berat',
    code: 'FM',
    color: '--color-cat-dining',
    hint: 'restoran, steak, all-you-can-eat, makan besar',
  },
  snacks: {
    id: 'snacks',
    label: 'Snack',
    code: 'SN',
    color: '--color-cat-snacks',
    hint: 'keripik, biskuit, permen, cokelat',
  },
  drinks: {
    id: 'drinks',
    label: 'Beverage',
    code: 'BV',
    color: '--color-cat-drinks',
    hint: 'kopi, boba, es teh, jus, air botol',
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    code: 'TR',
    color: '--color-cat-transport',
    hint: 'gojek, grab, angkot, krl, tol, service motor',
  },
  fuel: {
    id: 'fuel',
    label: 'Bensin',
    code: 'BN',
    color: '--color-cat-fuel',
    hint: 'pertamax, pertalite, isi bensin',
  },
  parking: {
    id: 'parking',
    label: 'Sewa Parkir Motor',
    code: 'PK',
    color: '--color-cat-parking',
    hint: 'sewa parkir bulanan, parkir harian',
  },
  bills: {
    id: 'bills',
    label: 'Tagihan',
    code: 'TG',
    color: '--color-cat-bills',
    hint: 'pulsa, paket data, IPL, iuran, BPJS',
  },
  internet: {
    id: 'internet',
    label: 'Internet',
    code: 'IN',
    color: '--color-cat-internet',
    hint: 'indihome, biznet, wifi bulanan',
  },
  utilities: {
    id: 'utilities',
    label: 'Listrik & Air Apart',
    code: 'LA',
    color: '--color-cat-utilities',
    hint: 'token listrik, PLN, air PDAM',
  },
  housing: {
    id: 'housing',
    label: 'Tempat Tinggal',
    code: 'TT',
    color: '--color-cat-housing',
    hint: 'sewa apartemen, kos, service charge',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Hiburan',
    code: 'HB',
    color: '--color-cat-entertainment',
    hint: 'game, top up, streaming, karaoke, billiard',
  },
  cinema: {
    id: 'cinema',
    label: 'Bioskop',
    code: 'BS',
    color: '--color-cat-cinema',
    hint: 'xxi, cgv, tiket film',
  },
  health: {
    id: 'health',
    label: 'Kesehatan',
    code: 'KS',
    color: '--color-cat-health',
    hint: 'obat, apotek, dokter, vitamin, pijat refleksi',
  },
  grooming: {
    id: 'grooming',
    label: 'Pangkas Rambut',
    code: 'PR',
    color: '--color-cat-grooming',
    hint: 'potong rambut, barbershop, cukur',
  },
  other: {
    id: 'other',
    label: 'Lainnya',
    code: 'LN',
    color: '--color-cat-other',
    hint: 'tidak masuk kategori lain',
  },
}

/** Grid-ordered list for the picker, in `CATEGORIES` (family) order. */
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

/* ------------------------------------------------------------ presentation */

/**
 * Inline style that feeds the `.chip` / `.cell` component classes in
 * app/globals.css. Those rules read a single `--c`, so all 17 categories share
 * one CSS rule instead of needing 17.
 *
 * Additive: reconciliation R-7 froze the *shape* above and this does not touch
 * it. `CSSProperties` is a type-only import, so `lib/` stays React-free at
 * runtime.
 */
export function categoryStyle(value: Category): CSSProperties {
  return { '--c': `var(${CATEGORY_META[value].color})` } as CSSProperties
}

/**
 * Chart fill for F08's bar list: pass straight to a `style`/`fill`.
 * categoryFill('meals') === 'var(--color-cat-meals)'
 */
export function categoryFill(value: Category): string {
  return `var(${CATEGORY_META[value].color})`
}
