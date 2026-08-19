import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PhotoManager, PhotoPicker } from '@/components/photos'
import { ShareButton, ShareLinkPanel } from '@/components/share'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getGroupDetail } from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import { shareOrigin } from '@/lib/share/origin'

import { ExpenseEditor } from './ExpenseEditor'

/**
 * `/e/[id]` — one expense group: items, photos, everything editable in place.
 *
 * ROUTE GROUP `(bare)`, not `(shell)` (design R-38, recorded as R-51). Detail is a *pushed*
 * view reached from the month list, not a tab destination, so it carries a back chevron
 * instead of a tab bar — the convention the thumb already expects. This reverses F07's own
 * plan (its A1/A2), and the design won for the reason R-51 gives.
 *
 * NEVER 403. `getGroupDetail` is userId-scoped and returns null for both "no such group" and
 * "not yours", and this page 404s on either. A 403 would confirm that an id exists, which is
 * an enumeration oracle over other people's data.
 */

export async function generateMetadata({ params }: PageProps<'/e/[id]'>): Promise<Metadata> {
  const { id } = await params
  if (!isValidId(id)) return { title: 'Tidak ditemukan', robots: { index: false, follow: false } }

  const userId = await requireUserId()
  const detail = await getGroupDetail(userId, id)

  /*
   * `robots: noindex` even though this route is behind auth and behind proxy.ts. A private
   * page's title is not something to leave to a crawler's good manners, and the public share
   * page (F09) is the one surface that is *meant* to be linkable.
   *
   * This is a second `getGroupDetail` for the same request — Next calls generateMetadata and
   * the page separately, and unlike F09's share read (R-22) this one is not wrapped in React
   * `cache()`. Two indexed batches on a per-user page is a fair price for an honest title; if
   * it ever needs to be one, `cache()` around the read is the fix, in F03's module.
   */
  return {
    title: detail?.title ?? 'Tidak ditemukan',
    robots: { index: false, follow: false },
  }
}

export default async function ExpenseDetailPage({ params }: PageProps<'/e/[id]'>) {
  const { id } = await params

  // Shape check first: /e/<garbage> is a routing mistake and does not deserve a round trip.
  if (!isValidId(id)) notFound()

  const userId = await requireUserId()
  const detail = await getGroupDetail(userId, id)
  if (!detail) notFound()

  /*
   * Resolved HERE, on the server, and passed down — never read in the browser. AUTH_URL
   * lives behind `lib/env.ts`'s `server-only` pragma and is not NEXT_PUBLIC_, so a client
   * component reading it would get `undefined` and silently share a localhost URL; and
   * `window.location.origin` on a preview deployment would hand a friend a `*.vercel.app`
   * link that dies at the next push (F09 Open question 6).
   */
  const origin = shareOrigin()

  return (
    <ExpenseEditor
      groupId={detail.id}
      meta={{ title: detail.title, occurredOn: detail.occurredOn, note: detail.note }}
      items={detail.items}
      /*
       * SLOTS, not imports inside the client component. These are rendered HERE, in a server
       * component, and handed down as ReactNode — so F06's components keep their own
       * server/client boundary and `ExpenseEditor` never has to know which they are.
       *
       * R-80 decides which gallery: `PhotoManager` (carries deletePhoto) on the owner's page,
       * `PhotoGallery` on /s/[token] so the public bundle ships no Server Action id. F07 does
       * not implement thumbnails, a lightbox, compression, upload progress or blob deletion —
       * all of it is F06's, and the picker owns the "Foto" heading and the n/10 counter too.
       */
      photoSlot={
        <>
          <PhotoPicker
            mode="attached"
            groupId={detail.id}
            existingCount={detail.photos.length}
            className="px-safe"
          />
          <PhotoManager photos={detail.photos} className="mt-2 px-safe" />
        </>
      }
      /*
       * F09. `detail.shareToken` (R-12) came back with the group detail F07 already
       * fetched, so the whole feature costs no extra query — and the revoke panel is
       * therefore correct on FIRST PAINT, with no loading flash and no client fetch on
       * mount. Two slots, not one: the header carries the action (design R-38 allows
       * exactly one there), the body carries the status and the destructive control.
       */
      shareSlot={
        <ShareButton
          groupId={detail.id}
          title={detail.title}
          occurredOn={detail.occurredOn}
          origin={origin}
          initialToken={detail.shareToken}
        />
      }
      shareLinkSlot={
        <ShareLinkPanel groupId={detail.id} token={detail.shareToken} origin={origin} />
      }
    />
  )
}
