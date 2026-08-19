import { nanoid } from 'nanoid'

import { PHOTO_PREFIX } from './constants'

/**
 * The pathname the CLIENT requests — docs/plans/F06-photos.md Task 8.
 *
 * Carries no userId and no groupId (decision D-F). Blob URLs are public and pasteable:
 * a userId in the path leaks a stable identifier to everyone a URL is forwarded to, and
 * a groupId lets a share-page recipient work out which images belong together.
 * Ownership lives in Postgres and nowhere else.
 *
 * nanoid(21) directly rather than newId() from lib/id: that helper is 12 symbols (72
 * bits), which is right for a database key sitting behind an ownership check. This
 * string is the ONLY thing protecting a public URL, so it gets the full 21 symbols
 * (~125 bits) — plus Vercel's own 30-character random suffix on top. Reconciliation
 * R-42 records this split deliberately.
 *
 * ALWAYS persist the `pathname` that upload() returns, never the one passed in:
 * addRandomSuffix rewrites it.
 */
export function newPhotoPathname(): string {
  return `${PHOTO_PREFIX}${nanoid(21)}.jpg`
}
