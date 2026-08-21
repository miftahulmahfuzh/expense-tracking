import type * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'

/*
 * Deliberately NOT marked "use client". Nothing here uses a hook or an effect, so the
 * module compiles into whichever graph imports it: a client screen gets an interactive
 * button, and F09's public share page gets a `ButtonLink` with no React shipped at all.
 * Marking it would force the second case to become a client boundary for no benefit.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
/** `lg` = 54px, the design's normal button. `md` = 44px, the small variant. */
export type ButtonSize = 'md' | 'lg'

export interface ButtonBaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  leadingIcon?: React.ReactNode
}

export interface ButtonProps
  extends ButtonBaseProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  /** Disables the button, keeps its exact width, swaps the label for pulsing dots. */
  loading?: boolean
}

/*
 * A button is a flat BLOCK of colour with a heavy sentence-case label — no border, no
 * shadow, no uppercase tracking. The previous system set every button in mono caps on the
 * theory that an instruction is bookkeeping; this one gets its authority from weight (800)
 * and size (17px) instead, which is what lets the label stay sentence case and still shout.
 */
const BASE =
  'relative inline-flex items-center justify-center gap-2.5 select-none whitespace-nowrap ' +
  'rounded-field border-0 press ' +
  'disabled:opacity-50 disabled:pointer-events-none'

const SIZES: Record<ButtonSize, string> = {
  md: 'h-touch px-4.5 text-chip font-extrabold',
  lg: 'h-btn px-5 text-btn',
}

/*
 * One RED button per screen and that is the next action. Everything else is a white block
 * or nothing at all, so the page has exactly one obvious thing to tap. Elevation is
 * contrast: `secondary` and `destructive` are `card` on `paper` and need no edge;
 * `destructive` differs from `secondary` only in the colour of its type, which is the
 * design's answer to "destructive should not compete with primary".
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-red text-red-fg',
  secondary: 'bg-card text-ink',
  ghost: 'bg-transparent text-ink-3',
  destructive: 'bg-card text-red-ink',
}

/** Exported so a non-`<button>` element can borrow the look. Prefer `ButtonLink`. */
export function buttonClasses(o: ButtonBaseProps = {}): string {
  const { variant = 'primary', size = 'lg', fullWidth = false } = o
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'w-full')
}

/**
 * The loading indicator: three dots pulsing out of phase, in `currentColor`, so it works
 * on ink and on paper without a variant. Not a spinner — a spinner reads as "the app is
 * thinking about itself", three dots read as "your text is being worked on".
 */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} aria-hidden="true">
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-duration:1s]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.16s] [animation-duration:1s]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.32s] [animation-duration:1s]" />
    </span>
  )
}

/**
 * Alias kept because F10's published interface named this `Spinner` and four feature plans
 * were written against that name. There is no spinning anything in this design system.
 */
export const Spinner = LoadingDots

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaults to "button" on purpose: an unlabelled <button> inside a <form> submits it,
      // which has surprised every codebase that let the platform default stand. Pass
      // type="submit" explicitly.
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonClasses({ variant, size, fullWidth }),
        loading && 'opacity-85',
        className,
      )}
      {...rest}
    >
      {/* The label keeps its box while loading, so the button never changes size. */}
      <span className={cn('inline-flex items-center gap-2.5', loading && 'invisible')}>
        {leadingIcon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <LoadingDots />
        </span>
      )}
    </button>
  )
}

export interface ButtonLinkProps
  extends ButtonBaseProps, Omit<React.ComponentProps<typeof Link>, 'className'> {
  className?: string
}

export function ButtonLink({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  leadingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...rest}>
      {leadingIcon}
      {children}
    </Link>
  )
}
