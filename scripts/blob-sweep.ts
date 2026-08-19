/**
 * Orphan sweeper and storage report — docs/plans/F06-photos.md Task 19, §11.
 *
 *   npm run blob:usage     report only, never deletes  (default)
 *   npm run blob:sweep     actually delete orphans     (--delete)
 *
 * An ORPHAN is a blob under photos/ that (a) no expense_photos row references and (b) is
 * older than ORPHAN_GRACE_MS. Both conditions matter: the grace period is what stops the
 * sweeper eating a draft that is open in a browser tab right now, since a /new draft holds
 * uploaded blobs with no rows for exactly as long as the user takes to tap Simpan (§11.2).
 *
 * Deliberately a manual chore rather than a cron (plan OQ-5): a scheduled job whose whole
 * purpose is deleting storage is a bigger risk on a personal app than a few stray megabytes.
 *
 * Runs under `node --import tsx`, which treats .ts as CJS here (no "type": "module" in
 * package.json) — so no top-level await, hence main().
 */
import { del, list } from '@vercel/blob'

import { db } from '../lib/db'
import { expensePhotos } from '../lib/db/schema'
import { BLOB_FREE_TIER_BYTES, ORPHAN_GRACE_MS, PHOTO_PREFIX } from '../lib/photos/constants'

const DELETE = process.argv.includes('--delete')

/** Vercel reports storage in decimal units, so MB here is 1e6 and the % matches theirs. */
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`
const pad = (label: string) => label.padEnd(26, ' ')

type Blob = { pathname: string; size: number; uploadedAt: Date }

async function listAllPhotoBlobs(): Promise<Blob[]> {
  const blobs: Blob[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: PHOTO_PREFIX, limit: 1000, cursor })
    for (const b of page.blobs) {
      blobs.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

async function main() {
  const blobs = await listAllPhotoBlobs()

  // Every referenced pathname, across all users. This script is an operator tool run from a
  // laptop with the store's read-write token, so there is no per-user scoping to do — and
  // scoping it would make it miss precisely the orphans it exists to find.
  const rows = await db.select({ pathname: expensePhotos.blobPathname }).from(expensePhotos)
  const referenced = new Set(rows.map((r) => r.pathname))

  const cutoff = Date.now() - ORPHAN_GRACE_MS
  const orphans = blobs.filter((b) => !referenced.has(b.pathname))
  const sweepable = orphans.filter((b) => b.uploadedAt.getTime() < cutoff)
  const tooRecent = orphans.length - sweepable.length

  const totalBytes = blobs.reduce((n, b) => n + b.size, 0)
  const orphanBytes = orphans.reduce((n, b) => n + b.size, 0)
  const sweepBytes = sweepable.reduce((n, b) => n + b.size, 0)
  const usedPct = (totalBytes / BLOB_FREE_TIER_BYTES) * 100
  const avg = blobs.length > 0 ? Math.round(totalBytes / blobs.length) : 0

  // A row pointing at a blob that is NOT in the store: the opposite failure, and a worse
  // one — the gallery and any share page render a broken tile. Reported, never auto-fixed,
  // because deleting a user's row is not a housekeeping decision.
  const present = new Set(blobs.map((b) => b.pathname))
  const danglingRows = [...referenced].filter((p) => !present.has(p))

  console.log('── Vercel Blob usage ─────────────────────────────')
  console.log(`${pad(`blobs under ${PHOTO_PREFIX}`)} ${blobs.length}`)
  console.log(`${pad('rows in expense_photos')} ${referenced.size}`)
  console.log(
    `${pad('total size')} ${mb(totalBytes)} of ${mb(BLOB_FREE_TIER_BYTES)} (${usedPct.toFixed(1)}%)`,
  )
  console.log(`${pad('average photo')} ${avg > 0 ? `${Math.round(avg / 1024)} KB` : '—'}`)
  console.log(`${pad('orphans')} ${orphans.length} (${mb(orphanBytes)})`)
  console.log(`${pad('  ├─ sweepable (>24h)')} ${sweepable.length} (${mb(sweepBytes)})`)
  console.log(`${pad('  └─ too recent, skipped')} ${tooRecent}`)
  if (avg > 0) {
    const headroom = Math.max(0, BLOB_FREE_TIER_BYTES - totalBytes)
    console.log(`${pad('room left')} ~${Math.floor(headroom / avg)} more photos`)
  }

  if (danglingRows.length > 0) {
    console.log('')
    console.log(`!!  ${danglingRows.length} row(s) point at a blob that is NOT in the store.`)
    console.log('    Those render as broken tiles, including on any /s/<token> share page.')
    console.log('    Not deleted by this script — inspect, then remove the rows deliberately:')
    danglingRows.slice(0, 10).forEach((p) => console.log(`      ${p}`))
    if (danglingRows.length > 10) console.log(`      …and ${danglingRows.length - 10} more`)
  }

  if (usedPct >= 80) {
    console.log('')
    console.log('!!  OVER 80% OF THE FREE TIER. See docs/plans/F06-photos.md §13.4.')
  }

  if (!DELETE) {
    console.log('')
    console.log('dry run — nothing deleted. Re-run with `npm run blob:sweep` to delete.')
    sweepable.slice(0, 20).forEach((b) => console.log(`  would delete ${b.pathname} (${b.size} B)`))
    if (sweepable.length > 20) console.log(`  …and ${sweepable.length - 20} more`)
    return
  }

  if (sweepable.length === 0) {
    console.log('')
    console.log('nothing to delete.')
    return
  }

  console.log('')
  for (let i = 0; i < sweepable.length; i += 100) {
    const chunk = sweepable.slice(i, i + 100)
    await del(chunk.map((b) => b.pathname))
    console.log(`deleted ${i + chunk.length}/${sweepable.length}`)
  }
  console.log(`reclaimed ${mb(sweepBytes)}.`)
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
