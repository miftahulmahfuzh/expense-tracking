'use client'

import { cn } from '@/lib/cn'
import { TITLE_PRESETS } from '@/lib/titlePresets'

/**
 * The one-tap `Judul` row — F12 §5, decision D-D.
 *
 * A horizontally scrolling strip of the seven titles the owner actually types. One tap replaces
 * the field's contents; the field stays fully editable, so this is a shortcut and never a
 * constraint.
 *
 * WHY A VISIBLE ROW AND NOT A SHEET. `CategoryPicker` already establishes the sheet pattern for
 * "pick one of N", and it would cost no vertical space here. But it makes every preset two taps
 * and keeps the list invisible until you go looking — and the complaint being answered is that
 * typing the same six words every day is tiring, so the fix has to be cheaper than typing at a
 * glance, not after remembering a control exists.
 *
 * WHY IT DOES NOT PREFILL. On `/new` the LLM has already guessed a title from the paste, and
 * that guess is usually right for the irregular expenses. Overwriting it with "pengeluaran
 * harian" would be correct on most days and silently wrong on the ones that matter — a monthly
 * bill filed under the daily label, saved by inattention.
 *
 * THE ACTIVE CHIP GOES YELLOW because `components/ui/stickers.ts` reserves yellow for "you are
 * here" — the month pill, the active tab, the toast. That makes the row a read-out as well as a
 * control: it says which preset the current title IS, so the strip is not write-only.
 */
export function TitlePresets({
  value,
  onPick,
  disabled = false,
  className,
}: {
  /** The field's current contents. An exact match highlights that chip. */
  value: string
  onPick: (preset: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      // The same hidden-scrollbar incantation the Lightbox track uses. `-mx-safe` + `px-safe`
      // lets the strip bleed to both screen edges while its first chip still lines up with the
      // gutter — otherwise the last chip appears to stop short of the edge and reads as the end
      // of the list when it is not.
      className={cn(
        'flex [scrollbar-width:none] gap-2 overflow-x-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      // Not a listbox, not a radiogroup: nothing here is selected state that persists, and the
      // field below is the real control. A plain group of buttons is what these are.
      role="group"
      aria-label="Preset judul"
    >
      {TITLE_PRESETS.map((preset) => {
        const active = value.trim() === preset
        return (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onPick(preset)}
            aria-pressed={active}
            /*
             * `min-h-9` painted (36px) with `touch-target` expanding the hit area to the 44px
             * floor without changing the painted size — exactly what `Chip size="sm"` does, and
             * why this costs ~44px of vertical space rather than the ~52px a genuinely 44px-tall
             * chip would. The utility's docblock lists this use case.
             *
             * `whitespace-nowrap` because these are multi-word titles in a scrolling row: without
             * it "air & listrik bulanan" wraps to three lines inside its own pill.
             */
            className={cn(
              'touch-target min-h-9 shrink-0 press rounded-full px-3.5 text-chip whitespace-nowrap',
              active
                ? 'bg-yellow text-[#0d0d0d]'
                : 'border border-rule bg-paper-2 text-ink-2 disabled:opacity-50',
            )}
          >
            {preset}
          </button>
        )
      })}
    </div>
  )
}
