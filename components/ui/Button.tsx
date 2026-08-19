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
/** `lg` = 52px, the design's normal button. `md` = 44px, the small variant. */
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
 * Every button is mono, uppercase and letter-spaced: a button is an instruction, and
 * instructions are bookkeeping, not language. That is also what keeps a 12px label
 * legible — tracking at 0.16em buys back the size.
 */
const BASE =
  'relative inline-flex items-center justify-center gap-2.5 select-none whitespace-nowrap ' +
  'rounded-field border font-mono uppercase press ' +
  'disabled:opacity-50 disabled:pointer-events-none'

const SIZES: Record<ButtonSize, string> = {
  md: 'h-touch px-4 text-action',
  lg: 'h-btn px-5 text-btn',
}

/*
 * One filled button per screen and it is ink. Everything else is an outline, so the page
 * has exactly one obvious next action. No shadows: `secondary` earns its edge from the
 * hairline, `destructive` from the red it borrows for both border and text.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-ink bg-ink text-paper',
  secondary: 'border-rule-strong bg-transparent text-ink-2',
  ghost: 'border-transparent bg-transparent text-ink-3',
  destructive: 'border-red bg-transparent text-red',
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
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden="true">
      <span className="size-1 animate-pulse rounded-full bg-current [animation-duration:1.1s]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:0.18s] [animation-duration:1.1s]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:0.36s] [animation-duration:1.1s]" />
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
