import { Button } from '@/components/ui'
import { signOutAction } from '@/lib/auth/actions'

/**
 * The sign-out affordance. F07 drops this into whatever header menu it builds; it is also
 * usable standalone.
 *
 * A plain `<form>` posting to a Server Action, so it works before hydration and ships no
 * client JavaScript. `destructive` rather than `primary` because one filled button per screen
 * is the design's rule, and leaving is never the screen's main action.
 */
export function SignOutButton({ fullWidth = true }: { fullWidth?: boolean }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="destructive" size="md" fullWidth={fullWidth}>
        Keluar
      </Button>
    </form>
  )
}
