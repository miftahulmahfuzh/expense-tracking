import type { CSSProperties } from 'react'

/**
 * The `sticker` utility (app/globals.css) reads `--sticker-bg` / `--sticker-fg` and defaults
 * to the yellow highlighter. These are the other two printed variants, as objects rather
 * than as classes because a Tailwind arbitrary property cannot set two custom properties
 * and stay readable at the call site.
 *
 * YELLOW is "you are here" — the month pill, the active tab, the toast. It has no constant
 * here because it is the default.
 * INK is a section label: black plate, page-coloured type, and it inverts with the scheme
 * for free because both ends are tokens.
 * RED is the product mark itself, used once, on the public share page.
 */
export const INK_STICKER: CSSProperties = {
  '--sticker-bg': 'var(--ink)',
  '--sticker-fg': 'var(--paper)',
} as CSSProperties

export const RED_STICKER: CSSProperties = {
  '--sticker-bg': 'var(--red)',
  '--sticker-fg': 'var(--red-fg)',
} as CSSProperties
