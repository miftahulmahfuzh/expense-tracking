'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { getOwnedGroupAnchor } from '@/lib/db/queries'
import { shareLinks } from '@/lib/db/schema'
import { isValidId, newShareToken } from '@/lib/id'
import { SHARE_MINT_ATTEMPTS } from '@/lib/share/config'

import { revalidateGroup } from './_revalidate'

/**
 * Share Server Actions — roadmap §4.4, F09.
 *
 * R-5 makes each of these its own security boundary: `proxy.ts` does not cover Server
 * Functions, and it deliberately does not match `/s` at all, so `requireUserId()` on line 1
 * and the ownership anchor on line 2 are the boundary, not ceremony. The stakes are higher
 * here than anywhere else in the app: every other action can, at worst, corrupt the
 * caller's own data, while this one PUBLISHES a group to the open internet. Without the
 * anchor, any signed-in Google account (roadmap D3 — anyone may sign in) could mint a public
 * link to a stranger's expenses by guessing a group id.
 *
 * OWNERSHIP COMES FROM F03'S READ LAYER (R-99), never re-declared here. `getOwnedGroupAnchor`
 * is one indexed statement that both proves `expense_groups.user_id = $userId` and returns
 * the date the revalidation needs — the second copy of an ownership check is the R-77 failure
 * mode, silent on the day one copy is hardened and the other is not.
 *
 * ON TRANSACTIONS. The Neon HTTP driver has no interactive transactions (R-4), so
 * anchor-then-write is two statements. Safe here for the same reason as F07's item actions:
 * the anchor proves ownership and the write carries the proven group id. The worst outcome
 * of a race is the idempotent branch below firing, which is a success, not a corruption.
 */

/** Shape check on an attacker-controlled argument, before any statement runs. */
const GroupIdZ = z.string().refine(isValidId, 'invalid group id')

async function selectTokenForGroup(groupId: string): Promise<string | null> {
  const rows = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(eq(shareLinks.groupId, groupId))
    .limit(1)
  return rows[0]?.token ?? null
}

/**
 * Get-or-create the public link for a group. Roadmap §4.4.
 *
 * ═══ IDEMPOTENT BY DESIGN. THIS IS THE FEATURE, NOT AN OPTIMISATION. ═══
 *
 * `share_links.group_id` is UNIQUE (roadmap §4.2), and that constraint exists for a product
 * reason: a link the user already sent to a friend must keep working. If a second tap of
 * Bagikan minted a fresh token and orphaned the first, the user would silently break a URL
 * they sent yesterday, with nothing anywhere to tell them. So the "get" branch is the common
 * one, and re-sharing returns the SAME token — never a new one.
 *
 * NOT CHOSEN: `ON CONFLICT (group_id) DO UPDATE SET token = excluded.token`, which is
 * exactly the churn above. Also not chosen: the `DO UPDATE SET group_id = excluded.group_id
 * RETURNING token` trick, which works but writes a dead tuple on every tap and turns the
 * read path into a write path for nothing.
 */
export async function createShareLink(groupId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  const id = GroupIdZ.parse(groupId)
  const anchor = await getOwnedGroupAnchor(userId, id)

  // 1. Fast path. A link exists → hand back the same token. No write, no revalidation,
  //    no churn. This is what every tap after the first one does.
  const existing = await selectTokenForGroup(id)
  if (existing) return { token: existing }

  for (let attempt = 0; attempt < SHARE_MINT_ATTEMPTS; attempt++) {
    const token = newShareToken()

    /*
     * 2. `onConflictDoNothing()` with NO conflict target, deliberately. It absorbs BOTH
     *    unique constraints in one code path:
     *      share_links_pkey           → a token collision (2^-72; will not happen)
     *      share_links_group_id_unq   → someone else got there first (a double-tap, two tabs)
     *    Targeting only group_id would let a PK collision surface as an unhandled 23505.
     *
     *    R-60 is why this shape is preferred to catching the error: a Drizzle unique
     *    violation carries its `code: '23505'` on `error.cause`, not in `error.message`, so
     *    the obvious message-regex handler silently never matches and the "formality" becomes
     *    an unhandled 500. Nothing throws on this path, so there is no message to get wrong —
     *    and anyone who changes this to a throwing insert must read R-60 first.
     */
    const inserted = await db
      .insert(shareLinks)
      .values({ token, groupId: id })
      .onConflictDoNothing()
      .returning({ token: shareLinks.token })

    if (inserted.length === 1) {
      revalidateGroup(id, anchor.occurredOn)
      return { token: inserted[0]!.token }
    }

    // 3. Zero rows means one of the two constraints fired. Re-reading by group_id is what
    //    tells them apart — and it is why the no-target form above is correct.
    const raced = await selectTokenForGroup(id)
    if (raced) {
      // group_id UNIQUE: a concurrent mint won. Its token is the real one, and returning it
      // is what makes a double-tap harmless instead of an error the user did not cause.
      return { token: raced }
    }
    // Otherwise the PRIMARY KEY fired: draw a new token and go round again.
  }

  throw new Error('Gagal membuat tautan.')
}

/**
 * Revoke = DELETE the row (roadmap §4.2). No `revoked_at`, no soft delete, no expiry.
 *
 * Consequences, all intentional and all spelled out in the confirm copy:
 *   - the URL the user already sent 404s within seconds;
 *   - sharing again mints a DIFFERENT token — the old URL never comes back;
 *   - so "revoke then re-share" is a break-and-replace, not a refresh.
 *
 * IDEMPOTENT: revoking a group with no link deletes nothing and is not an error, so a
 * double-tap or a stale tab cannot produce a scary message about a link that is already gone.
 *
 * NO `revalidatePath('/s/<token>')`. `/s/[token]` is force-dynamic with no ISR (F09 §2.8 and
 * `app/actions/_revalidate.ts`), so there is nothing cached to invalidate. If you ever find
 * you need that call, the share page has accidentally become cacheable — fix that instead.
 */
export async function revokeShareLink(groupId: string): Promise<void> {
  const userId = await requireUserId()
  const id = GroupIdZ.parse(groupId)
  const anchor = await getOwnedGroupAnchor(userId, id)

  await db.delete(shareLinks).where(eq(shareLinks.groupId, id))

  revalidateGroup(id, anchor.occurredOn)
}
