/**
 * The `Judul` presets — F12 §5.
 *
 * These are the seven titles the owner actually types, taken verbatim from the card. The point
 * is narrow and worth stating: from the card, "pengeluaran harian … is the most title I will
 * ever used. so it is tiring to type it in manually every single time."
 *
 * ORDERED BY HOW OFTEN IT WILL BE TAPPED, not by the a–g order they were listed in. Only about
 * two and a half chips fit before the scroll edge on a 414px screen, so frequency-descending is
 * what keeps the common case a zero-scroll, one-tap job. Daily first, then the two weeklies,
 * then the three monthlies, then the quarterly.
 *
 * ═══ THE STRINGS ARE VERBATIM. DO NOT TITLE-CASE THEM. ═══
 *
 * `app/globals.css` and `docs/plans/F11-title-case.md` require Title Case for LABELS — `Judul`,
 * `Item`, `Tautan Publik`. These are VALUES: they land in `expense_groups.title` and are the
 * user's own words. `IPL tokyo` is mixed-case because that is how it is written; normalising it
 * would be the app correcting the user's own vocabulary, which is the same rule
 * `lib/llm/prompt.ts` states for item names ("Do not translate, expand, capitalise, or correct
 * typos").
 *
 * Every entry must stay under `MAX_TITLE` (app/(bare)/new/draft.ts) — asserted by
 * `lib/__tests__/titlePresets.test.ts`, because a preset that cannot be saved is a button that
 * fills a field with a validation error.
 */
export const TITLE_PRESETS = [
  'pengeluaran harian', // daily — the most-used, therefore first
  'bakar duit minggu', // weekly
  'bensin motor', // weekly
  'air & listrik bulanan', // monthly
  'parkir motor tokyo', // monthly
  'parkir motor asg', // monthly
  'IPL tokyo', // per 3 months
] as const

export type TitlePreset = (typeof TITLE_PRESETS)[number]
