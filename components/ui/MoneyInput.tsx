'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'
import { formatIdrDigits, parseIdrLoose } from '@/lib/format'

import { useFieldContext } from './Field'
import { CloseIcon } from './Icon'

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
  /**
   * F18 — pass a label and the field gains a ✕. Absent, and this component is what it was.
   *
   * ONE PROP, and deliberately not `Input`'s `{ onClear, clearLabel }` union, which is the
   * asymmetry to justify rather than tidy away. `Input` cannot clear itself: the caller owns
   * `value` and only a real DOM event changes it, so there `onClear` IS the mutation and the
   * union exists to stop it shipping unnamed. This component is fully controlled and already
   * emits `onValueChange(null)` when the field is emptied by hand, so it can do the whole
   * clear — including the `unparseable` escape hatch below, which nothing outside can reach.
   * Splitting that across a caller callback would make "a ✕ that nulls the value and leaves
   * unparseable text on screen" a thing a call site can ship. One optional prop cannot be
   * half-wired, and its presence being the opt-in means clearable-but-unnamed does not exist.
   *
   * The 44px is NOT free on every surface. See the docblock's width budget: `/new`'s review
   * row affords the input 100px and passes no label on purpose.
   */
  clearLabel?: string
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
 * F18 ADDS AN OPT-IN ✕ (`clearLabel`) AND DOES NOT PUT IT ON `/new`. The same budget decides
 * it: that row affords this input 100px, and `4.500.000` measures 81 while `45.000.000` and
 * `999.999.999` measure 91 and 100 (Chromium 150, 414x896 DPR 2). A 44px button either
 * reserves its gutter and shrinks the input to 62 — issue #3, re-shipped — or floats over the
 * value, which is R-34's badge again under a new name. It ships on the sheet's `Jumlah` (274px)
 * and in the gallery, and `/new`'s `ItemRow` passes no label, on purpose and under test. See
 * docs/plans/F18-amount-field-clear-button.md.
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
  clearLabel,
  className,
  id,
  onFocus,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const field = useFieldContext()
  /*
   * F18. Clearing has to refocus (see the button), and the node was previously only ever
   * spread through. No caller passes a `ref` to this component today — `rest` carries one if
   * one ever arrives, and React 19 hands it to the `<input>` through the spread — so this ref
   * is additive rather than a forwarding chain.
   */
  const inner = React.useRef<HTMLInputElement | null>(null)
  // Non-null ONLY while the field holds text no parser could read.
  const [unparseable, setUnparseable] = React.useState<string | null>(null)

  const text = unparseable ?? (value === null ? '' : formatIdrDigits(value))
  const invalid = unparseable !== null || field?.invalid

  /*
   * All three, and `text` rather than `value !== null` is the load-bearing choice: the state a
   * user is most stuck in is a paste no parser could read, which HAS no value. `disabled` is
   * not decoration either — a live ✕ on a disabled field edits a form the user has been told
   * is busy saving.
   */
  const showClear = clearLabel !== undefined && !rest.disabled && text !== ''

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
        'glass relative flex h-control items-center gap-2.5 rounded-field border border-transparent',
        'pl-3.5',
        // Asymmetric, and it stays that way now the badge it was cut for is gone (F13): the
        // value is left-aligned and grows rightward, so the right inset is whitespace it
        // eats into. Matching it to `pl-3.5` would spend 8 real pixels of the field's 102 to
        // pad empty space, and drop the input under the `min-w-[6rem]` floor below.
        //
        // F18 buys the ✕'s gutter out of exactly that whitespace, and the TERNARY is the fix
        // rather than the tidy-up: held as one string, a clearable well's class list would
        // carry `pr-1.5` AND `pr-touch`, `lib/cn.ts` is a plain join with no tailwind-merge,
        // and the GENERATED STYLESHEET's order would pick the winner — "neither the call
        // site's order nor visible to the caller" (`Icon.tsx`). One declaration per side.
        showClear ? 'pr-touch' : 'pr-1.5',
        invalid && 'border-red-ink',
        className,
      )}
    >
      <span className="text-chip font-extrabold text-ink-3" aria-hidden="true">
        Rp
      </span>
      <input
        id={id ?? field?.inputId}
        ref={inner}
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

      {/*
        F18's clear button, written from `Input`'s (Field.tsx) — same `w-touch` box, same
        `justify-end pr-3.5`, same `xs` glyph.

        It lands ONE PIXEL further in than `Input`'s, measured: 15px from the well's outer
        right edge against 14. `Input` wraps its field in a `relative` div OUTSIDE the
        input, so `right-0` resolves to the border box; here the `relative` element IS the
        bordered well, so it resolves to the padding box, 1px in. That is left alone rather
        than clawed back with a negative offset, because 15px is where this control's own
        prefix already sits — `border 1 + pl-3.5` puts `Rp` 15px from the left edge — so the
        ✕ and the `Rp` are mirror-inset, which is a better rule inside one field than a
        pixel of parity with a different one.

        ── `absolute`, and that is the design rather than a positioning habit ──────────────
        The well is `relative` and this is out of flow, so the 38px the `pr-touch` gutter
        costs is paid by the `flex-1` input. On a container too narrow to afford it the
        input hits `min-w-[6rem]` and the WELL OVERFLOWS where somebody sees it — F13's
        chosen failure mode — instead of the input quietly shrinking under its content,
        which is issue #3. `/new`'s review row is that container: 100px of input, and
        `4.500.000` needs 81. It passes no `clearLabel`, on measurement, and
        docs/plans/F18-amount-field-clear-button.md §2 has the arithmetic.

        ── NOT `touch-target`, and here it is barred on two axes ──────────────────────────
        That utility centres a 44px `::after` on the button "without changing its painted
        size". On a 14px glyph inset in a 50px well it overflows ~15px sideways past the
        field AND ~15px vertically out of it. On `/new`'s row both directions land in the
        `size-touch` DELETE button's hit area: it sits 8px to the right of the name field
        on row 1, at the same x as this column, 8px above. Overlapping hit areas between a
        harmless action and a destructive one, and nothing paints, so review never sees it.
        A real `w-touch` box stops exactly where the well does.

        ── no remount hazard, unlike `Input` ─────────────────────────────────────────────
        F17 had to keep its wrapper `<div>` unconditional: gating it on the button's
        visibility swaps `input` → `div` at that position, React remounts the field, and
        focus and the keyboard go as the user types character one. This well is ALREADY an
        unconditional div and the button is appended AFTER the input, so the input's index
        among its siblings is 1 with or without it. Nothing can remount.
      */}
      {showClear && (
        <button
          type="button"
          // The tap never moves focus off the input, which on iOS is what stops the keyboard
          // closing and reopening under the user's thumb mid-edit.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            /*
             * BOTH HALVES, in `handleChange`'s own order. `unparseable` is component-local by
             * construction — it holds text with no numeric value to derive from — so nothing
             * outside could reset it, and a ✕ that only nulled the value would leave the
             * unreadable paste on screen. Emitting `onValueChange(null)` from here is not a
             * new behaviour: it is exactly what emptying the field by hand already does, so
             * the reducer, the localStorage draft and `validate.ts` see a ✕ as a deletion
             * typed by hand.
             */
            setUnparseable(null)
            onValueChange(null)
            /*
             * For the case `onMouseDown` does not cover: typed, scrolled away, came back and
             * tapped. `focus()` inside a click gesture raises the keyboard on iOS.
             *
             * `preventScroll` is load-bearing — `ReviewStage` records that a plain `focus()`
             * "jumps the element to the nearest edge, and the nearest edge is frequently
             * under the sticky bar".
             */
            inner.current?.focus({ preventScroll: true })
          }}
          className="absolute inset-y-0 right-0 flex w-touch press items-center justify-end pr-3.5 text-ink-3"
          aria-label={clearLabel}
        >
          <CloseIcon size="xs" />
        </button>
      )}
    </div>
  )
}
