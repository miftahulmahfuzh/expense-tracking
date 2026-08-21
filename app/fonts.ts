/**
 * ONE typeface. Archivo, a hard grotesque, at weights 400–900.
 *
 * This replaces the Source Serif 4 / IBM Plex Mono pair the previous system was built on.
 * That system separated *language* from *bookkeeping* by family; this one separates them by
 * WEIGHT — 900 for the hero, 800 for a total, 700 for a row title, 600 for an item, 500 for
 * prose — and gets its column-aligned amounts from `font-variant-numeric: tabular-nums`
 * (the `tabular` utility) rather than from a monospaced family. Loudness is the hierarchy:
 * if two things compete, the heavier weight wins.
 *
 * Archivo ships as a variable font on Google Fonts (weight 100–900), so one file covers the
 * whole range and there is no `weight` array to keep in sync with the type scale.
 *
 * Latin subset only. No italics — the design has none. `display: 'swap'` so text paints in
 * the fallback immediately rather than blocking on a font over an Indonesian mobile
 * connection; the app's own metric is time-to-first-amount-on-screen.
 *
 * The design's own HTML used a render-blocking <link> to fonts.googleapis.com.
 * `next/font/google` downloads the family at BUILD time and self-hosts it from our origin,
 * so there is no third-party round trip, no extra DNS or TLS handshake, and nothing is
 * shared with Google at request time.
 */
import { Archivo } from 'next/font/google'

export const sans = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
  fallback: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
})

/**
 * The variable class, for `<html>`. `@theme inline` in globals.css maps `--font-archivo`
 * onto `font-sans`; next/font emits it on a class rather than at `:root`, which is exactly
 * why that block is `inline` — the non-inline form would resolve it at `:root` and find
 * nothing.
 */
export const fontVariables = sans.variable
