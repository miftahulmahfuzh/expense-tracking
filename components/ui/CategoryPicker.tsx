'use client'

import { CATEGORY_LIST, categoryStyle, type Category } from '@/lib/categories'
import { CategoryDisc } from './Chip'
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
 * The two-column grid, inside the standard Sheet.
 *
 * Two columns, not four: the longest labels — "Listrik & Air Apart", "Fancy Makan Berat",
 * "Sewa Parkir Motor" — do not fit an 84px cell at 414px without truncating, and a truncated
 * label defeats the point of having one. Two columns give ~180px per cell.
 *
 * THIS SHEET NOW SCROLLS, AND THAT INVARIANT IS RETIRED ON PURPOSE. It used to read "eight
 * 52px cells fit on screen without scrolling — so the picker never scrolls and every category
 * is one tap away". F14 (card #6) took the set to 17, and no column count puts 17 tappable,
 * untruncated cells on a phone screen: four columns truncate the labels above, and the labels
 * F14 deleted ("Makan & Jajan", "Belanja Harian") were SHORTER than the ones it added, so the
 * four-column option got worse rather than better. Scrolling is the honest cost of a taxonomy
 * the user asked to be finer. Family section headers would cut the scroll roughly in half and
 * are the obvious follow-up; they are not this card.
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
              className="cell flex min-h-13.5 press items-center gap-2.5 rounded-field py-2 pr-3 pl-2 text-left"
            >
              <CategoryDisc category={meta.id} />
              <span className="cell-label text-chip leading-tight">{meta.label}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
