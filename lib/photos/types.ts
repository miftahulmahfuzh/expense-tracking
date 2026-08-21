/**
 * The photo boundary types — docs/plans/F06-photos.md Task 7.
 *
 * Deliberately dependency-free. F05 holds StagedPhoto[] in client state and puts it in
 * a localStorage draft; PhotoGallery takes PhotoDTO[] straight from a server component.
 * An import of anything server-side here (lib/db, lib/env) would drag `server-only`
 * into a client bundle and break both.
 */

/**
 * A blob that exists in storage but may not yet have an expense_photos row.
 * This is the currency of the /new flow: F05 holds StagedPhoto[] and hands it to
 * createExpense (reconciliation R-2).
 *
 * Its Zod mirror is `NewPhotoInputSchema` in lib/schema/expense.ts, which F03a owns
 * (R-46). Dimensions are REQUIRED there and here, because this shape only ever comes
 * from compressForUpload, which always measures the output. That is not true of
 * `AttachPhotoInput`, whose three are optional because the onUploadCompleted webhook
 * never sees the image. The asymmetry is deliberate; do not harmonise it.
 */
export type StagedPhoto = {
  blobUrl: string
  blobPathname: string
  width: number
  height: number
  sizeBytes: number
}

/** Alias used in the createExpense signature so the intent reads clearly (R-2). */
export type NewPhotoInput = StagedPhoto

/**
 * A persisted photo, as returned by F03's getGroupDetail / getGroupByShareToken.
 *
 * Structurally identical to `PhotoRow` in lib/db/queries.ts, and re-declared rather
 * than re-exported ON PURPOSE: `lib/db/queries.ts` imports the Drizzle client, so a
 * type-only import from it is one accidental `import { PhotoRow }` away from pulling
 * the database into the browser. tests/photos.types.test.ts asserts the two shapes are
 * mutually assignable, so they cannot drift apart in silence.
 */
export type PhotoDTO = {
  id: string
  blobUrl: string
  blobPathname: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  sortOrder: number
}

export type UploadStatus =
  | 'queued' // accepted, waiting for a concurrency slot
  | 'compressing' // in the worker
  | 'uploading' // bytes going to Vercel Blob
  | 'attaching' // attached mode only: writing the DB row
  | 'done'
  | 'error'
  | 'canceled'

/** One tile in the picker. `file` is retained so retry does not need a re-pick. */
export type UploadItem = {
  key: string
  file: File
  /** Object URL of the ORIGINAL, so a thumbnail appears before compression finishes. */
  previewUrl: string
  status: UploadStatus
  /** 0..100 across the whole pipeline: compression is the first 30%, upload the rest. */
  progress: number
  originalBytes: number
  compressedBytes: number | null
  error: string | null
  result: StagedPhoto | null
}

/**
 * The minimum the full-screen viewer needs — F12 §4.5.
 *
 * `PhotoDTO` satisfies this structurally, so the owner's gallery passes its rows unchanged and
 * nothing had to be re-typed. It exists for the other caller: `/f/[token]` resolves a share
 * token to `SharedPhoto`, whose projection is a privacy boundary and deliberately carries no
 * `blobPathname`, no `sizeBytes` and no `sortOrder` (lib/db/queries.ts). Requiring `PhotoDTO`
 * there would have meant fabricating three fields to satisfy a type, which is how a projection
 * quietly grows back the columns it was written to exclude.
 *
 * `id` is an IDENTITY, not necessarily the database id: it keys the React list and the
 * per-photo download/link caches in `Lightbox`. On the public page the share token plays that
 * role, because it is the only stable handle that page legitimately has.
 */
export type ViewablePhoto = {
  id: string
  blobUrl: string
  width: number | null
  height: number | null
}
