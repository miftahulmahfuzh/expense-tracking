'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

import { CloseIcon } from './Icon'

interface FieldContextValue {
  inputId: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

/** For a custom control that wants `Field`'s wiring but is not `Input`/`TextArea`. */
export function useFieldContext(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

export interface FieldProps {
  label: string
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  hint?: string
  /** Present = the field is in an error state; the string renders below it. */
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Owns the label / hint / error / `aria-describedby` / `id` wiring so the controls do not
 * have to. `Input`, `TextArea` and `MoneyInput` read it from context, which means a feature
 * cannot accidentally ship an unlabelled input or one whose error text is invisible to a
 * screen reader — and, more to the point, cannot ship a 14px one.
 */
export function Field({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const base = React.useId()
  const inputId = `${base}-input`
  const hintId = hint ? `${base}-hint` : undefined
  const errorId = error ? `${base}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const value = React.useMemo<FieldContextValue>(
    () => ({ inputId, describedBy, invalid: Boolean(error) }),
    [inputId, describedBy, error],
  )

  return (
    <FieldContext.Provider value={value}>
      <div className={className}>
        <label htmlFor={inputId} className={cn('mb-1.5 block eyebrow', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="text-red-ink" aria-hidden="true">
              {' *'}
            </span>
          )}
        </label>

        {children}

        {/* Hint and error never show together: an error supersedes the instruction that
            failed to prevent it. */}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-meta text-ink-3">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 text-meta text-red-ink">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

/* ---- shared control chrome ---------------------------------------------- */

/**
 * The input shell. `CONTROL_CLASS` below is this plus its right padding, and it is the
 * exported one, so a custom control (a date picker, a read-only display that must line up
 * with a real field) borrows the complete shell rather than half of it.
 *
 * `glass` (R-137) assumes the field sits on `paper` — the normal case. Inside a sheet, pass
 * `className="bg-paper"` to keep the well readable; the caller's className is applied last,
 * so it wins. That inversion IS the design's rule — a field is always the surface its
 * container is not — and the canvas keeps it exactly there, drawing the picker cells and the
 * sheet's secondary buttons on opaque `paper` inside a frosted panel.
 *
 * Inside a CARD it needs no override any more, and that is a small gift from the frost: glass
 * over glass composites lighter than the glass under it, so the well separates from the card
 * on its own. Over a sheet panel the two measure #dddcdb and #f5f5f5.
 *
 * NO BORDER UNTIL IT IS WRONG. A field is a flat block, and the only line it ever draws is
 * the red one an error puts around it — "errors turn the border red, no icons needed"
 * (01 Components). The border is reserved as `transparent` rather than added on error so
 * the field does not grow by 2px the moment it fails validation.
 *
 * KNOWN DEVIATION, and the one place this integration chose the design over the previous
 * system: a borderless field is 1.23:1 against the page, below WCAG 1.4.11's 3:1 for the
 * boundary that identifies a control. See docs/design/DESIGN_INTEGRATION.md — the one-line
 * revert is `border-transparent` → `border-rule-strong` here and in `TextArea`.
 */
const CONTROL_BASE =
  'w-full h-control rounded-field border border-transparent glass pl-3.5 ' +
  'text-input text-ink placeholder:text-ink-3 aria-[invalid=true]:border-red-ink'

/**
 * The right padding is SPLIT OFF rather than left in a `px-3.5`, because F16 needs a wider
 * gutter on the right only — 44px, for the clear button that sits in it. Held as `px-3.5`,
 * a clearable input's class list would carry `px-3.5` AND `pr-touch` and `lib/cn.ts` is a
 * plain join with no tailwind-merge: both ship, and the GENERATED STYLESHEET's order decides
 * which wins — "neither the call site's order nor visible to the caller" (`Icon.tsx`). One
 * declaration per side is the fix, and it is the same move `cn`'s docblock prescribes.
 *
 * `CONTROL_CLASS` is unchanged in effect and stays exported for the read-only display above.
 */
export const CONTROL_CLASS = CONTROL_BASE + ' pr-3.5'

/**
 * `ref` is typed explicitly (F05 contract delta 8). React 19 passes `ref` to a function
 * component as an ordinary prop, so it would already reach the `<input>` through the spread
 * at runtime — but `InputHTMLAttributes` does not declare it, so the call site would not
 * compile. F05's focus manager moves focus to a new row's name field after `+ Tambah item`
 * and to the paste textarea on mount; widening the type is the alternative to F05 hand-
 * rolling a bare `<input className={CONTROL_CLASS}>` and losing this file's label wiring.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
} & ClearProps

/**
 * F16 — opt-in clear button, and the LABEL IS PART OF THE OPT-IN.
 *
 * `Icon.tsx` marks every glyph `aria-hidden`, so an icon button's only accessible name is the
 * one its call site passes. A single optional `clearLabel` would make "clearable but unnamed"
 * a thing you can ship; a discriminated union makes it fail to compile — the same move
 * `Icon.tsx` made when it turned the stroke contract into props.
 */
type ClearProps =
  { onClear: () => void; clearLabel: string } | { onClear?: undefined; clearLabel?: undefined }

/**
 * The clear affordance, for a field whose value arrives PRE-FILLED by something other than
 * the user — `/new`'s parsed item names, where replacing a name the LLM guessed otherwise
 * means holding backspace over twenty characters on a phone (card #11).
 *
 * ── it is 14px INSIDE the well, and the row's delete is 22px OUTSIDE it ────────────────────
 * `ItemRow` already puts a `size-touch` CloseIcon 8px to the right of this field, and that one
 * DELETES THE ITEM. Two identical marks with different consequences, adjacent, is the whole
 * risk here, so they are separated three ways that are not colour: the painted glyph (`xs`
 * 14px against `md` 22px), the field's own boundary running between them, and flat chrome
 * inside a filled well against a control floating on paper.
 *
 * ── why NOT `touch-target`, which is this repo's normal answer for a small control ─────────
 * That utility centres a 44px `::after` on the button "without changing its painted size". On
 * a glyph parked 14px inside the field's right edge, the pseudo-element reaches ~15px PAST it
 * — across the `gap-2` and into the destructive delete button's own 44px. Overlapping hit
 * areas between a harmless action and a destructive one is the one thing this row cannot have,
 * and nothing paints, so review would never see it. The button is a real `w-touch` box inside
 * the input instead: its hit area stops exactly where the input does, and both controls still
 * clear the 44px floor (R-41).
 *
 * ── the early return is gated on `onClear`, NEVER on the button's visibility ───────────────
 * `onClear` is stable per call site; the button's visibility flips on the first keystroke. Gate
 * the wrapper on the latter and the element at this position changes `input` → `div`, so React
 * unmounts the input and mounts a fresh one — the field loses focus and the keyboard closes as
 * the user types the first character. The wrapper is therefore always there when clearable.
 */
export function Input({ className, id, ref, onClear, clearLabel, ...rest }: InputProps) {
  const field = useFieldContext()

  /*
   * The node, which this component did not previously hold — the caller's `ref` was spread
   * straight through. Clearing has to refocus (see the button below), so both need it.
   *
   * No behaviour change for existing callers: `ReviewStage` passes an inline arrow whose
   * identity already changes every render, so the detach/attach churn — and `registerName`'s
   * null branch that absorbs it — is exactly what it was.
   */
  const inner = React.useRef<HTMLInputElement | null>(null)
  const attach = (node: HTMLInputElement | null) => {
    inner.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  // All three, and `disabled` is not decoration: a disabled field with a live clear button is
  // a control that edits a form the user has been told is busy saving.
  const showClear = onClear !== undefined && !rest.disabled && String(rest.value ?? '') !== ''

  const input = (
    <input
      id={id ?? field?.inputId}
      ref={attach}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(CONTROL_BASE, showClear ? 'pr-touch' : 'pr-3.5', className)}
      {...rest}
    />
  )

  if (onClear === undefined) return input

  return (
    <div className="relative">
      {input}

      {showClear && (
        <button
          type="button"
          /*
           * The tap never moves focus off the input, which on iOS is what stops the keyboard
           * closing and reopening under the user's thumb mid-edit.
           */
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClear()
            /*
             * For the case the line above does not cover: typed, scrolled away, came back and
             * tapped. `focus()` inside a click gesture raises the keyboard on iOS.
             *
             * `preventScroll` is load-bearing, not tidiness — `ReviewStage` records that a
             * plain `focus()` "jumps the element to the nearest edge, and the nearest edge is
             * frequently under the sticky bar".
             */
            inner.current?.focus({ preventScroll: true })
          }}
          // `justify-end pr-3.5` lands the glyph on the field's own text inset, so it lines up
          // with everything else on the screen while the 44px box behind it starts further in.
          className="absolute inset-y-0 right-0 flex w-touch press items-center justify-end pr-3.5 text-ink-3"
          aria-label={clearLabel}
        >
          <CloseIcon size="xs" />
        </button>
      )}
    </div>
  )
}

/** Same reasoning as `InputProps.ref` above. */
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>
}

/**
 * Padded rather than line-height-centred: a textarea is a surface you write onto, not a
 * slot you fill. F05's paste box is the main consumer, and it is the biggest frosted block in
 * the app — pasted receipt text at 500 with generous leading, so a wall of lines still
 * reads as a list. At 294px tall it is also the one place a creature can sit behind a whole
 * paragraph, which is the best argument in the app for R-137 and the worst case its contrast
 * floor is set by.
 */
export function TextArea({ className, id, rows = 6, ...rest }: TextAreaProps) {
  const field = useFieldContext()
  return (
    <textarea
      id={id ?? field?.inputId}
      rows={rows}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(
        'glass w-full rounded-card border border-transparent p-4',
        'text-input leading-[1.6] font-medium text-ink placeholder:text-ink-3',
        'resize-none aria-[invalid=true]:border-red-ink',
        className,
      )}
      {...rest}
    />
  )
}
