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
 * The amount field. `Rp` is a static mono span OUTSIDE the editable value, and thousands
 * dots are inserted as you type — never typed (design R-37, which reverses R-32).
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
        'flex h-control items-center gap-2 rounded-field border border-rule-strong bg-card px-3.5',
        invalid && 'border-red',
        className,
      )}
    >
      <span className="font-mono text-body text-ink-3" aria-hidden="true">
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
        className="h-full min-w-0 flex-1 border-0 bg-transparent font-mono tabular text-ink outline-none"
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
