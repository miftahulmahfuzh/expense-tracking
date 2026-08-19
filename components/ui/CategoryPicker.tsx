'use client'

import { CATEGORY_LIST, categoryStyle, type Category } from '@/lib/categories'
import { Sheet } from './Sheet'

export interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  /** The currently assigned category, if any. */
  value?: Category | null
  /** Fires with the chosen category. The picker closes itself afterwards. */
  onSelect: (category: Category) => void
  title?: string
}

/**
 * The 2×4 grid, inside the standard Sheet.
 *
 * Two columns, not four: "Tempat Tinggal" and "Belanja Harian" do not fit an 84px cell at
 * 414px without truncating, and a truncated label defeats the point of having one. Two
 * columns give ~180px per cell, and eight 52px cells fit on screen without scrolling — so
 * the picker never scrolls and every category is one tap away.
 *
 * `CATEGORY_LIST` is `CATEGORY_META` in `CATEGORIES` order (F03a), which is also F08's chart
 * series order. Keeping them identical means a colour always means the same thing in the
 * same position.
 */
export function CategoryPicker({
  open,
  onClose,
  value = null,
  onSelect,
  title = 'Pilih kategori',
}: CategoryPickerProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div role="listbox" aria-label={title} className="grid grid-cols-2 gap-2 pb-1">
        {CATEGORY_LIST.map((meta) => {
          const selected = value === meta.id
          return (
            <button
              key={meta.id}
              type="button"
              role="option"
              aria-selected={selected}
              data-selected={selected}
              style={categoryStyle(meta.id)}
              onClick={() => {
                onSelect(meta.id)
                onClose()
              }}
              className="cell flex min-h-13 press items-center gap-2.5 rounded-field px-3 py-2 text-left"
            >
              <span className="cell-code font-mono text-label tracking-[0.08em]" aria-hidden="true">
                {meta.code}
              </span>
              <span className="cell-label text-body leading-tight">{meta.label}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
