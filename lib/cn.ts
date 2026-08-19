/**
 * Class-name join. No `clsx`, no `tailwind-merge`.
 *
 * A five-line filter is enough because every component in `components/ui`
 * puts the caller's `className` LAST, so a later utility wins on source order
 * without any conflict-resolution logic. If you ever find yourself wanting
 * tailwind-merge, the component is accepting overrides it should be exposing
 * as a prop instead.
 */
export type ClassValue = string | false | null | undefined

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ')
}
