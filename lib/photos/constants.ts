/**
 * Tunables for the photo pipeline — docs/plans/F06-photos.md Task 6.
 *
 * Everything the compression and upload paths argue about lives here, so the
 * storage-budget knobs (§13.4) are one file rather than a grep. Pure module: no
 * imports, importable from client, server, and a plain node script alike, which is
 * what lets scripts/blob-sweep.ts share PHOTO_PREFIX and ORPHAN_GRACE_MS with the
 * running app instead of re-declaring them.
 */

/**
 * Per-group cap when `PHOTO_MAX_PER_GROUP` is unset — the value every environment gets
 * until someone deliberately overrides it. NOT the number to read when enforcing: the
 * effective cap is `maxPhotosPerGroup()` in ./cap, which is this unless the env says
 * otherwise. This module stays pure (see the header) precisely so the client can import
 * the default without dragging `lib/env` — and therefore `server-only` — into its bundle.
 */
export const DEFAULT_MAX_PHOTOS_PER_GROUP = 20

/**
 * Absolute ceiling on `PHOTO_MAX_PER_GROUP`. An env var is a number a tired person types
 * into a web form at midnight; 500 there should fail at boot with a legible message, not
 * quietly authorise a 150 MB expense group against a 1 GB free tier. 50 is chosen to match
 * the bound `discardStagedPhotos` already puts on a pathname batch, so the two agree.
 */
export const PHOTO_CAP_CEILING = 50

/** Reject before we even try to decode: a 25 MB "image" is a mistake, not a photo. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/**
 * Server-side ceiling for the compressed upload. The target is ~300 KB but
 * browser-image-compression is best-effort: a dense screenshot may bottom out above
 * the target after maxIteration passes. 1.5 MB gives headroom while still making a
 * bypass attempt (uploading a raw 5 MB photo) fail loudly rather than silently
 * eating five photos' worth of the free tier.
 */
export const MAX_UPLOAD_BYTES = 1_500_000

export const UPLOAD_CONTENT_TYPE = 'image/jpeg'
/** We transcode everything to JPEG, so exactly one type is allowed through. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = ['image/jpeg'] as const

/** Compression targets — roadmap D2. */
export const TARGET_MAX_MB = 0.3
export const TARGET_MAX_EDGE = 1600
export const TARGET_QUALITY = 0.8
export const COMPRESSION_MAX_ITERATION = 10

/** Path to the self-hosted worker bundle (scripts/copy-image-compression-worker.mjs). */
export const COMPRESSION_LIB_URL = '/vendor/browser-image-compression.js'

/** Two concurrent uploads: enough to hide latency, few enough not to thrash cellular. */
export const UPLOAD_CONCURRENCY = 2

/** Blobs are immutable (random pathname), so cache them for a year. */
export const BLOB_CACHE_MAX_AGE = 60 * 60 * 24 * 365

/** Client tokens are single-use-ish and short-lived. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000

export const PHOTO_PREFIX = 'photos/'

/**
 * What the client is allowed to ASK for, validated in onBeforeGenerateToken so a
 * hostile client cannot write outside photos/ or pick a colliding name.
 * nanoid(21) over the 64-symbol URL-safe alphabet => ~125 bits.
 */
export const PHOTO_REQUEST_PATHNAME_RE = /^photos\/[A-Za-z0-9_-]{21}\.jpg$/

/**
 * What Vercel actually STORES, because addRandomSuffix:true rewrites the pathname.
 * Used to validate pathnames coming back from the client in attachPhoto() and
 * discardStagedPhotos().
 *
 * MEASURED, not assumed: a put() round trip against the real store turned
 *   photos/Uk-igSGzS6rpPd1sRM9iz.jpg
 * into
 *   photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg
 * i.e. '-' plus 30 mixed-case alphanumerics.
 *
 * The suffix bound is deliberately loose (16..64) rather than pinned at 30. This
 * regex's job is to stop path traversal and enforce our prefix, alphabet and
 * extension — not to pin an internal of Vercel's that we do not control. Pinned at
 * 30, the day they change the suffix length is the day every upload dies at
 * attachPhoto with "invalid pathname" and the bytes are already paid for.
 */
export const PHOTO_STORED_PATHNAME_RE = /^photos\/[A-Za-z0-9_-]{21}-[A-Za-z0-9_-]{16,64}\.jpg$/

/** Staged blobs older than this with no DB row are considered abandoned (§11.2). */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000

/** Free-tier storage ceiling, for the usage report. Vercel reports decimal GB. */
export const BLOB_FREE_TIER_BYTES = 1_000_000_000
