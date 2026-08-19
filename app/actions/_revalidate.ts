import 'server-only'

import { revalidatePath } from 'next/cache'

/**
 * Cache invalidation for everything hanging off an expense group. F07 owns this; F06's
 * photo actions and F09's share actions import it too, so there is one answer to "what
 * goes stale when a group changes" rather than one per feature.
 *
 * WHY LITERAL PATHS. `revalidatePath('/m/[month]', 'page')` would invalidate every month
 * the user has ever opened. We only ever want the one or two months this write touches, so
 * the month is passed in as a date and sliced here.
 *
 * WHY IT IS VARIADIC. Pass EVERY date the group has been associated with during this
 * action: the value read by the ownership anchor *before* the write, and — when the date
 * itself was edited — the value written. A date edit moves a group between two months and
 * BOTH month pages must be busted, or the month it left keeps showing a total that includes
 * an expense that is no longer in it. Identical months dedupe, so the common case costs one
 * path.
 *
 * WHY THIS MATTERS AT ALL, given that `/m/[month]` reads a cookie and is therefore never
 * statically cached: `revalidatePath` also evicts the entry from the *client* Router Cache.
 * A month reached through a `<Link prefetch>` sits in that cache's `static` bucket for five
 * minutes (Next 16 `staleTimes` defaults), so without this a corrected amount would not
 * show up on the month list the user navigates back to.
 */
export function revalidateGroup(
  groupId: string,
  ...isoDates: ReadonlyArray<string | null | undefined>
): void {
  revalidatePath(`/e/${groupId}`)

  const months = new Set<string>()
  for (const iso of isoDates) {
    if (iso) months.add(iso.slice(0, 7))
  }
  for (const month of months) revalidatePath(`/m/${month}`)

  // F08 aggregates over every month, so it cannot be narrowed the way the month list can.
  // Cheap to bust, expensive to get wrong.
  revalidatePath('/stats')
}

/**
 * DELIBERATELY NOT REVALIDATED: `/s/[token]`.
 *
 * An action knows a group id, not a token, and looking one up on every write would be a
 * round trip spent on a page most groups do not have. F09 renders the share page
 * dynamically with no ISR, so it reads through on every request anyway. If that ever
 * changes, the token has to be passed in here rather than each action inventing its own
 * answer.
 */
