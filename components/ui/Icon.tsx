import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Images,
  Maximize,
  Minimize,
  Share,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/cn'

/**
 * THE APP'S ICON SET. The only module in this repo that may import `lucide-react`, enforced
 * by `no-restricted-imports` in `eslint.config.mjs` and asserted from the other side by
 * `tests/icon.contract.test.ts`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THIS REVERSES A DECISION THREE FILES USED TO CARRY. Read why before undoing it.
 *
 *  `FullscreenToggle`, `ShareButton` and `TabBar` all argued against an icon dependency, in
 *  two halves:
 *
 *    1. "adding lucide for two glyphs would import a library to use 0.2% of it"
 *    2. "a 2.5 stroke, not the 1.5 an icon library ships: the system is Archivo at 800-900
 *       weight and a hairline glyph next to it reads as a different app"
 *
 *  HALF 2 IS NOT CONCEDED. It is promoted from a comment into the three props in `Icon`
 *  below — which is a stronger guarantee than three files each remembering it, and the
 *  reason a dependency is now affordable at all.
 *
 *  HALF 1 IS ARITHMETIC, AND IT FLIPPED. F12 takes the app from three glyphs to twelve.
 *  Hand-drawing twelve and keeping them consistent is precisely the cost that comment was
 *  avoiding; at twelve it exceeds the dependency. Note what the list below also removed: two
 *  byte-identical `Chevron` components in `MonthHeader` and `MonthSwitcher`, whose promise to
 *  stay "glyph for glyph" was a comment and is now structural.
 *
 *  Next 16 lists `lucide-react` in its default `optimizePackageImports`
 *  (`next/dist/server/config.js`), so these twelve named imports are what ships. The barrel
 *  does not.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS MODULE EXPORTS FINISHED COMPONENTS AND NOT A GENERIC `<Icon as={…}>`:
 * a generic adapter still requires every call site to import the glyph itself from
 * `lucide-react`, and once that import is legal at a call site so is `<Download
 * className="size-5" />` — the contract is bypassed by writing less code, which is the
 * bypass that always wins. A closed set means the stroke contract is not enforced by a rule
 * anyone has to obey; there is simply no other glyph to render. Adding one is a line here,
 * and that line IS the review.
 *
 * SURPRISE WORTH KNOWING: lucide-react v1 marks its own `Icon` and `context` modules
 * `'use client'` — it ships a `LucideProvider` built on `useContext`. So every glyph below is
 * a client component, and a server component rendering one creates a client boundary around
 * the glyph. Acceptable here: the icon nodes are a few hundred bytes and every screen using
 * one already ships client JS. Not obvious from the call site, hence this paragraph.
 */

/**
 * `size` is a prop, not a `className` override, and that is `lib/cn.ts`'s rule rather than a
 * preference. `cn` is a plain join with no tailwind-merge, so `cn('size-5.5', className)`
 * with `className="size-3"` emits both and lets the GENERATED STYLESHEET's order decide —
 * which is neither the call site's order nor visible to the caller. From `cn`'s docblock:
 * "the component is accepting overrides it should be exposing as a prop instead."
 */
export type IconSize =
  /** Scales with the surrounding text and sits on its baseline. For a glyph inside a sentence. */
  | 'inline'
  /** 14px. The ✕ on a 20px photo-tile overlay button. */
  | 'xs'
  /** 22px. Every chrome icon button — what the hand-drawn glyphs rendered at. */
  | 'md'

const SIZE: Record<IconSize, string> = {
  // `1em` rather than a fixed step: the glyph is a word in a text run, so it tracks whatever
  // size that run is set at. The negative vertical-align is the optical correction — an SVG's
  // box sits ON the baseline, and a capital-height glyph has to drop below it to look centred
  // against lowercase Archivo.
  inline: 'inline-block size-[1em] align-[-0.125em]',
  xs: 'size-3.5',
  md: 'size-5.5',
}

export interface GlyphProps {
  size?: IconSize
  /** Layout and colour only. NOT size — see `IconSize`. */
  className?: string
}

/**
 * THE STROKE CONTRACT, in three props:
 *
 *   strokeWidth    2.5    — lucide ships 2. Archivo at 800-900 needs the heavier line.
 *   strokeLinecap  square — this design has no soft edges anywhere.
 *   strokeLinejoin miter  — likewise. Mitred corners, never rounded.
 *
 * Verbatim `FullscreenToggle`'s original `GLYPH` constant, now enforced rather than
 * remembered. `aria-hidden` is here because an icon is never the accessible name: every call
 * site puts the word in the button's `aria-label`, which is also what voice control matches.
 */
function Icon({ as: Glyph, size = 'md', className }: GlyphProps & { as: LucideIcon }) {
  return (
    <Glyph
      strokeWidth={2.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      /* `className` last, the convention every component in this directory follows — but it
         may only carry layout and colour, so there is no conflict to resolve. */
      className={cn(SIZE[size], className)}
    />
  )
}

/* ── the set ──────────────────────────────────────────────────────────────────────────────
 * One line per glyph, and the comment says which surface owns it. If a name here has no
 * caller, delete it: an unused glyph is a drawing nobody is checking.
 * ───────────────────────────────────────────────────────────────────────────────────────── */

/** Lightbox — save this photo. Opens the OS share sheet, whose first row writes to Photos. */
export const DownloadIcon = (p: GlyphProps) => <Icon as={Download} {...p} />

/**
 * Share. lucide's `Share`, NOT `Share2`: `ShareButton`'s retired hand-drawn glyph was
 * deliberately iOS's own mark — "a tray with an arrow leaving through the top", the icon
 * already sitting in Safari's toolbar two centimetres below it. `Share2` is the three-node
 * graph, which means share on Android and nothing in Safari.
 */
export const ShareIcon = (p: GlyphProps) => <Icon as={Share} {...p} />

/** Destructive. Lightbox photo delete; anywhere a delete is an icon rather than a word. */
export const TrashIcon = (p: GlyphProps) => <Icon as={Trash2} {...p} />

/** Dismiss. Replaces the `✕` / `×` characters — a typed glyph is whatever the font decides. */
export const CloseIcon = (p: GlyphProps) => <Icon as={X} {...p} />

/** Fullscreen on / off. Was `ExpandGlyph` / `CollapseGlyph`, four hand-drawn brackets each. */
export const ExpandIcon = (p: GlyphProps) => <Icon as={Maximize} {...p} />
export const CollapseIcon = (p: GlyphProps) => <Icon as={Minimize} {...p} />

/** Month paging. ONE definition for both `MonthHeader` and `MonthSwitcher` (see above). */
export const ChevronLeftIcon = (p: GlyphProps) => <Icon as={ChevronLeft} {...p} />
export const ChevronRightIcon = (p: GlyphProps) => <Icon as={ChevronRight} {...p} />

/** `GroupRow`'s photo count. Was `⧉`, which is U+29C9 and renders as a box in some fonts. */
export const PhotoStackIcon = (p: GlyphProps) => <Icon as={Images} {...p} />

/**
 * `DeltaTile`'s direction. Inline in a sentence — "↑ Naik 12% dari …" — so these are the
 * one set that is normally rendered at `size="inline"`.
 */
export const TrendUpIcon = (p: GlyphProps) => <Icon as={ArrowUp} {...p} />
export const TrendDownIcon = (p: GlyphProps) => <Icon as={ArrowDown} {...p} />
export const TrendFlatIcon = (p: GlyphProps) => <Icon as={ArrowRight} {...p} />
