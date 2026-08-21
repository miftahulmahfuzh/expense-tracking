'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'
import { formatIdrDigits, parseIdrLoose } from '@/lib/format'
import { useFieldContext } from './Field'

export interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> {
  /** Whole rupiah, or null when empty. */
  value: number | null
  /** Fires as the field changes, and when it is cleared. See the timing note below. */
  onValueChange: (value: number | null) => void
  /** Fires on blur when pasted text could not be parsed at all. */
  onParseError?: (rawText: string) => void
  className?: string
}

/** Guard against a paste of nonsense costing us integer precision. 12 digits is Rp 999 billion. */
const MAX_DIGITS = 12

/** Our own formatted output, or plain digits, or anything in between while editing. */
const OWN_FORMATTING = /^[\d.\s]*$/

/**
 * The amount field. `Rp` is a static span OUTSIDE the editable value, and thousands dots are
 * inserted as you type — never typed.
 *
 * F13 REVERSES R-34's yellow `IDR` block, which the canvas (`01 Components`) put on the right
 * of this field to make the currency "legible at a glance in a column of otherwise identical
 * white slabs". Two reasons, and the second is why it is a reversal rather than a compromise:
 *
 *  - It cost ~48px of a field that had 152 to spend. `/new`'s review row puts this component
 *    in a fixed `w-[9.5rem]` column, and the badge plus `Rp` plus two `gap-2.5` plus the
 *    padding and the 2px border came to ~110px of chrome, leaving the input 43 — measured at
 *    414x896, not estimated. Every amount past four glyphs lost its tail: `4.500.000` wanted
 *    81px and rendered `4.500.` (issue #3).
 *  - The `Rp` prefix was already doing the badge's stated job. The two together stated the
 *    currency TWICE on one control, so the badge was redundant before it was expensive.
 *
 * The widening it would have taken to keep it (152 → 190px) comes out of the category chip,
 * and the chips were measured too: `Tempat Tinggal` is 171px and `Belanja Harian` 162, against
 * the 150 a 190px column would leave them. That is a clipped category in place of a clipped
 * amount. See docs/plans/F13-amount-field-clipping.md §2 for the whole budget.
 *
 * `inputMode="numeric"`, never `type="number"`: a number input rejects a pasted `45k` or
 * `1,5jt` outright, shows spinners nobody wants on a phone, and drops leading formatting.
 * With the separator inserted for you there is nothing left to reach the decimal key for,
 * which is what makes `numeric` right here rather than `decimal`.
 *
 * TWO INPUT PATHS, and the second is why `parseIdrLoose` is imported:
 *  - Typing digits, or editing our own dotted output → strip separators, reformat, emit.
 *  - Pasting anything else — `45k`, `1,5jt`, `Rp 38.500`, `1.250.000,-` → `parseIdrLoose`.
 *    This whole app is built around pasting, so treating a paste as digits-only would
 *    silently turn `1,5jt` into 15. If even the loose parser cannot read it, the raw text is
 *    left alone (never destroyed) and `onParseError` fires on blur.
 *
 * FULLY CONTROLLED, by design. The displayed text is *derived* from `value` rather than
 * mirrored into local state, so there is one source of truth and no resync effect that can
 * fight the caret. The only local state is the escape hatch for text we could not parse,
 * which by definition has no numeric value to derive from.
 *
 * TIMING NOTE for F05/F07: `onValueChange` fires on every accepted change, not only on blur
 * as F10's original plan specified. It has to — the running total updates live, and waiting
 * for blur leaves the total lagging the field the user is looking at. It also follows from
 * being controlled: ignore the callback and the field cannot update. Handlers must be
 * idempotent, which they already were, since they assign rather than accumulate.
 */
export function MoneyInput({
  value,
  onValueChange,
  onParseError,
  className,
  id,
  onFocus,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const field = useFieldContext()
  // Non-null ONLY while the field holds text no parser could read.
  const [unparseable, setUnparseable] = React.useState<string | null>(null)

  const text = unparseable ?? (value === null ? '' : formatIdrDigits(value))
  const invalid = unparseable !== null || field?.invalid

  function handleChange(raw: string) {
    if (raw.trim() === '') {
      setUnparseable(null)
      onValueChange(null)
      return
    }

    if (OWN_FORMATTING.test(raw)) {
      setUnparseable(null)
      const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
      onValueChange(digits === '' ? null : Number(digits))
      return
    }

    const parsed = parseIdrLoose(raw)
    if (parsed === null) {
      // Keep exactly what they typed or pasted. Losing it is worse than showing it wrong.
      setUnparseable(raw)
      return
    }
    setUnparseable(null)
    onValueChange(parsed)
  }

  return (
    <div
      className={cn(
        'glass flex h-control items-center gap-2.5 rounded-field border border-transparent',
        // Asymmetric, and it stays that way now the badge it was cut for is gone (F13): the
        // value is left-aligned and grows rightward, so the right inset is whitespace it
        // eats into. Matching it to `pl-3.5` would spend 8 real pixels of the field's 102 to
        // pad empty space, and drop the input under the `min-w-[6rem]` floor below.
        'pr-1.5 pl-3.5',
        invalid && 'border-red-ink',
        className,
      )}
    >
      <span className="text-chip font-extrabold text-ink-3" aria-hidden="true">
        Rp
      </span>
      <input
        id={id ?? field?.inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        value={text}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        aria-invalid={rest['aria-invalid'] ?? (invalid || undefined)}
        // 17px comes from the base layer's input rule, not from a class here, so it cannot
        // be overridden away. `tabular` keeps the digits in their columns.
        //
        // `min-w-[6rem]`, NOT `min-w-0`, and that is the F13 fix rather than the F13 tidy-up.
        // `min-w-0` is why #3 went a whole release unseen: it lets a flex child shrink below
        // its content, so this input swallowed the entire 38px shortfall in silence — a clipped
        // <input> throws no error, logs nothing, and reads as a smaller number. An explicit
        // min-width overrides the automatic minimum exactly as `0` does, so the intrinsic width
        // (an <input>'s `size` default, ~20 characters) never becomes the floor.
        //
        // 96px holds `999.999.999`, the realistic ceiling for an expense, and sits 4px under
        // the 100 the `/new` column affords — measured, and note it is 100 rather than the 102
        // the padding arithmetic gives, because the field's `border` costs 2px that is easy to
        // forget. So it constrains nothing today. What it buys is
        // the next narrow container OVERFLOWING this field visibly instead of quietly dropping
        // digits. It does not raise the digit cap: past nine digits the text overflows. That is
        // the intended failure, and `scripts/f05-audit.sh` guards the class name.
        className="h-full min-w-[6rem] flex-1 border-0 bg-transparent tabular font-bold text-ink outline-none"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={(e) => {
          // Select all, so the commonest edit — replacing a wrong amount — is one tap and
          // then typing, rather than a caret hunt inside a formatted number.
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
          onFocus?.(e)
        }}
        onBlur={(e) => {
          if (unparseable !== null) onParseError?.(unparseable.trim())
          onBlur?.(e)
        }}
        {...rest}
      />
    </div>
  )
}
