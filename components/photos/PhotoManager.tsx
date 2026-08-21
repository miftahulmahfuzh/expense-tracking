'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { deletePhoto } from '@/app/actions/photos'
import { createPhotoShareLink } from '@/app/actions/photoShare'
import type { PhotoDTO, ViewablePhoto } from '@/lib/photos/types'

import { PhotoGallery } from './PhotoGallery'

/**
 * The owner's gallery — reconciliation R-26.
 *
 * R-26 ordered a presentational grid split from the piece that carries the actions, so that
 * `deletePhoto`'s Server Action id is not shipped in /s/[token]'s bundle. A Server Action
 * reference in a client module becomes a callable id in that bundle, and a public page has
 * no business carrying one for a mutation its visitors can never be authorised to perform.
 *
 * So the split is by MODULE, which is what actually decides the bundle:
 *
 *   PhotoGallery   presentational. Imports no action. F09's /s/[token] renders this.
 *   PhotoManager   this file. Imports deletePhoto. Only /e/[id] renders it.
 *
 * The plan published PhotoGallery with an optional `onDelete`, which F07 would have had to
 * wire itself — meaning F07's page would need to be a client component or grow a wrapper of
 * exactly this shape. Publishing the wrapper here means each caller renders one component
 * and cannot get the security-relevant half wrong:
 *
 *   /e/[id]      <PhotoManager photos={group.photos} />   owner: delete + share
 *   /s/[token]   <PhotoGallery photos={group.photos} />   public: read-only
 *   /f/[token]   <Lightbox photos={[photo]} … />          public: one photo, no chrome
 */

export type PhotoManagerProps = {
  photos: PhotoDTO[]
  hideWhenEmpty?: boolean
  className?: string
}

export function PhotoManager({ photos, hideWhenEmpty, className }: PhotoManagerProps) {
  const router = useRouter()

  const handleDelete = useCallback(
    async (photo: ViewablePhoto) => {
      // The action revalidates /e/[id] on the server; refresh() is what makes this open
      // client tree pick up the new server render. Both are needed: revalidatePath alone
      // leaves the current tree showing the deleted tile.
      await deletePhoto(photo.id)
      router.refresh()
    },
    [router],
  )

  /**
   * F12 §4. Mints (or re-reads) the photo's public link and resolves to the absolute URL the
   * Lightbox copies to the clipboard.
   *
   * NO `router.refresh()` here, unlike the delete above: nothing on the current page renders
   * anything about a photo link, so there is no stale tree to reconcile. The action revalidates
   * `/e/[id]` on the server anyway, which is what a future revoke control would read.
   *
   * The URL is built server-side — the action returns it whole. `shareOrigin()` carries
   * `server-only` and exists precisely because `window.location.origin` on a preview deployment
   * would hand a friend a `*.vercel.app` host that dies at the next push.
   */
  const handleShare = useCallback((photo: ViewablePhoto) => createPhotoShareLink(photo.id), [])

  return (
    <PhotoGallery
      photos={photos}
      onDelete={handleDelete}
      onShare={handleShare}
      hideWhenEmpty={hideWhenEmpty}
      className={className}
    />
  )
}
