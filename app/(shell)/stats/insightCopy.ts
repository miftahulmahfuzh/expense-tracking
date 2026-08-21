/**
 * `/stats`'s insight copy — F12 §7.5, §8.
 *
 * The headings are the card's own words, verbatim, including the numeral in "2 Bulan Terakhir".
 * They are LABELS, so they are Title Case per globals.css — unlike the preset titles in
 * lib/titlePresets.ts, which are values and stay as typed.
 */
export const INSIGHT_HEADINGS = {
  week: 'Simpulan Minggu Ini',
  month: 'Simpulan Bulan Ini',
  twoMonth: 'Simpulan 2 Bulan Terakhir',
} as const

/** One section came back empty. The other two may still be fine, so this is per-card. */
export const INSIGHT_EMPTY = 'Belum ada yang bisa disimpulkan untuk periode ini.'

/**
 * No summary at all: an empty window, or a failed call with nothing stored. Deliberately does
 * NOT distinguish the two — see InsightSections.
 */
export const INSIGHT_UNAVAILABLE =
  'Simpulan belum bisa dibuat. Tambah pengeluaran, lalu buka halaman ini lagi.'

/** The text is knowingly behind the data. Shown rather than hidden — see InsightSections. */
export const INSIGHT_STALE_NOTE = 'Simpulan ini dibuat sebelum perubahan terakhir Anda.'
