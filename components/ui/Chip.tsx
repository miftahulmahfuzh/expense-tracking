import { cn } from '@/lib/cn'
import { CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'

export interface ChipProps {
  category: Category
  /** `sm` = inline in a dense row (32px) · `md` = a standalone control (44px) */
  size?: 'sm' | 'md'
  /** Provide to render a `<button>` that opens the CategoryPicker. Omit for a label. */
  onClick?: () => void
  /** Fills with the category colour. Used inside CategoryPicker and on an assigned chip. */
  selected?: boolean
  /** Keep only the two-letter code; the label stays for screen readers. */
  labelHidden?: boolean
  className?: string
}

/**
 * A category, as a pill: two-letter mono code in the category colour, then the Indonesian
 * label. Colour is never the only channel — the code carries the category for colour-blind
 * readers and in a greyscale screenshot, which is what makes an eight-colour palette safe.
 *
 * The colour arrives through an inline `--c` custom property so globals.css has one
 * `.chip` rule instead of eight. Selected fills with the category colour and flips its text
 * to `paper` — which is dark in dark mode, so contrast holds in both schemes for free.
 */
export function Chip({
  category,
  size = 'sm',
  onClick,
  selected = false,
  labelHidden = false,
  className,
}: ChipProps) {
  const meta = CATEGORY_META[category]

  const content = (
    <>
      <span className="chip-code font-mono text-label tracking-[0.08em]" aria-hidden="true">
        {meta.code}
      </span>
      <span
        className={cn(
          'chip-label',
          size === 'sm' ? 'text-chip' : 'text-body',
          labelHidden && 'sr-only',
        )}
      >
        {meta.label}
      </span>
    </>
  )

  const classes = cn(
    'chip inline-flex items-center gap-[7px] rounded-full',
    size === 'sm' ? 'min-h-8 py-1 pr-3 pl-2.5' : 'min-h-touch py-2 pr-3.5 pl-3',
    className,
  )

  if (!onClick) {
    return (
      <span className={classes} style={categoryStyle(category)} data-selected={selected}>
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      aria-label={`Kategori: ${meta.label}. Ketuk untuk mengganti.`}
      style={categoryStyle(category)}
      className={cn(classes, 'touch-target press')}
    >
      {content}
    </button>
  )
}

/**
 * The code on its own, for a row too dense for a pill — the item rows on `/new`, `/e/[id]`
 * and `/s/[token]`, and the head of each bar in F08's category list. The visible glyph is
 * the code; the full Indonesian label rides along for screen readers, so this is never
 * colour-only either.
 *
 * `w-6` because eight two-letter codes in a fixed column is what lets a list of items scan
 * as a table rather than as ragged text.
 */
export function CategoryCode({ category, className }: { category: Category; className?: string }) {
  const meta = CATEGORY_META[category]
  return (
    <span
      style={categoryStyle(category)}
      className={cn('chip-code font-mono text-label tracking-[0.08em]', className)}
    >
      <span aria-hidden="true">{meta.code}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

/**
 * A 10px colour dot. Published because F10's contract named it and F08 may want it in a
 * chart legend; prefer `CategoryCode`, which carries the same colour plus the identity.
 */
export function CategoryDot({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={categoryStyle(category)}
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-[var(--c)]', className)}
    />
  )
}
