/**
 * The two families the design is built on (docs/design/DESIGN_INTEGRATION.md R-35).
 *
 * Source Serif 4 for anything that is *language* — expense titles, day headings, item
 * names, prose, empty states. IBM Plex Mono for anything that is *bookkeeping* — every
 * amount, date, count, label, button and the tab bar. Money is bookkeeping, so money is
 * always mono, which produces the whole hierarchy from one rule and gives tabular figures
 * by construction rather than by CSS trick.
 *
 * This reverses F10's original "system stack, zero font bytes" decision. F10's reasoning
 * was sound on performance and wrong on substance: the serif/mono split IS the design, and
 * dropping it collapses the hierarchy into one voice. The performance concern is answered
 * differently instead — the design's own HTML used a render-blocking <link> to
 * fonts.googleapis.com; `next/font/google` downloads both families at BUILD time and
 * self-hosts them from our own origin, so there is no third-party round trip, no extra DNS
 * or TLS handshake, and nothing is shared with Google at request time.
 *
 * Latin subset only. Two mono weights only. No italics. `display: 'swap'` so text paints
 * in the fallback immediately rather than blocking on a font over an Indonesian mobile
 * connection — the app's own metric is time-to-first-amount-on-screen.
 */
import { IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google'

/**
 * Variable font (optical size 8..60, weight 200..900) so no `weight` array: one file
 * covers the 400 body and the 600 the design uses for the Google button's "G".
 */
export const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

/**
 * Static font, so the weights have to be named. 400 for meta and labels, 500 for amounts —
 * the design leans on that half-step to make a total read as heavier than the date above
 * it without changing size.
 */
export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

/**
 * Both variable classes, for `<html>`. `@theme inline` in globals.css maps
 * `--font-source-serif` / `--font-plex-mono` onto `font-serif` / `font-mono`; next/font
 * emits them on a class rather than at `:root`, which is exactly why that block is
 * `inline` — the non-inline form would resolve them at `:root` and find nothing.
 */
export const fontVariables = `${serif.variable} ${mono.variable}`
