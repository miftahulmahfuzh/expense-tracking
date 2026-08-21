import type * as React from 'react'
import { cn } from '@/lib/cn'
import { CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'

export interface ChipProps {
  category: Category
  /** `sm` = inline in a dense row (36px) · `md` = a standalone control (44px) */
  size?: 'sm' | 'md'
  /** Provide to render a `<button>` that opens the CategoryPicker. Omit for a label. */
  onClick?: () => void
  /** Floods the pill with the category colour. Used inside CategoryPicker and on an assigned chip. */
  selected?: boolean
  /** Keep only the disc; the label stays for screen readers. */
  labelHidden?: boolean
  className?: string
}

/**
 * A category, as a pill: the colour disc, then the Indonesian label.
 *
 * Colour is never the only channel — the two-letter mark carries the category for
 * colour-blind readers and in a greyscale screenshot, which is what makes an eight-colour
 * palette safe. The label always travels with the disc for the same reason.
 *
 * The colour arrives through an inline `--c` custom property so globals.css has one `.chip`
 * rule instead of eight. Selected FLOODS the pill with the category colour and inverts the
 * disc to ink — a block of colour, not an outline.
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
      <CategoryDisc category={category} size={size === 'sm' ? 26 : 28} />
      <span className={cn('chip-label text-chip', labelHidden && 'sr-only')}>{meta.label}</span>
    </>
  )

  const classes = cn(
    'chip inline-flex items-center gap-2 rounded-full',
    size === 'sm' ? 'min-h-9 py-1 pr-3.5 pl-[5px]' : 'min-h-touch py-1.5 pr-4 pl-1.5',
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
 * THE PICTOGRAM. A solid disc in the category colour carrying a bold black two-letter mark,
 * like an event badge. This is the atom every other category surface is built from — the
 * chip, the picker cell, the item rows on `/new`, `/e/[id]` and `/s/[token]`, and the head
 * of each bar in the stats breakdown.
 *
 * The mark stays black in both schemes because the discs stay bright in both; the palette
 * is tuned so all eight clear 4.5:1 under it (see the amendment notes in globals.css). The
 * full Indonesian label rides along visually-hidden, so this is never colour-only either.
 *
 * Inside a `.chip` / `.cell` the selected state inverts the disc to ink; that lives in CSS
 * so this component has no idea it happened.
 */
export function CategoryDisc({
  category,
  size = 28,
  className,
}: {
  category: Category
  /** Painted diameter in px. 26 in a chip, 28 in a row, 30 in the draft editor. */
  size?: number
  className?: string
}) {
  const meta = CATEGORY_META[category]
  return (
    <span
      style={{ ...categoryStyle(category), '--disc-size': `${size}px` } as React.CSSProperties}
      className={cn('disc', className)}
    >
      <span aria-hidden="true">{meta.code}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

/**
 * Alias kept because the published component interface named this `CategoryCode` and four
 * feature plans were written against that name. The bare tinted code it used to render is
 * gone — the design's category mark is the disc, everywhere.
 */
export const CategoryCode = CategoryDisc

/**
 * A 10px colour dot, for a chart legend where a 28px disc would not fit. Prefer
 * `CategoryDisc`, which carries the same colour plus the identity.
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
