'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { photoOwnedBy } from '@/lib/db/queries'
import { expensePhotos, photoShareLinks } from '@/lib/db/schema'
import { isValidId, newShareToken } from '@/lib/id'
import { photoShareUrl, SHARE_MINT_ATTEMPTS } from '@/lib/share/config'
import { shareOrigin } from '@/lib/share/origin'

/**
 * The photo share Server Action — F12 §4.3.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THIS IS `app/actions/share.ts` WITH THE NOUNS CHANGED, DELIBERATELY. Read that file's
 *  docblocks before changing anything here — every argument it makes applies, because this
 *  action does the same dangerous thing at a narrower scope: it PUBLISHES to the open
 *  internet.
 *
 *  R-5: `proxy.ts` does not cover Server Functions, so `requireUserId()` on line 1 and the
 *  ownership check on line 2 are the boundary, not ceremony. Without the ownership check, any
 *  signed-in Google account (roadmap D3 lets anyone sign in) could mint a public link to a
 *  stranger's receipt by guessing a photo id.
 *
 *  R-99: ownership comes from F03's read layer — `photoOwnedBy` — and is never re-declared
 *  here. A second copy of an ownership check is the R-77 failure mode: silent on the day one
 *  copy is hardened and the other is not.
 *
 *  R-4: the Neon HTTP driver has no interactive transactions, so check-then-write is two
 *  statements. Safe for the same reason as its sibling: the check proves ownership and the
 *  write carries the proven photo id. The worst outcome of a race is the idempotent branch
 *  firing, which is a success.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS IS A SEPARATE FILE from `share.ts`, rather than two more exports there: the module
 * is the bundle boundary. `components/share/*` imports `share.ts`; `PhotoManager` imports this.
 * Merging them would put `revokeShareLink` into the photo gallery's graph and vice versa — not
 * a leak, since both are owner-only, but `tests/share.bundle.test.ts` reasons about routes by
 * which action modules they reach, and one fat action module makes that test coarser.
 */

/** Shape check on an attacker-controlled argument, before any statement runs. */
const PhotoIdZ = z.string().refine(isValidId, 'invalid photo id')

async function selectTokenForPhoto(photoId: string): Promise<string | null> {
  const rows = await db
    .select({ token: photoShareLinks.token })
    .from(photoShareLinks)
    .where(eq(photoShareLinks.photoId, photoId))
    .limit(1)
  return rows[0]?.token ?? null
}

/**
 * Get-or-create the public link for ONE photo, and return its absolute URL.
 *
 * ═══ IDEMPOTENT BY DESIGN. THIS IS THE FEATURE, NOT AN OPTIMISATION. ═══
 *
 * `photo_share_links.photo_id` is UNIQUE, and that constraint exists for a product reason: a
 * link the user already sent to a friend must keep working. A second tap of the share icon
 * copies the SAME url. If it minted a fresh token and orphaned the first, the user would
 * silently break a URL they sent yesterday, with nothing anywhere to tell them.
 *
 * RETURNS THE URL, NOT THE TOKEN, and that is not laziness. `shareOrigin()` carries
 * `server-only`, and the reason it exists at all is that `window.location.origin` on a preview
 * deployment hands a friend a `*.vercel.app` host that dies at the next push. `ShareButton`
 * solves that by taking the origin as a prop resolved in a server component; the Lightbox is
 * three components deep inside a client tree, so threading a prop that far to build one string
 * is worse than building the string where the origin already is.
 */
export async function createPhotoShareLink(photoId: string): Promise<string> {
  const userId = await requireUserId()
  const id = PhotoIdZ.parse(photoId)

  /*
   * Ownership BEFORE any write, and it hands back the group id the revalidation needs. One
   * indexed statement: `photoOwnedBy` is the correlated EXISTS that joins expense_photos back
   * to expense_groups.user_id, which §4.4 calls "the single most important security invariant".
   */
  const owned = await db
    .select({ groupId: expensePhotos.groupId })
    .from(expensePhotos)
    .where(and(eq(expensePhotos.id, id), photoOwnedBy(userId)))
    .limit(1)

  const groupId = owned[0]?.groupId
  // "No such photo" and "not yours" are indistinguishable on purpose — distinguishing them is
  // an ownership oracle that lets an attacker enumerate other users' ids.
  if (!groupId) throw new Error('Foto tidak ditemukan')

  // 1. Fast path. A link exists → hand back the same URL. No write, no revalidation, no churn.
  //    This is what every tap after the first one does.
  const existing = await selectTokenForPhoto(id)
  if (existing) return photoShareUrl(shareOrigin(), existing)

  for (let attempt = 0; attempt < SHARE_MINT_ATTEMPTS; attempt++) {
    const token = newShareToken()

    /*
     * 2. `onConflictDoNothing()` with NO conflict target, deliberately. It absorbs BOTH unique
     *    constraints in one code path:
     *      photo_share_links_pkey          → a token collision (2^-72; will not happen)
     *      photo_share_links_photo_id_unq  → someone else got there first (a double-tap)
     *    Targeting only photo_id would let a PK collision surface as an unhandled 23505.
     *
     *    R-60 is why this shape beats catching the error: a Drizzle unique violation carries
     *    its `code: '23505'` on `error.cause`, not in `error.message`, so the obvious
     *    message-regex handler silently never matches and the "formality" becomes an unhandled
     *    500. Nothing throws on this path, so there is no message to get wrong.
     */
    const inserted = await db
      .insert(photoShareLinks)
      .values({ token, photoId: id })
      .onConflictDoNothing()
      .returning({ token: photoShareLinks.token })

    if (inserted.length === 1) {
      // The owner's detail page is the only surface that renders anything about this link
      // today, and it is where a future revoke control would live.
      revalidatePath(`/e/${groupId}`)
      return photoShareUrl(shareOrigin(), inserted[0]!.token)
    }

    // 3. Zero rows means one of the two constraints fired. Re-reading by photo_id is what tells
    //    them apart — and it is why the no-target form above is correct.
    const raced = await selectTokenForPhoto(id)
    if (raced) {
      // photo_id UNIQUE: a concurrent mint won. Its token is the real one, and returning it is
      // what makes a double-tap harmless instead of an error the user did not cause.
      return photoShareUrl(shareOrigin(), raced)
    }
    // Otherwise the PRIMARY KEY fired: draw a new token and go round again.
  }

  throw new Error('Gagal membuat tautan.')
}
