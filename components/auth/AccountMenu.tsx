import { auth } from '@/auth'
import { SignOutButton } from './SignOutButton'

/**
 * "Who am I, and get me out." F07 owns the real header; this exists so F02 is verifiable
 * end-to-end on its own, and so exactly one component renders the signed-in identity.
 *
 * Reads `auth()` rather than `getUserId()` because it is the one place that wants the profile
 * — name, email — rather than the id. Everything else should use `requireUserId()`.
 */
export async function AccountMenu() {
  const session = await auth()
  if (!session?.user) return null

  return (
    <div className="flex items-center justify-between gap-4 px-gutter py-3">
      <div className="min-w-0">
        <p className="truncate text-body">{session.user.name ?? 'Kamu'}</p>
        <p className="truncate text-meta text-ink-3">{session.user.email}</p>
      </div>
      <SignOutButton fullWidth={false} />
    </div>
  )
}
