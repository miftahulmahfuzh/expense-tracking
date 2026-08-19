# F06 — Photos: Upload, Storage & Gallery

> **Status:** plan, not yet implemented
> **Depends on:** F01 (scaffold, `lib/env.ts`), F02 (`auth()`, `requireUserId()`), F03 (Drizzle schema, `db`, `newId()`)
> **Consumed by:** F05 (`/new` — staged photos in the add flow), F07 (`/e/[id]` — gallery + add + delete), F09 (`/s/[token]` — read-only gallery)
> **Authoritative contract:** `ROADMAP_v0.1.0.md` §4.2 (`expense_photos`), §4.4 (`attachPhoto` / `deletePhoto`), §4.5 (`POST /api/photos/upload`), D2, D8

---

## 0. What this feature is

The user photographs food and movie tickets with an iPhone XS Max, and screenshots BCA QRIS payment
confirmations. Those images get attached to an expense group so they can be browsed later from history.

**There is no image understanding** (roadmap D8). A photo is an opaque JPEG with a URL. We never OCR it,
never classify it, never read a total off a receipt. This keeps the whole feature to: pick → compress →
upload → row → grid → lightbox → delete.

### The pipeline, end to end

```
<input type="file" accept="image/*" multiple>
        │  (iOS shows: Take Photo / Photo Library / Choose File)
        ▼
  File[] (usually image/jpeg, ~3–5 MB, 4032×3024, EXIF w/ GPS + orientation)
        │
        ▼  browser-image-compression, in a Web Worker
  compressForUpload()  → ≤1600px long edge, ≤~300 KB, JPEG q0.8
        │                 orientation baked into pixels, ALL EXIF stripped (incl. GPS)
        ▼
  upload() from @vercel/blob/client  ──► POST /api/photos/upload (handleUpload)
        │                                  └─ auth() → allowedContentTypes, maximumSizeInBytes,
        │                                     addRandomSuffix, tokenPayload
        │  ← client token
        ├──────────── PUT bytes ───────────► Vercel Blob (browser → blob, never through our function)
        │
        ├─ returns { url, pathname, contentType, … }
        ▼
  mode "attached"  →  attachPhoto({ groupId, blobUrl, blobPathname, w, h, bytes }) → expense_photos row
  mode "staged"    →  StagedPhoto held in F05 client state → createExpense({ …, photos }) → rows
        │
        ▼
  PhotoGallery (3-col square grid, next/image) → Lightbox (swipe, pinch-zoom, counter, delete)
```

---

## 1. Architectural decisions (read before writing code)

### D-A. Client uploads, not server uploads. **Locked.**

`upload()` from `@vercel/blob/client` + a `handleUpload` route handler at `/api/photos/upload`.
The browser PUTs bytes straight to Vercel Blob. Our function only mints a short-lived signed token.

Why not `put()` in a Server Action or route handler:

1. **The 4.5 MB request-body cap.** Vercel Functions reject request bodies above ~4.5 MB. A raw iPhone
   XS Max photo is 2.5–5 MB, and the user picks *several at once*. Even with client compression to 300 KB
   the margin is fine — but the moment compression fails or is skipped (HEIC edge case, a huge PNG
   screenshot, a user on an older Safari where OffscreenCanvas is unavailable), a server upload path dies
   with an opaque 413. The client-upload path has a **5 TB** ceiling and never touches that limit.
2. **Execution time is the scarce resource on Hobby.** Streaming ~300 KB through a function on a
   3G-ish cellular uplink holds that invocation open for the whole upload — seconds of billed
   wall-clock per photo, ×7 photos, for zero computation. The token exchange is ~50 ms.
3. **Bandwidth is paid twice.** Server upload = client→function (ingress) + function→blob (egress).
   Client upload = one hop.
4. **Progress.** `upload()` gives a real `onUploadProgress` from the browser's own XHR. A server-proxied
   upload can only report "sent to our server", which is the wrong number on a slow uplink.

### D-B. The `expense_photos` row is written by the **client-called Server Action**, with `onUploadCompleted` as an idempotent safety net. **Locked.**

Vercel's own docs are explicit: *"When running your application locally, the `onUploadCompleted` callback
will not work as Vercel Blob cannot contact your localhost."* Making the webhook the sole source of truth
means **the entire photo feature is undevelopable and untestable locally** without standing up an ngrok
tunnel for every session. It also means the UI cannot show the new thumbnail until an out-of-band webhook
lands, which is a visible lag on the one interaction that must feel instant.

So:

- **Primary path (works everywhere):** after `upload()` resolves in the browser, call `attachPhoto(...)`.
  It returns the row id synchronously; the tile flips to "done" and the gallery updates.
- **Safety net (production only):** `onUploadCompleted` reads `groupId` out of `tokenPayload` and calls the
  same underlying `upsertPhotoForUser()` helper. This rescues the "bytes landed but the browser died / lost
  signal before `attachPhoto`" case, which would otherwise be a permanent orphan blob.
- **Both paths are idempotent** on `(group_id, blob_pathname)`. Whichever arrives first inserts; the second
  one finds the existing row and, if it carries `width`/`height`/`size_bytes` and the stored row has NULLs,
  fills them in. (`§4.2` already declares those three columns nullable — that nullability is exactly what
  makes the webhook path legal, since the webhook does not know the pixel dimensions.)

This does **not** contradict §4.5. The route handler still exists, still authenticates, still carries a
`clientPayload`, and `onUploadCompleted` still associates the blob. It is simply not the *only* writer.

### D-C. New-group photos: **upload-first, then pass blob refs into `createExpense`.** **Locked.** (Contract delta CD-1 — see **Contract deltas**.)

On `/new` there is no `groupId` yet, and `expense_photos.group_id` is `NOT NULL` with an FK, so **no row can
exist before the group does**. Two candidate designs:

| | Upload-first → `createExpense({ photos })` **(chosen)** | Create-then-attach |
|---|---|---|
| When bytes upload | while the user is still reviewing the parsed table | after they tap "Simpan" |
| Save latency | one round trip | 1 + N round trips, at the worst possible moment |
| Atomicity | group + all photo rows in one transaction | partial gallery if attach #3 of 5 fails, user already on `/e/[id]` |
| Orphan blobs | possible (draft abandoned) | **also** possible (same — bytes are already up), plus rows can be orphaned too |
| Perceived speed | progress bars run while the user edits item names | 7 photos × 300 KB of dead-air on tap-to-save |

Create-then-attach buys nothing: the blobs are uploaded during picking either way, because deferring the
upload to save-time means a 10-second unexplained spinner on cellular. And the "upload only on save"
variant is strictly worse than both. So: **upload during picking, hold `StagedPhoto[]` in F05's client
state, hand it to `createExpense`, which inserts group + items + photos in one transaction.**

Consequence: `createExpense`'s input changes from `photoIds?` to `photos?: NewPhotoInput[]`. `photoIds`
was unimplementable as written (see CD-1 under **Contract deltas**).

### D-D. `next/image` for the thumbnail grid, plain `<img>` in the lightbox. **Locked.**

- **Grid:** each cell renders at ~132 CSS px on a 414 px screen (3 columns). Serving the full 1600 px /
  300 KB source for 12 thumbnails is 3.6 MB on cellular for something displayed at 396 device px.
  `next/image` with `fill` + a `sizes` hint emits ~15–25 KB WebP renditions. That is the exact case
  Image Optimization exists for, and it is a ~10× transfer win on the screen the user opens most.
- **Lightbox:** the source is *already* ≤300 KB and ≤1600 px — precisely the size a full-screen viewer
  wants. Running it through the optimizer adds a transformation, a cold-start, and no meaningful byte
  saving. Point `<img src={blobUrl}>` straight at the blob CDN.
- **Quota sanity:** transformations are keyed on (source, width, quality) and cached ~31 days. One
  grid size + one DPR bucket ⇒ ~1–2 transformations per photo per month. At ~60 photos/month that is
  under ~120 transformations/month against a Hobby allowance in the thousands. Comfortable.
  If it ever isn't, flipping `unoptimized` on one component is a one-line escape hatch (§13.4).
  → **Verify the current Hobby Image Optimization allowance during Task 3** rather than trusting this note.

Requires `images.remotePatterns` in `next.config.ts` for `*.public.blob.vercel-storage.com` (Task 3).

### D-E. Hand-rolled lightbox, zero new dependencies. **Locked.**

`yet-another-react-lightbox` is ~40 KB gz; `photoswipe` ~35 KB gz; both ship desktop chrome, captions,
thumbnail strips, slideshow timers and plugin systems we will never use. What we actually need is:

- horizontal paging → **CSS scroll-snap** (`overflow-x:auto; scroll-snap-type:x mandatory`). Native
  momentum, native rubber-banding, native velocity. Better than any JS gesture library, and ~6 lines.
- pinch-zoom → ~90 lines of two-finger `touchmove` math (Task 18).
- counter, close, `dvh`, safe-area → CSS.

Total: one ~200-line component, 0 KB of dependency. If a future requirement (video, captions, desktop
keyboard nav beyond Escape) shows up, revisit.

### D-F. The blob pathname contains **no user id and no group id**. **Locked.**

Blob URLs are public and permanently guessable-by-nobody, but they *are* pasteable. Putting `userId` in
the path leaks a stable user identifier to anyone the URL is forwarded to, and putting `groupId` in the
path lets a share-page recipient enumerate the relationship between images. Pathname is
`photos/<nanoid(21)>.jpg`, plus Vercel's own random suffix from `addRandomSuffix: true`. Ownership lives
in Postgres only.

### D-G. Deletion order: **DB row first, then `del()`.** **Locked.** (§10)

---

## 2. Reality check: HEIC on an iPhone XS Max

State of the world, precisely — this drives the error copy:

| How the user picks | What the `File` actually is |
|---|---|
| **Take Photo** (camera sheet from the file input) | `image/jpeg`, named `image.jpg`. iOS transcodes on the way into the file input, **even with Camera → Formats → High Efficiency**. HEIC never reaches us. |
| **Photo Library** | `image/jpeg` in essentially all cases. iOS applies the same automatic-transcode behaviour it uses for AirDrop/mail when handing a HEIC asset to a web file input. |
| **Choose File** → Files/iCloud Drive → an `.HEIC` you saved earlier | **A real `image/heic` File.** This is the only realistic way HEIC reaches us. |
| Screenshot (QRIS confirmation) from Photo Library | `image/png`, ~2436×1125. Not HEIC, but big — we transcode it to JPEG, which is the right call for size. |

**If a real HEIC does arrive**, `browser-image-compression` decodes it via canvas:

- **Mobile Safari and macOS Safari can decode HEIC natively**, so the canvas draw succeeds and — because
  we force `fileType: 'image/jpeg'` — a normal JPEG comes out. On the target device, HEIC just works.
- **Chrome / Firefox / Edge cannot.** The draw yields a blank or zero-dimension canvas, and you get either
  a thrown decode error or a suspiciously tiny output file.

Mitigation (Task 6): detect HEIC by MIME **or** filename extension, attempt compression anyway, then
**validate the output** — reject if the encoded file is `< 1024` bytes or if the decoded bitmap has zero
width/height — and show a specific message:

> "Foto HEIC tidak bisa dibaca browser ini. Coba pilih dari Photo Library, atau ubah Settings → Camera →
> Formats → Most Compatible."

We deliberately do **not** add `heic2any` (~600 KB of libheif WASM) to rescue a case that is close to
impossible on the one device this app targets. `image/heic` is also **not** in `allowedContentTypes`,
because we only ever upload JPEG.

---

## 3. File manifest

New files (all created by this feature):

```
next.config.ts                                   (edited — images.remotePatterns)
package.json                                     (edited — deps + scripts)
.gitignore                                       (edited — public/vendor)

lib/photos/constants.ts                          tunables, limits, pathname regexes
lib/photos/types.ts                              StagedPhoto, PhotoDTO, UploadItem
lib/photos/format.ts                             formatBytes
lib/photos/compress.ts                           'use client' — compressForUpload, rejectionReason
lib/photos/pathname.ts                           newPhotoPathname()

lib/blob/delete.ts                               'server-only' — deleteBlobsQuietly, deleteBlobsForGroup
lib/db/photos.ts                                 'server-only' — upsertPhotoForUser, findOwnedPhoto, …

app/api/photos/upload/route.ts                   handleUpload (§4.5)
app/actions/photos.ts                            attachPhoto, deletePhoto, discardStagedPhotos (§4.4)

components/photos/usePhotoUploads.ts             the queue / state machine
components/photos/PhotoPicker.tsx                the picker (F05 + F07 consume this)
components/photos/UploadTile.tsx                 one in-flight tile
components/photos/PhotoGallery.tsx               square grid (F07 + F09 consume this)
components/photos/Lightbox.tsx                   full-screen viewer

scripts/copy-image-compression-worker.mjs        self-host the worker lib
scripts/blob-sweep.ts                            orphan sweep + usage report
public/vendor/browser-image-compression.js       (generated, gitignored)
```

---

## 4. Phase 1 — Dependencies and configuration

### Task 1 — Install the two pinned packages

```bash
cd /home/miftah/expense-tracking
npm i @vercel/blob@2.8.0 browser-image-compression@2.0.2
npm i -D tsx
```

Expected: `added 3 packages`. Verify the exact versions landed:

```bash
node -p "['@vercel/blob','browser-image-compression'].map(p=>p+'@'+require(p+'/package.json').version).join('\n')"
```

Expected output:

```
@vercel/blob@2.8.0
browser-image-compression@2.0.2
```

### Task 2 — Verify the compression library's option names and worker file

`browser-image-compression` renamed `libraryUrl` → **`libURL`** in v2. Confirm against the shipped types
rather than trusting this document:

```bash
grep -nE "libURL|libraryUrl|preserveExif|exifOrientation|alwaysKeepResolution|maxIteration" \
  node_modules/browser-image-compression/dist/browser-image-compression.d.ts
ls -la node_modules/browser-image-compression/dist/
```

Expected: the `.d.ts` `Options` interface lists `libURL?: string`, `preserveExif?: boolean`,
`exifOrientation?: number`, `maxIteration?: number`, `signal?: AbortSignal`, `onProgress?: (p:number)=>void`,
and `dist/` contains `browser-image-compression.js`.

**If the option is `libraryUrl` instead, use that name in `lib/photos/constants.ts` — everything else is
unchanged.** If `dist/browser-image-compression.js` does not exist, note the actual filename; Task 4 needs it.

Why this matters: with `useWebWorker: true` the library spins up a worker that `importScripts()` its own
bundle, and **the default `libURL` is a jsDelivr CDN URL**. That is a third-party runtime dependency on the
hot path, it breaks under a strict `script-src` CSP, and it breaks entirely offline. We self-host it (Task 4).

### Task 3 — `next.config.ts`: allow the Blob hostname for `next/image`

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // Vercel Blob public URLs look like:
        //   https://<storeId>.public.blob.vercel-storage.com/photos/<id>-<suffix>.jpg
        // The single `*` matches exactly one leading label, i.e. the store id.
        hostname: '*.public.blob.vercel-storage.com',
        pathname: '/photos/**',
      },
    ],
  },
}

export default nextConfig
```

Notes:

- `pathname: '/photos/**'` narrows the optimizer to our own prefix, so a compromised page cannot use our
  image endpoint as an open proxy for arbitrary blobs in the store.
- Once the store exists you may pin the literal hostname (e.g. `ce0rcu23vrrdzqap.public.blob.vercel-storage.com`).
  Keep the wildcard for now — it is one store, and pinning is a redeploy every time the store is recreated.
- **Also confirm here** what the current Vercel Hobby allowance for Image Optimization transformations is
  (dashboard → Usage). Record the number in a comment. If it is uncomfortably low, apply §13.4.

### Task 4 — Self-host the compression worker bundle

`scripts/copy-image-compression-worker.mjs`:

```js
// Copies browser-image-compression's UMD bundle into public/vendor so the Web Worker can
// importScripts() it from our own origin instead of the default jsDelivr CDN.
// Runs automatically via predev/prebuild.
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const src = require.resolve('browser-image-compression/dist/browser-image-compression.js')
const destDir = path.resolve('public/vendor')
const dest = path.join(destDir, 'browser-image-compression.js')

await mkdir(destDir, { recursive: true })
await copyFile(src, dest)
console.log(`[photos] ${path.relative(process.cwd(), src)} -> public/vendor/browser-image-compression.js`)
```

`package.json` — add:

```json
{
  "scripts": {
    "predev": "node scripts/copy-image-compression-worker.mjs",
    "prebuild": "node scripts/copy-image-compression-worker.mjs",
    "blob:usage": "node --env-file=.env.local --import tsx scripts/blob-sweep.ts",
    "blob:sweep": "node --env-file=.env.local --import tsx scripts/blob-sweep.ts --delete"
  }
}
```

`.gitignore` — add:

```
/public/vendor/
```

Run it once and check:

```bash
node scripts/copy-image-compression-worker.mjs && ls -la public/vendor/
```

Expected: a `browser-image-compression.js` around 100–200 KB.

### Task 5 — Blob store + env

1. Vercel dashboard → project → **Storage** → **Create Database** → **Blob**.
2. Access: **Public**. (Private storage would require signed URLs on every render and would break
   `/s/[token]`, which is an unauthenticated server component. Roadmap D4 already accepts
   "unguessable URL" as the sharing security model.)
3. Name it `photos`. Include **Development** in the connected environments, otherwise `vercel env pull`
   will not write the token to `.env.local`.
4. `vercel env pull` → confirm `BLOB_READ_WRITE_TOKEN` is present in `.env.local`.
5. F01's `lib/env.ts` must already validate `BLOB_READ_WRITE_TOKEN` (§4.8). Confirm the Zod schema has it
   as a required string; if not, add `BLOB_READ_WRITE_TOKEN: z.string().min(1)` to the **server** section.

`handleUpload()` specifically requires the long-lived static `BLOB_READ_WRITE_TOKEN` — an OIDC token is
not sufficient for minting client tokens. Do not delete it in favour of OIDC.

> ✅ **git checkpoint**
> ```bash
> git add -A && git commit -m "F06: add @vercel/blob + browser-image-compression, blob store config, self-hosted worker"
> ```

---

## 5. Phase 2 — Shared constants and types

### Task 6 — `lib/photos/constants.ts`

```ts
// lib/photos/constants.ts
// Tunables for the photo pipeline. Everything the compression + upload path
// argues about lives here so the storage-budget knobs are in one file.

/** Hard cap per expense group. Ten photos is already a lot for one meal. */
export const MAX_PHOTOS_PER_GROUP = 10

/** Reject before we even try to decode: a 25 MB "image" is a mistake, not a photo. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/**
 * Server-side ceiling for the compressed upload. Our target is ~300 KB but
 * browser-image-compression is best-effort: a dense screenshot may bottom out
 * above the target after maxIteration passes. 1.5 MB gives headroom while still
 * making a bypass attempt (uploading a raw 5 MB photo) fail loudly.
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

/** Path to the self-hosted worker bundle (see scripts/copy-image-compression-worker.mjs). */
export const COMPRESSION_LIB_URL = '/vendor/browser-image-compression.js'

/** Two concurrent uploads: enough to hide latency, few enough not to thrash cellular. */
export const UPLOAD_CONCURRENCY = 2

/** Blobs are immutable (random pathname), so cache them for a year. */
export const BLOB_CACHE_MAX_AGE = 60 * 60 * 24 * 365

/** Client tokens are single-use-ish and short-lived. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000

export const PHOTO_PREFIX = 'photos/'

/**
 * What the client is allowed to ASK for. Validated in onBeforeGenerateToken so a
 * hostile client cannot write outside photos/ or pick a colliding name.
 * nanoid(21) => ~125 bits of entropy.
 */
export const PHOTO_REQUEST_PATHNAME_RE = /^photos\/[A-Za-z0-9_-]{21}\.jpg$/

/**
 * What Vercel actually STORES, because addRandomSuffix:true appends "-<random>".
 * Used to validate pathnames coming back from the client in discardStagedPhotos().
 */
export const PHOTO_STORED_PATHNAME_RE = /^photos\/[A-Za-z0-9_-]{21}-[A-Za-z0-9]+\.jpg$/

/** Staged blobs older than this with no DB row are considered abandoned. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000

/** Free-tier storage ceiling, for the usage report. Vercel reports decimal GB. */
export const BLOB_FREE_TIER_BYTES = 1_000_000_000
```

### Task 7 — `lib/photos/types.ts`

```ts
// lib/photos/types.ts

/**
 * A blob that exists in storage but may not yet have an expense_photos row.
 * This is the currency of the /new flow: F05 holds StagedPhoto[] in client
 * state and hands it to createExpense.
 */
export type StagedPhoto = {
  blobUrl: string
  blobPathname: string
  width: number
  height: number
  sizeBytes: number
}

/** Alias used in the createExpense signature so the intent reads clearly. */
export type NewPhotoInput = StagedPhoto

/** A persisted photo, as returned by F03's getGroupDetail / getGroupByShareToken. */
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
  | 'queued'       // accepted, waiting for a concurrency slot
  | 'compressing'  // in the worker
  | 'uploading'    // bytes going to Vercel Blob
  | 'attaching'    // attached mode only: writing the DB row
  | 'done'
  | 'error'
  | 'canceled'

/** One tile in the picker. `file` is retained so retry does not need a re-pick. */
export type UploadItem = {
  key: string
  file: File
  previewUrl: string        // object URL of the ORIGINAL, for instant thumbnails
  status: UploadStatus
  progress: number          // 0..100, overall (compression + upload)
  originalBytes: number
  compressedBytes: number | null
  error: string | null
  result: StagedPhoto | null
}
```

### Task 8 — `lib/photos/format.ts` and `lib/photos/pathname.ts`

```ts
// lib/photos/format.ts

/** "4,2 MB" / "287 KB" — id-ID uses a comma as the decimal separator. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb.toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
}

/** "4,2 MB → 287 KB (93% lebih kecil)" */
export function formatSavings(originalBytes: number, compressedBytes: number): string {
  const pct = Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 100))
  return `${formatBytes(originalBytes)} → ${formatBytes(compressedBytes)} (${pct}% lebih kecil)`
}
```

```ts
// lib/photos/pathname.ts
import { nanoid } from 'nanoid'
import { PHOTO_PREFIX } from './constants'

/**
 * The pathname the CLIENT requests. Deliberately carries no userId and no groupId
 * (decision D-F): blob URLs are public and pasteable, and we do not want a
 * forwarded URL to leak a stable user identifier.
 *
 * Vercel appends its own random suffix (addRandomSuffix: true), so ALWAYS persist
 * the `pathname` returned by upload(), never the one you passed in.
 */
export function newPhotoPathname(): string {
  return `${PHOTO_PREFIX}${nanoid(21)}.jpg`
}
```

> ✅ **git checkpoint**
> ```bash
> npx tsc --noEmit && git add -A && git commit -m "F06: photo constants, types, formatters, pathname helper"
> ```
> Expected: `tsc` exits 0 with no output.

---

## 6. Phase 3 — Client-side compression

### Task 9 — `lib/photos/compress.ts`

```tsx
// lib/photos/compress.ts
'use client'

import imageCompression from 'browser-image-compression'
import {
  COMPRESSION_LIB_URL,
  COMPRESSION_MAX_ITERATION,
  MAX_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  TARGET_MAX_EDGE,
  TARGET_MAX_MB,
  TARGET_QUALITY,
  UPLOAD_CONTENT_TYPE,
} from './constants'
import { formatBytes } from './format'

export type CompressedImage = {
  file: File
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

const HEIC_RE = /^image\/(heic|heif)$|\.(heic|heif)$/i

const HEIC_MESSAGE =
  'Foto HEIC tidak bisa dibaca browser ini. Coba pilih dari Photo Library, ' +
  'atau ubah Settings → Camera → Formats → Most Compatible.'

/** Cheap pre-flight. Returns a human message if the file should never be queued. */
export function rejectionReason(file: File): string | null {
  const looksLikeImage = file.type.startsWith('image/') || HEIC_RE.test(file.name)
  if (!looksLikeImage) {
    return `"${file.name}" bukan file gambar.`
  }
  if (file.size === 0) {
    return `"${file.name}" kosong.`
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return `Terlalu besar (${formatBytes(file.size)}). Maksimum ${formatBytes(MAX_SOURCE_BYTES)}.`
  }
  return null
}

/**
 * Compress one picked file to something we are happy to store forever.
 *
 * Contract:
 *  - long edge <= TARGET_MAX_EDGE (1600)
 *  - size ~<= TARGET_MAX_MB (0.3 MB), best effort
 *  - always image/jpeg, quality starts at TARGET_QUALITY (0.8)
 *  - EXIF orientation baked into the pixels (a portrait photo stays portrait)
 *  - ALL EXIF removed, including GPS  <-- privacy, see §12
 *  - runs in a Web Worker so a 12 MP decode does not jank the review screen
 */
export async function compressForUpload(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<CompressedImage> {
  const isHeic = HEIC_RE.test(file.type) || HEIC_RE.test(file.name)

  let out: File
  try {
    out = await imageCompression(file, {
      maxSizeMB: TARGET_MAX_MB,
      maxWidthOrHeight: TARGET_MAX_EDGE,
      initialQuality: TARGET_QUALITY,
      maxIteration: COMPRESSION_MAX_ITERATION,
      fileType: UPLOAD_CONTENT_TYPE,

      // Off the main thread. Requires OffscreenCanvas; Safari has had it since
      // 16.4, and an XS Max runs iOS 18. If the browser lacks it the library
      // transparently falls back to the main thread — degraded, not broken.
      useWebWorker: true,
      // Self-hosted (Task 4). The library's default here is a jsDelivr CDN URL.
      libURL: COMPRESSION_LIB_URL,

      // *** THE PRIVACY LINE ***
      // false is the library default, but it is stated explicitly because these
      // photos are rendered on a public /s/[token] page. false => the output is
      // re-encoded from a canvas with no EXIF block at all: no GPSLatitude,
      // no GPSLongitude, no DateTimeOriginal, no device serial.
      preserveExif: false,

      // NOTE: exifOrientation is intentionally NOT passed. The library reads the
      // source orientation itself and bakes the rotation into the canvas. If QA
      // step 4 (Manual QA) finds a portrait photo arriving sideways, apply the patch in
      // §6 "If orientation is wrong" — do NOT pass it speculatively, because
      // passing it when the library already rotated causes a DOUBLE rotation.

      signal: opts.signal,
      onProgress: opts.onProgress,
    })
  } catch (err) {
    if (opts.signal?.aborted) throw err // cancellation, let the caller see it
    throw new Error(isHeic ? HEIC_MESSAGE : 'Gagal memproses gambar ini.')
  }

  // A browser that cannot decode the source (HEIC on Chrome) produces a blank or
  // near-empty canvas rather than throwing. Catch that here.
  if (out.size < 1024) {
    throw new Error(isHeic ? HEIC_MESSAGE : 'Gambar tidak bisa dibaca di browser ini.')
  }

  const { width, height } = await readDimensions(out)
  if (!width || !height) {
    throw new Error(isHeic ? HEIC_MESSAGE : 'Gambar tidak bisa dibaca di browser ini.')
  }

  if (out.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Masih ${formatBytes(out.size)} setelah dikompres — terlalu besar untuk diunggah.`,
    )
  }

  return {
    file: out,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: out.size,
  }
}

/** Decode the compressed output once to record its real pixel dimensions. */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return { width: 0, height: 0 }
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

**Progress mapping.** `onProgress` from the library reports 0→100 for the *compression* stage only. The
tile maps it into the first 30% of the bar and the upload's `onUploadProgress.percentage` into the
remaining 70% (§8). Compression of a 12 MP photo takes ~0.6–1.5 s on an XS Max; the upload of 300 KB on
LTE takes ~1–3 s. 30/70 is roughly honest.

**If orientation is wrong** (QA step 4 fails — a portrait photo appears rotated 90°), apply this patch and
re-test. Try (a) first; only try (b) if (a) makes it worse:

```ts
// (a) tell the library the source orientation explicitly
const exifOrientation = await imageCompression.getExifOrientation(file)
out = await imageCompression(file, { /* …as above… */, exifOrientation })

// (b) if (a) double-rotates, the worker path is the culprit; force main thread
out = await imageCompression(file, { /* …as above… */, useWebWorker: false })
```

Test fixture for orientation, if you want a deterministic case rather than a real photo:

```bash
curl -sLo /tmp/Portrait_6.jpg \
  https://raw.githubusercontent.com/recurser/exif-orientation-examples/master/Portrait_6.jpg
# EXIF Orientation = 6 (rotate 90° CW). After compressForUpload the OUTPUT must be
# taller than it is wide, with no EXIF orientation tag at all.
```

> ✅ **git checkpoint**
> ```bash
> npx tsc --noEmit && git add -A && git commit -m "F06: client-side compression (1600px / 300KB / q0.8, EXIF stripped, web worker)"
> ```

---

## 7. Phase 4 — Server: route handler, DB helpers, Server Actions

### Task 10 — `lib/db/photos.ts` (server-only data helpers)

Everything here enforces the §4.4 invariant: **every query is filtered by `userId`**, and photo queries
join back to `expense_groups.user_id` because `expense_photos` has no `user_id` of its own.

```ts
// lib/db/photos.ts
import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { expenseGroups, expensePhotos } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** Throws unless `groupId` exists AND belongs to `userId`. */
export async function assertGroupOwned(userId: string, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: expenseGroups.id })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)
  if (!row) throw new NotFoundError('Expense group not found')
}

export type UpsertPhotoInput = {
  userId: string
  groupId: string
  blobUrl: string
  blobPathname: string
  width?: number | null
  height?: number | null
  sizeBytes?: number | null
}

/**
 * Idempotent on (group_id, blob_pathname).
 *
 * Two writers race here by design (decision D-B): the browser calls attachPhoto()
 * as soon as upload() resolves, and — in production only — Vercel's
 * onUploadCompleted webhook calls this too. Whichever lands first inserts. The
 * second one backfills width/height/size_bytes if the stored row has NULLs,
 * because the webhook does not know the pixel dimensions.
 */
export async function upsertPhotoForUser(
  input: UpsertPhotoInput,
): Promise<{ id: string; created: boolean }> {
  await assertGroupOwned(input.userId, input.groupId)

  const [existing] = await db
    .select({
      id: expensePhotos.id,
      width: expensePhotos.width,
      height: expensePhotos.height,
      sizeBytes: expensePhotos.sizeBytes,
    })
    .from(expensePhotos)
    .where(
      and(
        eq(expensePhotos.groupId, input.groupId),
        eq(expensePhotos.blobPathname, input.blobPathname),
      ),
    )
    .limit(1)

  if (existing) {
    const patch: Record<string, number> = {}
    if (existing.width == null && input.width != null) patch.width = input.width
    if (existing.height == null && input.height != null) patch.height = input.height
    if (existing.sizeBytes == null && input.sizeBytes != null) patch.sizeBytes = input.sizeBytes
    if (Object.keys(patch).length > 0) {
      await db.update(expensePhotos).set(patch).where(eq(expensePhotos.id, existing.id))
    }
    return { id: existing.id, created: false }
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${expensePhotos.sortOrder}), -1) + 1` })
    .from(expensePhotos)
    .where(eq(expensePhotos.groupId, input.groupId))

  const id = newId()
  await db.insert(expensePhotos).values({
    id,
    groupId: input.groupId,
    blobUrl: input.blobUrl,
    blobPathname: input.blobPathname,
    width: input.width ?? null,
    height: input.height ?? null,
    sizeBytes: input.sizeBytes ?? null,
    sortOrder: next,
  })

  return { id, created: true }
}

/** Single query, ownership enforced through the join. */
export async function findOwnedPhoto(
  userId: string,
  photoId: string,
): Promise<{ id: string; groupId: string; blobPathname: string } | null> {
  const [row] = await db
    .select({
      id: expensePhotos.id,
      groupId: expensePhotos.groupId,
      blobPathname: expensePhotos.blobPathname,
    })
    .from(expensePhotos)
    .innerJoin(expenseGroups, eq(expensePhotos.groupId, expenseGroups.id))
    .where(and(eq(expensePhotos.id, photoId), eq(expenseGroups.userId, userId)))
    .limit(1)
  return row ?? null
}

/** Pathnames of every photo in a group the user owns. Used by deleteExpense. */
export async function listOwnedGroupPathnames(
  userId: string,
  groupId: string,
): Promise<string[]> {
  const rows = await db
    .select({ pathname: expensePhotos.blobPathname })
    .from(expensePhotos)
    .innerJoin(expenseGroups, eq(expensePhotos.groupId, expenseGroups.id))
    .where(and(eq(expensePhotos.groupId, groupId), eq(expenseGroups.userId, userId)))
  return rows.map((r) => r.pathname)
}

/** True if ANY row (any user) references this pathname. Guards discardStagedPhotos. */
export async function pathnamesInUse(pathnames: string[]): Promise<Set<string>> {
  if (pathnames.length === 0) return new Set()
  const rows = await db
    .select({ pathname: expensePhotos.blobPathname })
    .from(expensePhotos)
    .where(sql`${expensePhotos.blobPathname} = ANY(${pathnames})`)
  return new Set(rows.map((r) => r.pathname))
}
```

### Task 11 — `lib/blob/delete.ts`

```ts
// lib/blob/delete.ts
import 'server-only'
import { del } from '@vercel/blob'

/**
 * Best-effort blob deletion. NEVER throws.
 *
 * Rationale: a failed del() leaves an orphan blob, which costs ~300 KB and is
 * swept later (scripts/blob-sweep.ts). A thrown del() would abort a Server Action
 * that has ALREADY removed the DB row, leaving the user staring at a failure for
 * an operation that visibly succeeded. Storage leakage is cheap; a lying UI is not.
 */
export async function deleteBlobsQuietly(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return
  // del() accepts an array; chunk to stay well inside request limits.
  for (let i = 0; i < pathnames.length; i += 100) {
    const chunk = pathnames.slice(i, i + 100)
    try {
      await del(chunk)
    } catch (error) {
      console.error('[blob] delete failed, leaving orphan(s) for the sweeper', {
        pathnames: chunk,
        error,
      })
    }
  }
}
```

> ⚠️ **Cross-feature requirement.** `expense_photos` rows cascade-delete with the group (§4.2 FK
> `ON DELETE CASCADE`), but **blobs do not cascade**. F07's `deleteExpense(id)` MUST, before deleting the
> group, do:
> ```ts
> const pathnames = await listOwnedGroupPathnames(userId, id)
> // …delete the group…
> await deleteBlobsQuietly(pathnames)
> ```
> Without this, deleting a group silently leaks every one of its photos into the 1 GB budget forever.
> Listed again as CD-4 under **Contract deltas**.

### Task 12 — `app/api/photos/upload/route.ts`

```ts
// app/api/photos/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { upsertPhotoForUser } from '@/lib/db/photos'
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  BLOB_CACHE_MAX_AGE,
  MAX_UPLOAD_BYTES,
  PHOTO_REQUEST_PATHNAME_RE,
  UPLOAD_TOKEN_TTL_MS,
} from '@/lib/photos/constants'
import { assertGroupOwned } from '@/lib/db/photos'

export const runtime = 'nodejs'

/** What the browser is allowed to tell us. Validated, never trusted. */
const ClientPayload = z.object({
  groupId: z.string().min(1).max(24).nullish(),
})

/** Mirrored into the signed token; comes back to us on the webhook. */
const TokenPayload = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      // ── Step 1: mint a short-lived client token ────────────────────────────
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // AUTH. Without this the route is an open upload endpoint for the internet.
        const session = await auth()
        const userId = session?.user?.id
        if (!userId) throw new Error('Not authenticated')

        // The client picks its own pathname, so constrain it hard: our prefix,
        // our id alphabet, our extension. Stops path traversal and stops a
        // hostile client writing over / near anything else in the store.
        if (!PHOTO_REQUEST_PATHNAME_RE.test(pathname)) {
          throw new Error('Invalid pathname')
        }

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        // If the upload is destined for an existing group, prove ownership NOW,
        // so that onUploadCompleted can attach without re-authorising later.
        if (payload.groupId) {
          await assertGroupOwned(userId, payload.groupId)
        }

        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES], // image/jpeg only
          maximumSizeInBytes: MAX_UPLOAD_BYTES,                    // 1.5 MB
          addRandomSuffix: true,   // collision-proof; changes the stored pathname
          allowOverwrite: false,   // never clobber an existing blob
          cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({
            userId,
            groupId: payload.groupId ?? null,
          }),
        }
      },

      // ── Step 2: Vercel calls us back once the bytes have landed ────────────
      // NOTE: this NEVER fires against localhost. It is a production-only safety
      // net (decision D-B), not the primary writer. The browser's attachPhoto()
      // call is the primary writer and works everywhere.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = TokenPayload.safeParse(JSON.parse(tokenPayload || '{}'))
        if (!parsed.success) {
          console.error('[photos] bad tokenPayload on upload completion', tokenPayload)
          return
        }
        const { userId, groupId } = parsed.data

        // No groupId => this is a /new draft (staged). There is no group to attach
        // to yet; F05 will persist it through createExpense. Nothing to do.
        if (!groupId) return

        try {
          const { created } = await upsertPhotoForUser({
            userId,
            groupId,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            // The webhook has no pixel data. attachPhoto() backfills these, or
            // they stay NULL — §4.2 declares all three nullable.
            width: null,
            height: null,
            sizeBytes: null,
          })
          console.log('[photos] webhook attach', { groupId, pathname: blob.pathname, created })
        } catch (error) {
          // Returning non-200 makes Vercel retry up to 5 times, which is right
          // for a transient DB blip and harmless for a permanent failure because
          // upsertPhotoForUser is idempotent.
          console.error('[photos] webhook attach failed', error)
          throw error
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }, // Vercel retries the webhook 5× while it is not 200
    )
  }
}
```

**Local development note.** `onUploadCompleted` cannot reach `localhost`. Two options:

- Do nothing. The primary `attachPhoto()` path covers 100% of normal local usage. You just never exercise
  the safety net locally. This is the default.
- To exercise it: `ngrok http 3000`, then add `VERCEL_BLOB_CALLBACK_URL=https://<id>.ngrok-free.app` to
  `.env.local` and restart. Do this once, during Manual QA step 9, not every day.

### Task 13 — `app/actions/photos.ts`

```ts
// app/actions/photos.ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { expensePhotos } from '@/lib/db/schema'
import { deleteBlobsQuietly } from '@/lib/blob/delete'
import {
  findOwnedPhoto,
  pathnamesInUse,
  upsertPhotoForUser,
} from '@/lib/db/photos'
import { PHOTO_STORED_PATHNAME_RE } from '@/lib/photos/constants'

const AttachPhotoInput = z.object({
  groupId: z.string().min(1).max(24),
  blobUrl: z.string().url().max(512),
  blobPathname: z.string().regex(PHOTO_STORED_PATHNAME_RE),
  width: z.number().int().positive().max(20000).nullish(),
  height: z.number().int().positive().max(20000).nullish(),
  sizeBytes: z.number().int().positive().max(50_000_000).nullish(),
})
export type AttachPhotoInput = z.infer<typeof AttachPhotoInput>

/**
 * §4.4 — attachPhoto({ groupId, blobUrl, blobPathname, width, height, sizeBytes }) → { id }
 *
 * Idempotent on (groupId, blobPathname): calling it twice for the same blob
 * returns the same id and never creates a duplicate row. See decision D-B.
 */
export async function attachPhoto(raw: AttachPhotoInput): Promise<{ id: string }> {
  const userId = await requireUserId()
  const input = AttachPhotoInput.parse(raw)

  const { id } = await upsertPhotoForUser({ userId, ...input })

  revalidatePath(`/e/${input.groupId}`)
  return { id }
}

/**
 * §4.4 — deletePhoto(id) → void. Also del()s the blob.
 *
 * ORDER: DB row first, blob second. See §10 for why.
 */
export async function deletePhoto(id: string): Promise<void> {
  const userId = await requireUserId()

  const photo = await findOwnedPhoto(userId, id)
  if (!photo) {
    // Either it never existed or it is someone else's. Same answer either way —
    // never leak the difference.
    throw new Error('Foto tidak ditemukan')
  }

  // 1. Remove the row. This is what the user can see; if it fails, nothing changed.
  await db.delete(expensePhotos).where(eq(expensePhotos.id, photo.id))

  // 2. Remove the bytes. Best effort — an orphan is swept later, and a thrown
  //    error here would report failure for an operation that already succeeded.
  await deleteBlobsQuietly([photo.blobPathname])

  revalidatePath(`/e/${photo.groupId}`)
}

const Pathnames = z.array(z.string().regex(PHOTO_STORED_PATHNAME_RE)).max(50)

/**
 * NOT in §4.4 — additive export, declared as CD-2 under **Contract deltas**.
 *
 * Deletes STAGED blobs: bytes that are in the store but have no expense_photos
 * row. Used when the user removes a tile on /new, or discards the whole draft.
 *
 * SECURITY: an authenticated user could pass any pathname, so we refuse to delete
 * anything that IS referenced by a row (anyone's row). The only blobs reachable
 * are unreferenced ones, i.e. someone's in-flight draft — and pathnames carry
 * ~125 bits of entropy plus Vercel's random suffix, so they cannot be guessed.
 */
export async function discardStagedPhotos(pathnames: string[]): Promise<void> {
  await requireUserId()
  const parsed = Pathnames.parse(pathnames)
  if (parsed.length === 0) return

  const inUse = await pathnamesInUse(parsed)
  const safe = parsed.filter((p) => !inUse.has(p))
  if (safe.length !== parsed.length) {
    console.warn('[photos] refused to discard referenced pathnames', {
      requested: parsed.length,
      skipped: parsed.length - safe.length,
    })
  }

  await deleteBlobsQuietly(safe)
}
```

> ✅ **git checkpoint**
> ```bash
> npx tsc --noEmit && git add -A && git commit -m "F06: /api/photos/upload handleUpload route + attachPhoto/deletePhoto/discardStagedPhotos actions"
> ```

---

## 8. Phase 5 — The picker: queue, progress, cancel, retry

### Task 14 — `components/photos/usePhotoUploads.ts`

The whole client-side pipeline lives here so `PhotoPicker` stays presentational.

```tsx
// components/photos/usePhotoUploads.ts
'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { attachPhoto } from '@/app/actions/photos'
import { compressForUpload, rejectionReason } from '@/lib/photos/compress'
import { newPhotoPathname } from '@/lib/photos/pathname'
import { UPLOAD_CONCURRENCY, UPLOAD_CONTENT_TYPE } from '@/lib/photos/constants'
import type { StagedPhoto, UploadItem } from '@/lib/photos/types'

type Mode =
  /** /new — no group exists yet. Blobs are uploaded, rows come later via createExpense. */
  | { kind: 'staged' }
  /** /e/[id] — attach immediately. */
  | { kind: 'attached'; groupId: string }

type Options = {
  mode: Mode
  /** How many more files may be accepted right now. */
  remaining: number
  /** Fires once per successfully uploaded (and, in attached mode, persisted) file. */
  onCommitted?: (photo: StagedPhoto) => void
  /** Fires when files are rejected before queueing (wrong type / too big / over the cap). */
  onRejected?: (messages: string[]) => void
}

/** Minimal counting semaphore — keeps `UPLOAD_CONCURRENCY` files in flight. */
function createSemaphore(limit: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return {
    async acquire() {
      if (active < limit) {
        active += 1
        return
      }
      await new Promise<void>((resolve) => waiting.push(resolve))
      active += 1
    },
    release() {
      active -= 1
      waiting.shift()?.()
    },
  }
}

export function usePhotoUploads({ mode, remaining, onCommitted, onRejected }: Options) {
  const [items, setItems] = useState<UploadItem[]>([])

  const semaphore = useRef(createSemaphore(UPLOAD_CONCURRENCY))
  const controllers = useRef(new Map<string, AbortController>())
  const previewUrls = useRef(new Set<string>())

  // Callbacks are read through refs so the async pipeline never captures a stale one.
  const modeRef = useRef(mode)
  const onCommittedRef = useRef(onCommitted)
  const onRejectedRef = useRef(onRejected)
  useEffect(() => {
    modeRef.current = mode
    onCommittedRef.current = onCommitted
    onRejectedRef.current = onRejected
  })

  // Object URLs are a real leak on a phone. Revoke every one on unmount.
  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)))
  }, [])

  const run = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController()
      controllers.current.set(item.key, controller)
      const { signal } = controller

      await semaphore.current.acquire()
      let uploadedPathname: string | null = null

      try {
        if (signal.aborted) {
          patch(item.key, { status: 'canceled' })
          return
        }

        // ── compress: 0 → 30% of the bar ───────────────────────────────────
        patch(item.key, { status: 'compressing', progress: 0, error: null })
        const compressed = await compressForUpload(item.file, {
          signal,
          onProgress: (p) => patch(item.key, { progress: Math.round(p * 0.3) }),
        })
        if (signal.aborted) {
          patch(item.key, { status: 'canceled' })
          return
        }

        // ── upload: 30 → 100% of the bar ───────────────────────────────────
        patch(item.key, {
          status: 'uploading',
          progress: 30,
          compressedBytes: compressed.compressedBytes,
        })

        const current = modeRef.current
        const blob = await upload(newPhotoPathname(), compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/photos/upload',
          contentType: UPLOAD_CONTENT_TYPE,
          clientPayload: JSON.stringify({
            groupId: current.kind === 'attached' ? current.groupId : null,
          }),
          abortSignal: signal,
          onUploadProgress: ({ percentage }) =>
            patch(item.key, { progress: 30 + Math.round(percentage * 0.7) }),
        })
        // ALWAYS use blob.pathname, never the one we asked for: addRandomSuffix
        // means Vercel rewrote it.
        uploadedPathname = blob.pathname

        const staged: StagedPhoto = {
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          width: compressed.width,
          height: compressed.height,
          sizeBytes: compressed.compressedBytes,
        }

        // ── attach (existing group only) ───────────────────────────────────
        if (current.kind === 'attached') {
          patch(item.key, { status: 'attaching', progress: 100 })
          await attachPhoto({ groupId: current.groupId, ...staged })
        }

        patch(item.key, { status: 'done', progress: 100, result: staged, error: null })
        onCommittedRef.current?.(staged)
      } catch (error) {
        if (signal.aborted) {
          patch(item.key, { status: 'canceled' })
          // Tiny race: the PUT may have completed in the instant before the abort
          // landed. Anything stranded here is unreferenced and gets swept (§11).
        } else {
          patch(item.key, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Gagal mengunggah.',
          })
          if (uploadedPathname) {
            // Bytes are up but the row failed. In production the
            // onUploadCompleted webhook has probably already attached it; the
            // retry below is idempotent either way.
            console.warn('[photos] uploaded but not attached', uploadedPathname)
          }
        }
      } finally {
        semaphore.current.release()
        controllers.current.delete(item.key)
      }
    },
    [patch],
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      const rejected: string[] = []
      const accepted: UploadItem[] = []

      let budget = remaining
      for (const file of list) {
        if (budget <= 0) {
          rejected.push(`"${file.name}" dilewati — sudah mencapai batas foto.`)
          continue
        }
        const reason = rejectionReason(file)
        if (reason) {
          rejected.push(reason)
          continue
        }
        const previewUrl = URL.createObjectURL(file)
        previewUrls.current.add(previewUrl)
        accepted.push({
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          file,
          previewUrl,
          status: 'queued',
          progress: 0,
          originalBytes: file.size,
          compressedBytes: null,
          error: null,
          result: null,
        })
        budget -= 1
      }

      if (rejected.length > 0) onRejectedRef.current?.(rejected)
      if (accepted.length === 0) return

      setItems((prev) => [...prev, ...accepted])
      accepted.forEach((item) => void run(item))
    },
    [remaining, run],
  )

  const cancel = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
  }, [])

  const retry = useCallback(
    (key: string) => {
      setItems((prev) => {
        const target = prev.find((it) => it.key === key)
        if (target) {
          // Retry re-runs ONLY this file. Everything already 'done' is untouched.
          void run({ ...target, status: 'queued', progress: 0, error: null })
        }
        return prev.map((it) =>
          it.key === key ? { ...it, status: 'queued', progress: 0, error: null } : it,
        )
      })
    },
    [run],
  )

  /** Drop a tile from the list (already-finished or failed). Does NOT delete blobs. */
  const dismiss = useCallback((key: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.key === key)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
        previewUrls.current.delete(target.previewUrl)
      }
      return prev.filter((it) => it.key !== key)
    })
    controllers.current.get(key)?.abort()
  }, [])

  const isBusy = items.some((it) =>
    ['queued', 'compressing', 'uploading', 'attaching'].includes(it.status),
  )

  return { items, addFiles, cancel, retry, dismiss, isBusy }
}
```

### Task 15 — `components/photos/UploadTile.tsx`

```tsx
// components/photos/UploadTile.tsx
'use client'

import { formatBytes, formatSavings } from '@/lib/photos/format'
import type { UploadItem } from '@/lib/photos/types'

const LABEL: Record<UploadItem['status'], string> = {
  queued: 'Menunggu…',
  compressing: 'Mengecilkan…',
  uploading: 'Mengunggah…',
  attaching: 'Menyimpan…',
  done: 'Selesai',
  error: 'Gagal',
  canceled: 'Dibatalkan',
}

export function UploadTile({
  item,
  onCancel,
  onRetry,
  onDismiss,
}: {
  item: UploadItem
  onCancel: (key: string) => void
  onRetry: (key: string) => void
  onDismiss: (key: string) => void
}) {
  const inFlight =
    item.status === 'queued' ||
    item.status === 'compressing' ||
    item.status === 'uploading' ||
    item.status === 'attaching'

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-black/5">
      {/* Preview the ORIGINAL immediately — no waiting for compression. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt=""
        className={`h-full w-full object-cover ${item.status === 'done' ? '' : 'opacity-60'}`}
      />

      {inFlight && (
        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-black/55 p-1.5 text-[10px] text-white">
          <div className="h-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-200 ease-out"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="truncate">{LABEL[item.status]}</span>
            <button
              type="button"
              onClick={() => onCancel(item.key)}
              className="shrink-0 underline underline-offset-2"
              aria-label="Batalkan unggahan"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {item.status === 'done' && item.compressedBytes != null && (
        <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-[10px] text-white">
          {formatSavings(item.originalBytes, item.compressedBytes)}
        </div>
      )}

      {(item.status === 'error' || item.status === 'canceled') && (
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-black/70 p-2 text-[11px] text-white">
          <p className="line-clamp-3 leading-snug">
            {item.error ?? 'Dibatalkan.'}
            {item.status === 'error' && ` (${formatBytes(item.originalBytes)})`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onRetry(item.key)} className="underline">
              Coba lagi
            </button>
            <button type="button" onClick={() => onDismiss(item.key)} className="underline">
              Hapus
            </button>
          </div>
        </div>
      )}

      {item.status === 'done' && (
        <button
          type="button"
          onClick={() => onDismiss(item.key)}
          aria-label="Sembunyikan"
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white"
        >
          ✓
        </button>
      )}
    </div>
  )
}
```

**Retry semantics, explicitly:** `retry(key)` re-runs the pipeline for that one file only, starting from
compression, reusing the retained `File`. Files already in `done` are never re-uploaded, never re-compressed,
and their blobs are untouched. In `attached` mode a retry that re-uploads produces a *new* blob (new random
pathname) — the previous stranded one is unreferenced and gets swept.

### Task 16 — `components/photos/PhotoPicker.tsx`

```tsx
// components/photos/PhotoPicker.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { discardStagedPhotos } from '@/app/actions/photos'
import { MAX_PHOTOS_PER_GROUP } from '@/lib/photos/constants'
import type { StagedPhoto } from '@/lib/photos/types'
import { UploadTile } from './UploadTile'
import { usePhotoUploads } from './usePhotoUploads'

export type PhotoPickerProps =
  | {
      /**
       * /new — no group exists yet. Controlled: F05 owns `value`, persists it
       * into its localStorage draft, and hands it to createExpense({ photos }).
       */
      mode: 'staged'
      value: StagedPhoto[]
      onChange: (next: StagedPhoto[]) => void
      max?: number
      disabled?: boolean
      className?: string
    }
  | {
      /**
       * /e/[id] — uploads attach immediately via attachPhoto, then router.refresh()
       * so the server-rendered gallery picks them up.
       */
      mode: 'attached'
      groupId: string
      /** How many photos the group already has, for the cap. */
      existingCount: number
      max?: number
      disabled?: boolean
      className?: string
    }

export function PhotoPicker(props: PhotoPickerProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [notices, setNotices] = useState<string[]>([])

  const max = props.max ?? MAX_PHOTOS_PER_GROUP
  const committedCount = props.mode === 'staged' ? props.value.length : props.existingCount
  const remaining = Math.max(0, max - committedCount)

  const handleCommitted = useCallback(
    (photo: StagedPhoto) => {
      if (props.mode === 'staged') {
        props.onChange([...props.value, photo])
      } else {
        // Server component re-render; the gallery is the source of truth.
        router.refresh()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props, router],
  )

  const { items, addFiles, cancel, retry, dismiss, isBusy } = usePhotoUploads({
    mode: props.mode === 'attached' ? { kind: 'attached', groupId: props.groupId } : { kind: 'staged' },
    remaining,
    onCommitted: handleCommitted,
    onRejected: setNotices,
  })

  const removeStaged = useCallback(
    (photo: StagedPhoto) => {
      if (props.mode !== 'staged') return
      props.onChange(props.value.filter((p) => p.blobPathname !== photo.blobPathname))
      // Fire and forget: the bytes are unreferenced from this moment on.
      void discardStagedPhotos([photo.blobPathname])
    },
    [props],
  )

  return (
    <section className={props.className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Foto</h2>
        <span className="text-xs text-black/50">
          {committedCount}/{max}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {props.mode === 'staged' &&
          props.value.map((photo) => (
            <div
              key={photo.blobPathname}
              className="relative aspect-square overflow-hidden rounded-xl bg-black/5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.blobUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => removeStaged(photo)}
                aria-label="Hapus foto"
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
              >
                ✕
              </button>
            </div>
          ))}

        {items
          .filter((it) => it.status !== 'done' || props.mode === 'attached')
          .map((item) => (
            <UploadTile
              key={item.key}
              item={item}
              onCancel={cancel}
              onRetry={retry}
              onDismiss={dismiss}
            />
          ))}

        {remaining > 0 && !props.disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-black/15 text-black/45"
          >
            <span className="text-center text-xs leading-tight">
              <span className="block text-2xl leading-none">＋</span>
              Tambah foto
            </span>
          </button>
        )}
      </div>

      {/*
        This ONE element is the entire capture story. On iOS Safari it opens the
        native sheet: Take Photo / Photo Library / Choose File. We deliberately do
        NOT build a getUserMedia camera — the native sheet has the real camera UI,
        focus, HDR, flash and Live Photo handling, and it is what the user expects.
        We also do NOT set `capture`, because that would force camera-only and
        remove the Photo Library option, which is how QRIS screenshots get in.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files)
          // Reset so picking the SAME file twice in a row still fires onChange.
          event.target.value = ''
        }}
      />

      {notices.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-700" role="status">
          {notices.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {isBusy && (
        <p className="mt-2 text-xs text-black/50">
          Foto masih diunggah — tunggu sebentar sebelum menyimpan.
        </p>
      )}
    </section>
  )
}
```

> ✅ **git checkpoint**
> ```bash
> npx tsc --noEmit && npm run lint && git add -A && git commit -m "F06: PhotoPicker + upload queue (progress, cancel, per-file retry, rejection messages)"
> ```

---

## 9. Phase 6 — Gallery and lightbox

### Task 17 — `components/photos/PhotoGallery.tsx`

```tsx
// components/photos/PhotoGallery.tsx
'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { PhotoDTO } from '@/lib/photos/types'
import { Lightbox } from './Lightbox'

export type PhotoGalleryProps = {
  photos: PhotoDTO[]
  /**
   * Owner view only. Omit on /s/[token] and the grid becomes read-only.
   * Should call the deletePhoto Server Action and then router.refresh().
   */
  onDelete?: (photo: PhotoDTO) => Promise<void>
  /** Render nothing at all when there are no photos (default true). */
  hideWhenEmpty?: boolean
  className?: string
}

export function PhotoGallery({
  photos,
  onDelete,
  hideWhenEmpty = true,
  className,
}: PhotoGalleryProps) {
  const [openAt, setOpenAt] = useState<number | null>(null)

  if (photos.length === 0 && hideWhenEmpty) return null

  return (
    <section className={className}>
      <ul className="grid grid-cols-3 gap-1.5">
        {photos.map((photo, index) => (
          <li key={photo.id} className="contents">
            <button
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={`Buka foto ${index + 1} dari ${photos.length}`}
              /*
                aspect-square + object-cover is the whole thumbnail story: every
                cell is a perfect square regardless of the source aspect ratio,
                and the image is centre-cropped rather than letterboxed.
              */
              className="relative aspect-square w-full overflow-hidden rounded-xl bg-black/5"
            >
              <Image
                src={photo.blobUrl}
                alt=""
                fill
                /*
                  3 columns on a 414px viewport => ~132 CSS px. `sizes` is what
                  makes next/image request a ~150–300px rendition instead of the
                  1600px source. Without it you get the full-size image.
                */
                sizes="(max-width: 640px) 33vw, 200px"
                className="object-cover"
                /* Below-the-fold on /e/[id]; never eager. */
                loading="lazy"
              />
            </button>
          </li>
        ))}
      </ul>

      {openAt !== null && (
        <Lightbox
          photos={photos}
          startIndex={openAt}
          onClose={() => setOpenAt(null)}
          onDelete={onDelete}
        />
      )}
    </section>
  )
}
```

**Why deletion lives in the lightbox, not on the grid tile.** A 132 px thumbnail with a destructive
button in the corner is a mis-tap machine on a phone, and an "edit mode" toggle is an extra concept for a
feature this small. Opening the photo first means the user is looking at exactly what they are about to
delete. One tap to open, one tap to delete, one tap to confirm.

### Task 18 — `components/photos/Lightbox.tsx`

```tsx
// components/photos/Lightbox.tsx
'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { PhotoDTO } from '@/lib/photos/types'

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const TAP_SLOP_PX = 10
const DOUBLE_TAP_MS = 280

export function Lightbox({
  photos,
  startIndex,
  onClose,
  onDelete,
}: {
  photos: PhotoDTO[]
  startIndex: number
  onClose: () => void
  onDelete?: (photo: PhotoDTO) => Promise<void>
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(startIndex)
  const [zoomed, setZoomed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  // Jump to the tapped photo without animating through the ones in between.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: startIndex * el.clientWidth, behavior: 'auto' })
  }, [startIndex])

  // Lock the page behind the overlay.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Derive the index from scroll position, coalesced into one rAF per frame.
  const rafRef = useRef(0)
  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = trackRef.current
      if (!el || el.clientWidth === 0) return
      const next = Math.round(el.scrollLeft / el.clientWidth)
      setIndex((prev) => (prev === next ? prev : Math.min(Math.max(next, 0), photos.length - 1)))
    })
  }, [photos.length])

  const current = photos[index]

  const handleDelete = () => {
    if (!onDelete || !current) return
    startTransition(async () => {
      await onDelete(current)
      setConfirming(false)
      // Last photo gone => nothing left to look at.
      if (photos.length <= 1) onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} dari ${photos.length}`}
      /* dvh, not vh: Safari's collapsing URL bar makes 100vh taller than the
         visible viewport, which pushes the footer under the browser chrome. */
      style={{ height: '100dvh' }}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex h-full w-full overflow-y-hidden overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          /* Native paging: momentum, rubber-band and velocity for free.
             Disabled while zoomed so a one-finger pan does not flick to the
             next photo. */
          overflowX: zoomed ? 'hidden' : 'auto',
          scrollSnapType: zoomed ? 'none' : 'x mandatory',
        }}
      >
        {photos.map((photo, i) => (
          <Slide
            key={photo.id}
            photo={photo}
            active={i === index}
            /* Render the neighbours eagerly so a swipe is never a grey box. */
            eager={Math.abs(i - index) <= 1}
            onDismiss={onClose}
            onZoomChange={(z) => {
              if (i === index) setZoomed(z)
            }}
          />
        ))}
      </div>

      {/* ── chrome ─────────────────────────────────────────────────────── */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-3 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="pointer-events-none rounded-full bg-black/50 px-3 py-1 text-sm tabular-nums text-white">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/50 text-lg text-white"
        >
          ✕
        </button>
      </header>

      {onDelete && (
        <footer
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 px-3 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          {confirming ? (
            <>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? 'Menghapus…' : 'Hapus foto ini'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full bg-white/15 px-5 py-2.5 text-sm text-white"
              >
                Batal
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full bg-white/15 px-5 py-2.5 text-sm text-white"
            >
              Hapus
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

/* ── one slide: pinch-zoom, pan, double-tap, tap-to-dismiss ─────────────── */

function Slide({
  photo,
  active,
  eager,
  onDismiss,
  onZoomChange,
}: {
  photo: PhotoDTO
  active: boolean
  eager: boolean
  onDismiss: () => void
  onZoomChange: (zoomed: boolean) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const state = useRef({ scale: 1, x: 0, y: 0 })

  // Reset zoom whenever this slide scrolls out of view.
  useEffect(() => {
    if (active) return
    state.current = { scale: 1, x: 0, y: 0 }
    apply()
    onZoomChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function apply() {
    const el = imgRef.current
    if (!el) return
    const { scale, x, y } = state.current
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let pinchStartDist = 0
    let pinchStartScale = 1
    let panStartX = 0
    let panStartY = 0
    let panOriginX = 0
    let panOriginY = 0
    let tapStart = { x: 0, y: 0, t: 0 }
    let lastTapAt = 0
    let moved = false

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const clampPan = () => {
      const el = imgRef.current
      if (!el) return
      const imgRect = el.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
      // Allowed travel = half the overflow in each axis.
      const maxX = Math.max(0, (imgRect.width - hostRect.width) / 2)
      const maxY = Math.max(0, (imgRect.height - hostRect.height) / 2)
      state.current.x = Math.min(maxX, Math.max(-maxX, state.current.x))
      state.current.y = Math.min(maxY, Math.max(-maxY, state.current.y))
    }

    const onTouchStart = (e: TouchEvent) => {
      moved = false
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches)
        pinchStartScale = state.current.scale
      } else if (e.touches.length === 1) {
        const t = e.touches[0]
        tapStart = { x: t.clientX, y: t.clientY, t: Date.now() }
        panStartX = t.clientX
        panStartY = t.clientY
        panOriginX = state.current.x
        panOriginY = state.current.y
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two fingers: always ours. Stop Safari's page-level pinch-zoom.
        e.preventDefault()
        moved = true
        const ratio = dist(e.touches) / (pinchStartDist || 1)
        state.current.scale = Math.min(MAX_SCALE, Math.max(1, pinchStartScale * ratio))
        if (state.current.scale === 1) {
          state.current.x = 0
          state.current.y = 0
        }
        clampPan()
        apply()
        onZoomChange(state.current.scale > 1)
        return
      }

      if (e.touches.length === 1 && state.current.scale > 1) {
        // One finger while zoomed: pan, and take the gesture away from the
        // snap-scroll track so it does not page to the next photo.
        e.preventDefault()
        moved = true
        const t = e.touches[0]
        state.current.x = panOriginX + (t.clientX - panStartX)
        state.current.y = panOriginY + (t.clientY - panStartY)
        clampPan()
        apply()
        return
      }

      // One finger at scale 1: let the track handle it (native horizontal paging).
      const t = e.touches[0]
      if (
        Math.abs(t.clientX - tapStart.x) > TAP_SLOP_PX ||
        Math.abs(t.clientY - tapStart.y) > TAP_SLOP_PX
      ) {
        moved = true
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return

      const now = Date.now()
      const isTap = !moved && now - tapStart.t < 300

      if (isTap && now - lastTapAt < DOUBLE_TAP_MS) {
        // Double tap: toggle zoom, anchored on the tap point.
        lastTapAt = 0
        if (state.current.scale > 1) {
          state.current = { scale: 1, x: 0, y: 0 }
        } else {
          const hostRect = host.getBoundingClientRect()
          const dx = tapStart.x - (hostRect.left + hostRect.width / 2)
          const dy = tapStart.y - (hostRect.top + hostRect.height / 2)
          state.current = {
            scale: DOUBLE_TAP_SCALE,
            x: -dx * (DOUBLE_TAP_SCALE - 1),
            y: -dy * (DOUBLE_TAP_SCALE - 1),
          }
        }
        clampPan()
        apply()
        onZoomChange(state.current.scale > 1)
        return
      }

      if (isTap) {
        lastTapAt = now
        // Single tap dismisses, but only after the double-tap window has passed
        // and only when we are not zoomed in.
        const scaleAtTap = state.current.scale
        window.setTimeout(() => {
          if (lastTapAt === now && scaleAtTap === 1) onDismiss()
        }, DOUBLE_TAP_MS)
        return
      }

      // Gesture ended below 1× (rubber-band) — settle back.
      if (state.current.scale <= 1) {
        state.current = { scale: 1, x: 0, y: 0 }
        apply()
        onZoomChange(false)
      }
    }

    /*
      CRITICAL: React attaches touchmove at the root as a PASSIVE listener, so
      e.preventDefault() inside an onTouchMove JSX prop is a silent no-op and
      Safari will page-zoom instead of pinch-zooming the photo. These must be
      registered natively with { passive: false }.
    */
    host.addEventListener('touchstart', onTouchStart, { passive: false })
    host.addEventListener('touchmove', onTouchMove, { passive: false })
    host.addEventListener('touchend', onTouchEnd, { passive: false })
    host.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('touchcancel', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={hostRef}
      className="relative grid h-full w-full shrink-0 grow-0 basis-full place-items-center overflow-hidden"
      style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
    >
      {/*
        Plain <img>, not next/image (decision D-D): the blob is already ≤1600px
        and ≤300KB, which is exactly what a full-screen viewer wants. Running it
        through the optimizer buys nothing and spends a transformation.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={photo.blobUrl}
        alt=""
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
        draggable={false}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="max-h-full max-w-full select-none object-contain will-change-transform"
        style={{ transformOrigin: 'center center', touchAction: 'none' }}
      />
    </div>
  )
}
```

**Gesture summary**

| Gesture | Result |
|---|---|
| swipe left / right | next / previous photo (native CSS scroll-snap paging) |
| pinch out | zoom up to 4×; horizontal paging is disabled while zoomed |
| one-finger drag while zoomed | pan, clamped to the image bounds |
| double tap | toggle 1× ↔ 2.5×, anchored on the tap point |
| single tap (unzoomed) | dismiss |
| ✕ button / Escape | dismiss |

`scroll-snap-stop: always` prevents a fast flick from skipping three photos at once, which is the usual
complaint about snap-scroll galleries.

> ✅ **git checkpoint**
> ```bash
> npx tsc --noEmit && npm run lint && git add -A && git commit -m "F06: PhotoGallery grid + hand-rolled swipe/pinch lightbox (no new deps)"
> ```

---

## 10. Deletion: ordering and partial failure

`deletePhoto(id)` does exactly two destructive things. **Order: row first, blob second.**

```
requireUserId()
  └─ findOwnedPhoto(userId, id)      ← join through expense_groups.user_id
       └─ (not found) → throw "Foto tidak ditemukan"   [same answer for "not yours"]
  ── 1. DELETE FROM expense_photos WHERE id = ?
  ── 2. del(blobPathname)   [best effort, never throws]
  ── revalidatePath(`/e/${groupId}`)
```

| Failure | Result | Why this is the acceptable direction |
|---|---|---|
| Step 1 fails | Nothing deleted. Action throws, user sees an error, photo still there. Consistent. | Correct — no partial state. |
| Step 2 fails | Row gone, bytes remain. Photo disappears from the gallery and from `/s/[token]` exactly as the user expects. ~300 KB leaks. | **The user-visible outcome is 100% correct.** The leak is invisible, bounded, and swept by `npm run blob:sweep` (§11). |
| *(rejected)* blob first, row second | If the row delete then fails, the row survives pointing at a 404. The grid renders a broken tile, and `/s/[token]` — a page the user has already sent to a friend — renders a broken tile. | Unrecoverable-looking corruption on a public page, for the same failure probability. |

`del()` is also documented as **not throwing when the blob does not exist**, so re-running a delete is
always safe, and the sweeper never has to worry about double-deleting.

Wiring on `/e/[id]` (F07 owns the page; this is the exact call site):

```tsx
<PhotoGallery
  photos={group.photos}
  onDelete={async (photo) => {
    await deletePhoto(photo.id)
    router.refresh()
  }}
/>
```

**Group deletion.** The `ON DELETE CASCADE` on `expense_photos.group_id` removes the rows but **not the
blobs**. `deleteExpense` must collect pathnames before deleting and call `deleteBlobsQuietly` after — see
the box in Task 11. This is the single easiest way to leak the whole 1 GB budget, so put it in F07's
review checklist.

---

## 11. Orphan blobs

An orphan is a blob with no `expense_photos` row. Three ways one is created:

| Cause | Likelihood | Handled by |
|---|---|---|
| User picks photos on `/new`, then abandons the draft | **Common** — this is the main one | §11.1 + §11.2 + sweeper |
| Upload succeeds but `attachPhoto` fails (network drop, DB blip) | Rare | `onUploadCompleted` webhook (prod) + sweeper |
| `del()` fails during `deletePhoto` / `deleteExpense` | Rare | sweeper |
| Cancel lands in the millisecond after the PUT committed | Very rare | sweeper |

### 11.1 Immediate deletion on explicit removal

Any action where the user *says* a photo is gone deletes the bytes right then:

- Tapping ✕ on a staged tile in `PhotoPicker` → `discardStagedPhotos([pathname])`.
- F05's "Buang draft" (discard draft) button → `discardStagedPhotos(draft.photos.map(p => p.blobPathname))`.
- F05 dropping a stale draft on mount (see below).

### 11.2 Why NOT `del()` on unmount

The obvious mitigation — delete staged blobs in a `useEffect` cleanup — is **wrong for this app**, and
implementing it would cause data loss:

F05 persists the `/new` draft (including `StagedPhoto[]`) to `localStorage` specifically so a mis-tap does
not lose the paste (roadmap §5, F05). Navigating away from `/new` is therefore **not** abandonment — it is
the exact case the draft feature exists to survive. Deleting the blobs on unmount would restore a draft
full of dead URLs and broken thumbnails.

`pagehide` + `navigator.sendBeacon` is also not available: Server Actions are plain fetches without
`keepalive`, and D6 forbids adding a fourth route handler just to receive beacons.

So the staged blobs are treated as **part of the draft**, with a documented TTL. F05 must add this on
`/new` mount (restated in **Interfaces I publish**):

```ts
// /new, on mount
const draft = readDraft()
if (draft && Date.now() - draft.savedAt > ORPHAN_GRACE_MS) {
  void discardStagedPhotos(draft.photos.map((p) => p.blobPathname))
  clearDraft()
}
```

Everything that escapes all of the above — app force-quit, browser crash, localStorage cleared, phone
factory-reset — is caught by the sweeper.

### Task 19 — `scripts/blob-sweep.ts`

```ts
// scripts/blob-sweep.ts
//
//   npm run blob:usage     # report only, never deletes  (default)
//   npm run blob:sweep     # actually delete orphans      (--delete)
//
// An "orphan" is a blob under photos/ that (a) has no expense_photos row and
// (b) is older than ORPHAN_GRACE_MS, so an in-flight draft is never eaten.
import { del, list } from '@vercel/blob'
import { db } from '../lib/db'
import { expensePhotos } from '../lib/db/schema'
import { BLOB_FREE_TIER_BYTES, ORPHAN_GRACE_MS, PHOTO_PREFIX } from '../lib/photos/constants'

const DELETE = process.argv.includes('--delete')

function mb(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

async function main() {
  // 1. Every blob under photos/
  const blobs: Array<{ pathname: string; size: number; uploadedAt: Date }> = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: PHOTO_PREFIX, limit: 1000, cursor })
    for (const b of page.blobs) {
      blobs.push({ pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt) })
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  // 2. Every referenced pathname
  const rows = await db.select({ pathname: expensePhotos.blobPathname }).from(expensePhotos)
  const referenced = new Set(rows.map((r) => r.pathname))

  // 3. Classify
  const cutoff = Date.now() - ORPHAN_GRACE_MS
  const orphans = blobs.filter((b) => !referenced.has(b.pathname))
  const sweepable = orphans.filter((b) => b.uploadedAt.getTime() < cutoff)
  const recent = orphans.length - sweepable.length

  const totalBytes = blobs.reduce((n, b) => n + b.size, 0)
  const orphanBytes = orphans.reduce((n, b) => n + b.size, 0)
  const sweepBytes = sweepable.reduce((n, b) => n + b.size, 0)
  const usedPct = (totalBytes / BLOB_FREE_TIER_BYTES) * 100
  const avg = blobs.length ? Math.round(totalBytes / blobs.length) : 0

  console.log('── Vercel Blob usage ─────────────────────────────')
  console.log(`blobs under ${PHOTO_PREFIX}   ${blobs.length}`)
  console.log(`rows in expense_photos     ${referenced.size}`)
  console.log(`total size                 ${mb(totalBytes)} of 1000 MB (${usedPct.toFixed(1)}%)`)
  console.log(`average photo              ${Math.round(avg / 1024)} KB`)
  console.log(`orphans                    ${orphans.length} (${mb(orphanBytes)})`)
  console.log(`  ├─ sweepable (>24h)      ${sweepable.length} (${mb(sweepBytes)})`)
  console.log(`  └─ too recent, skipped   ${recent}`)
  if (avg > 0) {
    const headroom = Math.max(0, BLOB_FREE_TIER_BYTES - totalBytes)
    console.log(`room left                  ~${Math.floor(headroom / avg)} more photos`)
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
    console.log('\nnothing to delete.')
    return
  }
  for (let i = 0; i < sweepable.length; i += 100) {
    const chunk = sweepable.slice(i, i + 100)
    await del(chunk.map((b) => b.pathname))
    console.log(`deleted ${i + chunk.length}/${sweepable.length}`)
  }
  console.log(`\nreclaimed ${mb(sweepBytes)}.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

Run it:

```bash
npm run blob:usage
```

Expected output shape:

```
── Vercel Blob usage ─────────────────────────────
blobs under photos/        41
rows in expense_photos     38
total size                 9.4 MB of 1000 MB (0.9%)
average photo              224 KB
orphans                    3 (0.7 MB)
  ├─ sweepable (>24h)      2 (0.5 MB)
  └─ too recent, skipped   1
room left                  ~4423 more photos

dry run — nothing deleted. Re-run with `npm run blob:sweep` to delete.
  would delete photos/V1StGXR8_Z5jdHi6B-myT-9x2Kq7.jpg (238190 B)
  would delete photos/kQ3nZ7pLmAo0dR2sT-b1c-Wm4Xv8.jpg (261044 B)
```

**Cadence:** run `npm run blob:usage` monthly, or whenever the picker has visibly misbehaved. It is a
deliberate manual chore, not a cron — a scheduled job that deletes storage on a personal app is a bigger
risk than a few stray megabytes. (If it ever becomes tedious, a Vercel Cron hitting a protected route is
the upgrade path — out of scope for v0.1.0.)

> ✅ **git checkpoint**
> ```bash
> git add -A && git commit -m "F06: orphan blob sweeper + storage usage report"
> ```

---

## 12. Public share pages and privacy

`/s/[token]` (F09) is a server component with **no auth** that renders the same `PhotoGallery` without
`onDelete`. It works with zero extra plumbing because:

- **Vercel Blob public URLs are already public.** `https://<store>.public.blob.vercel-storage.com/photos/<id>-<suffix>.jpg`
  is served by the Vercel CDN to anyone who has it, with no session, no signature and no referrer check.
  Nothing in this feature makes them "more public" on the share page — they were always fetchable.
- **They are unguessable.** `nanoid(21)` is ~125 bits, plus Vercel's own random suffix. Enumeration is not
  a threat model.

The privacy consequences, stated plainly:

1. **A photo URL, once shared, is shared forever.** Revoking the share link (`DELETE FROM share_links`)
   makes `/s/[token]` 404 but does **not** invalidate the blob URLs. Someone who saved a direct image URL
   keeps access until the photo is deleted (which does `del()` the blob — §10). This is the correct
   escalation path: *revoke* hides the page, *delete photo* removes the bytes.
2. **This is exactly why we strip EXIF.** `preserveExif: false` means the uploaded JPEG carries **no
   GPSLatitude/GPSLongitude, no DateTimeOriginal, no device model or serial** — the file is re-encoded
   from a canvas, so there is no EXIF block at all. Without this, forwarding a share link to a friend
   would hand them the GPS coordinates of the user's home for every photo taken there. Verified in the EXIF/GPS check under **Manual QA**.
3. **The blob pathname leaks nothing** (decision D-F): no user id, no group id, no filename, no timestamp.
4. F09 must set `noindex` on `/s/[token]` (already in its scope). Note that this does not stop a crawler
   that is given a direct blob URL — but nothing links to blob URLs except the share page itself.

---

## 13. Storage budget

### 13.1 How many photos fit in 1 GB

Vercel reports storage in decimal GB, so the free tier is **1,000,000,000 bytes**.

| Assumption | Bytes/photo | Photos in 1 GB |
|---|---|---|
| At the 300 KB cap, KB = 1000 B | 300,000 | **3,333** |
| At the 300 KB cap, KB = 1024 B | 307,200 | **3,255** |
| Realistic average (see below) ~220 KB | 225,280 | **~4,439** |

**Plan against 3,200 photos.** That is the conservative, cap-assuming number, and it is the one to quote.

Why the real average lands below the cap: `maxSizeMB: 0.3` is a ceiling, not a target. A 1600×1200 food
photo at q0.8 typically lands 180–280 KB; a QRIS screenshot (mostly flat colour and text) lands 90–160 KB.
Only busy, high-detail scenes push against 300 KB and trigger the quality-reduction iterations.

### 13.2 How long that lasts

| Usage | Photos/month | Months to 1 GB | |
|---|---|---|---|
| Light: 2 photos on 10 expense groups | 20 | 160 | **13 years** |
| Realistic: 3 photos on 20 groups | 60 | 53 | **4.4 years** |
| Heavy: 5 photos on 30 groups | 150 | 21 | **1.8 years** |

At the roadmap's own framing (D2: "~3000+ photos at that size") this matches. Storage is not the binding
constraint for this app.

### 13.3 The other free-tier meters

- **Data transfer.** Thumbnails are served as ~20 KB optimised renditions, and `next/image` fetches each
  source at most once per cache window. A full lightbox view is one ~250 KB blob fetch. Even at 10 GB/month
  that is ~40,000 full-screen photo views — not reachable by one person.
- **Operations.** One upload = one advanced operation. One `list()` page in the sweeper = one. At 60
  photos/month plus a monthly sweep this is noise.
- ⚠️ These allowances change. **Confirm the current Hobby numbers in the Vercel dashboard during Task 3**
  and correct this section rather than trusting it.

### 13.4 What to do when approaching the limit

Run `npm run blob:usage`. Above 80% it prints a loud banner. Then, in order of preference:

1. **Sweep orphans** — `npm run blob:sweep`. Free, instant, zero data loss.
2. **Delete old expense groups.** A 2024 lunch you will never look at again is ~1 MB of photos. Because
   `deleteExpense` calls `deleteBlobsQuietly` (Task 11), this actually reclaims bytes. Without that call
   it reclaims nothing — which is the single most important reason that requirement exists.
3. **Tighten the knobs for future photos.** In `lib/photos/constants.ts`:
   `TARGET_MAX_MB = 0.2`, `TARGET_MAX_EDGE = 1280`, `TARGET_QUALITY = 0.75`. On a 414 px-wide phone,
   1280 px is still 3× the CSS width — visually indistinguishable in the lightbox. This roughly doubles
   the remaining headroom. Existing photos are unaffected (we do not re-encode retroactively).
4. **Lower `MAX_PHOTOS_PER_GROUP`** from 10 to 5.
5. **Upgrade to Vercel Pro.** The last resort, and the correct one if the app is genuinely being used.

Explicitly *not* doing: auto-pruning by age, tiered/cold storage, or a quota UI. Out of scope for v0.1.0.

---

## Contract deltas

Four, all additive or forced by the schema. Nothing here changes `expense_photos` (§4.2) or the route
table (§4.5).

### CD-1 — `createExpense` takes `photos`, not `photoIds` *(breaking, unavoidable)*

Roadmap §4.4:

```ts
createExpense(input: ParsedExpense & { note?, rawText?, photoIds? }) → { id }
```

`photoIds` is unimplementable as written. It implies `expense_photos` rows exist *before* the group, but
`expense_photos.group_id` is `NOT NULL` with an FK to `expense_groups.id` (§4.2). There is no legal row to
have an id for. Proposed replacement:

```ts
import type { NewPhotoInput } from '@/lib/photos/types'
// = { blobUrl: string; blobPathname: string; width: number; height: number; sizeBytes: number }

createExpense(
  input: ParsedExpense & { note?: string; rawText?: string; photos?: NewPhotoInput[] }
) → { id }
```

`createExpense` must, **inside the same transaction that inserts the group and items**, insert one
`expense_photos` row per entry with `sort_order` = array index, and validate every `blobPathname` against
`PHOTO_STORED_PATHNAME_RE`. Owner: F05 / `app/actions/expenses.ts`. See decision D-C for why upload-first
beat create-then-attach.

### CD-2 — `app/actions/photos.ts` gains a third export *(additive)*

```ts
discardStagedPhotos(pathnames: string[]) → void
```

Deletes blobs that have no `expense_photos` row. Required by §11.1. Refuses any pathname that *is*
referenced, so it cannot be used to delete another user's photos.

### CD-3 — `attachPhoto` is idempotent *(behaviour clarification, signature unchanged)*

Calling `attachPhoto` twice with the same `(groupId, blobPathname)` returns the same `{ id }` and creates
exactly one row. Required because the browser and the `onUploadCompleted` webhook both write (decision
D-B). Also backfills `width`/`height`/`sizeBytes` when the stored row has NULLs and the new call has values.

### CD-4 — `deleteExpense` must delete blobs *(new obligation on an existing action)*

Signature unchanged: `deleteExpense(id) → void`. But it must now do:

```ts
const pathnames = await listOwnedGroupPathnames(userId, id)   // from lib/db/photos
// …delete the group (rows cascade)…
await deleteBlobsQuietly(pathnames)                            // from lib/blob/delete
```

The `ON DELETE CASCADE` on `expense_photos` removes rows, never bytes. Without this, every deleted group
permanently leaks its photos into the 1 GB budget. Owner: F07 / `app/actions/expenses.ts`.

---

## Interfaces I publish

Import paths and exact prop types. F05, F07 and F09 should build against these and nothing else.

### `PhotoPicker` — `components/photos/PhotoPicker.tsx`

```ts
export type PhotoPickerProps =
  | {
      mode: 'staged'
      /** Controlled. Owner keeps this in state and persists it with the draft. */
      value: StagedPhoto[]
      onChange: (next: StagedPhoto[]) => void
      /** Default MAX_PHOTOS_PER_GROUP (10). */
      max?: number
      disabled?: boolean
      className?: string
    }
  | {
      mode: 'attached'
      groupId: string
      /** Photos the group already has, so the cap is right. */
      existingCount: number
      max?: number
      disabled?: boolean
      className?: string
    }

export function PhotoPicker(props: PhotoPickerProps): JSX.Element
```

**F05 (`/new`) usage:**

```tsx
const [photos, setPhotos] = useState<StagedPhoto[]>(draft?.photos ?? [])

<PhotoPicker mode="staged" value={photos} onChange={setPhotos} disabled={saving} />

// …on save:
const { id } = await createExpense({ ...parsed, note, rawText, photos })   // CD-1
router.replace(`/e/${id}`)
```

F05 obligations:
- Persist `photos` into the `localStorage` draft alongside the paste. `StagedPhoto` is plain JSON.
- On mount, if `Date.now() - draft.savedAt > ORPHAN_GRACE_MS`, call
  `discardStagedPhotos(draft.photos.map(p => p.blobPathname))` and clear the draft (§11.2).
- On an explicit "Buang draft", same call.
- Optionally disable Save while any upload is in flight. `PhotoPicker` already shows
  "Foto masih diunggah…" but does not block the parent's button.

**F07 (`/e/[id]`) usage:**

```tsx
<PhotoPicker mode="attached" groupId={group.id} existingCount={group.photos.length} />
```

Rows are written by `attachPhoto` inside the picker; it then calls `router.refresh()`. F07 does nothing.

### `PhotoGallery` — `components/photos/PhotoGallery.tsx`

```ts
export type PhotoGalleryProps = {
  photos: PhotoDTO[]
  /** Owner view only. Omit for read-only (share page). */
  onDelete?: (photo: PhotoDTO) => Promise<void>
  /** Render nothing when photos is empty. Default true. */
  hideWhenEmpty?: boolean
  className?: string
}

export function PhotoGallery(props: PhotoGalleryProps): JSX.Element | null
```

`PhotoGallery` is a client component but takes only serialisable props, so a server component can render
it directly. It owns the lightbox — callers never import `Lightbox`.

- **F07 (`/e/[id]`):** pass `onDelete={async (p) => { await deletePhoto(p.id); router.refresh() }}`.
- **F09 (`/s/[token]`):** pass `photos` only. No auth needed; blob URLs are public (§12).

### Types — `lib/photos/types.ts`

```ts
export type StagedPhoto = {
  blobUrl: string; blobPathname: string
  width: number; height: number; sizeBytes: number
}
export type NewPhotoInput = StagedPhoto        // alias used in createExpense (CD-1)
export type PhotoDTO = {
  id: string; blobUrl: string; blobPathname: string
  width: number | null; height: number | null; sizeBytes: number | null
  sortOrder: number
}
```

### Server Actions — `app/actions/photos.ts`

```ts
attachPhoto(input: {
  groupId: string; blobUrl: string; blobPathname: string
  width?: number | null; height?: number | null; sizeBytes?: number | null
}): Promise<{ id: string }>            // idempotent per (groupId, blobPathname) — CD-3

deletePhoto(id: string): Promise<void> // row first, then del() — §10

discardStagedPhotos(pathnames: string[]): Promise<void>   // CD-2
```

### Server helpers — for F07's `deleteExpense` (CD-4)

```ts
// lib/db/photos.ts
listOwnedGroupPathnames(userId: string, groupId: string): Promise<string[]>
upsertPhotoForUser(input: UpsertPhotoInput): Promise<{ id: string; created: boolean }>
assertGroupOwned(userId: string, groupId: string): Promise<void>

// lib/blob/delete.ts
deleteBlobsQuietly(pathnames: string[]): Promise<void>    // never throws
```

### Constants — `lib/photos/constants.ts`

`MAX_PHOTOS_PER_GROUP`, `ORPHAN_GRACE_MS`, `PHOTO_STORED_PATHNAME_RE` are the three F05/F07 will need.

---

## Interfaces I consume

| From | What | Assumed shape | Risk |
|---|---|---|---|
| **F01** | `lib/env.ts` | validates `BLOB_READ_WRITE_TOKEN` as a required string | low — §4.8 already lists it |
| **F01** | `next.config.ts` exists and exports a `NextConfig` | I add `images.remotePatterns` (Task 3) | low, but coordinate if F10 also edits it |
| **F02** | `auth` from `@/auth` | `auth(): Promise<Session \| null>` with `session.user.id` | **medium** — with the JWT strategy, `user.id` must be copied into the token in a `jwt` callback and back out in `session`. If `session.user.id` is undefined the upload route rejects everything. Verify in QA step 2. |
| **F02** | `requireUserId` | `requireUserId(): Promise<string>`, throws when signed out | **path unconfirmed** — see open question OQ-1 |
| **F02** | `middleware.ts` | protects `/new`, `/m`, `/e`, `/stats`, **not** `/s` | low. Note `/api/photos/upload` does its own auth in `onBeforeGenerateToken`, so it does not depend on middleware. |
| **F03** | `db` from `@/lib/db` | Drizzle instance over Neon | low |
| **F03** | `expensePhotos`, `expenseGroups` from `@/lib/db/schema` | camelCase fields: `id`, `groupId`, `blobUrl`, `blobPathname`, `width`, `height`, `sizeBytes`, `sortOrder`, `createdAt` | low — but confirm the exact exported names |
| **F03** | `newId()` from `@/lib/db/ids` | `nanoid(12)` | **path unconfirmed** — see OQ-2 |
| **F03** | `getGroupDetail(userId, id)` | must return `photos: PhotoDTO[]` ordered by `sortOrder ASC, createdAt ASC` | **medium** — F03 must include the photos join. Requested explicitly. |
| **F03** | `getGroupByShareToken(token)` | same `photos: PhotoDTO[]` for `/s/[token]` | medium, same |
| **F03** | `getMonthGroups(userId, month)` | should include a `photoCount` per group (F07 renders it) | F07's requirement, mentioned here so F03 hears it once |
| **F10** | Tailwind v4 `@theme` tokens | classes above use raw `black/5`, `black/50`, `red-600` as placeholders | **cosmetic** — swap for design tokens when F10 lands. Functionality does not depend on it. |
| **F10** | `viewport-fit=cover` in the root layout viewport meta | the lightbox's `env(safe-area-inset-*)` is a no-op without it | **medium** — the close button will sit under the notch on an XS Max if this is missing |

---

## Manual QA — real iPhone XS Max, deployed preview

Run this against a **Vercel preview deployment**, not `localhost`, so `onUploadCompleted` and the real
CDN are in play. Sign in with the Google account first.

Setup:

```bash
git push origin <branch>            # Vercel builds a preview
# open the preview URL on the iPhone, sign in
```

| # | Step | Expected |
|---|---|---|
| 1 | On `/new`, paste the canonical example text and parse it. Tap **＋ Tambah foto**. | Native iOS sheet appears with **Take Photo · Photo Library · Choose File**. No custom camera UI. |
| 2 | **Take Photo** → shoot a plate of food **holding the phone upright (portrait)** → Use Photo. | A tile appears within ~200 ms showing the photo (that is the local object-URL preview). Progress bar runs; label goes `Mengecilkan…` → `Mengunggah…` → the size line. |
| 3 | Read the size line on the finished tile. | Something like `3,8 MB → 241 KB (94% lebih kecil)`. Compressed value must be **under ~300 KB**. |
| 4 | **ORIENTATION GATE.** Look at the tile, then at the same photo in the gallery after saving. | The photo is **upright**, exactly as shot. Not rotated 90°, not mirrored. If it is sideways, apply the fix in §6 "If orientation is wrong" and repeat. |
| 5 | Pick **4 more** at once from Photo Library, including one **QRIS screenshot**. | Two upload concurrently, the rest queue. Each has its own bar. The screenshot compresses to ~100–160 KB and its text is still readable in the lightbox. |
| 6 | While a bar is mid-flight, tap **Batal** on it. | That tile goes to `Dibatalkan` with a **Coba lagi** button. The *other* uploads keep going and finish. |
| 7 | Tap **Coba lagi** on the cancelled tile. | Only that file re-runs. Already-finished tiles do not flicker, do not re-upload, and their `blobPathname`s are unchanged. |
| 8 | Tap ✕ on one finished staged photo. | It disappears from the grid. Afterwards, `npm run blob:usage` on the laptop shows it is *not* in the store (it was `del()`ed immediately). |
| 9 | Tap **Simpan**. | Redirect to `/e/[id]`. All photos are in the gallery, as **perfect squares**, centre-cropped, in pick order. |
| 10 | Scroll the group list / reload `/e/[id]` on cellular with the Network tab open (Safari → Mac Web Inspector). | Thumbnail requests go to `/_next/image?url=…blob.vercel-storage.com…&w=…`, and each response is ~15–30 KB, **not** 250 KB. Off-screen thumbnails are not requested until scrolled to. |
| 11 | Tap the 3rd photo. | Full-screen black overlay. Counter reads **`3 / 7`**. Image fills the screen. The ✕ and counter sit **below the notch**; the delete button sits **above the home indicator** (safe-area check). No page scrollbar, no bounce behind the overlay. |
| 12 | Swipe left, swipe right. | Pages one photo at a time with iOS-native momentum. A fast flick does **not** skip two photos. Counter tracks. |
| 13 | Pinch out on a photo. | Zooms smoothly up to 4×. **The whole page does not zoom** — only the photo. Horizontal swiping is disabled while zoomed; one-finger drag pans and stops at the image edge. |
| 14 | Double-tap. | Toggles ~2.5× centred on the tap; double-tap again returns to fit. |
| 15 | Single-tap the photo. | Overlay dismisses. Underlying page is at the same scroll position. Escape key also works on desktop. |
| 16 | Rotate the phone to landscape while the lightbox is open. | Layout re-fits, no clipping, counter still visible. (Acceptable: the current slide may need one swipe to re-centre.) |
| 17 | Open a photo → **Hapus** → **Hapus foto ini**. | Button shows `Menghapus…`, overlay updates, the photo is gone from the grid after `router.refresh()`. |
| 18 | On the laptop: `curl -sI "<the deleted photo's blobUrl>"` | `HTTP/2 404` (allow up to ~60 s for the Vercel CDN cache to drop it — `del()` is documented as taking up to a minute). |
| 19 | On the laptop: `npm run blob:usage` | `rows in expense_photos` matches the visible photo count. `orphans 0` (or only items younger than 24 h). |

### QA step 7 — the EXIF/GPS check (do this once, it is the privacy gate)

On the laptop, with Location Services **on** for the Camera app so the source photo definitely has GPS:

```bash
# 1. the ORIGINAL, straight off the phone (AirDrop it), to prove GPS was there
exiftool -gps:all -Orientation -ImageSize -Model /path/to/IMG_1234.HEIC

# expected: GPS Latitude / GPS Longitude present, Orientation e.g. "Rotate 90 CW", Model "iPhone XS Max"

# 2. the UPLOADED blob
curl -sL "<blobUrl>" -o /tmp/uploaded.jpg
exiftool -gps:all -Orientation -ImageSize -Model -all /tmp/uploaded.jpg
```

Required result for `/tmp/uploaded.jpg`:

- **No `GPS*` tags at all.**
- **No `Model`, no `DateTimeOriginal`, no `Make`, no serial.**
- `Image Size` long edge ≤ 1600.
- Orientation is either absent or `Horizontal (normal)` — because the rotation is baked into the pixels.
- `File Size` ≤ ~300 KB.

```bash
# one-liner assertion
exiftool -gps:all /tmp/uploaded.jpg | grep -i gps && echo "FAIL: GPS PRESENT" || echo "PASS: no GPS"
```

Expected: `PASS: no GPS`.

### QA step 9 — exercise the `onUploadCompleted` safety net (once, optional)

Only worth doing once, to prove the webhook path works:

1. Deploy to preview.
2. On `/e/[id]`, open Safari's Web Inspector, set the network to **offline** immediately after the upload
   progress bar hits 100% but before the tile flips to `Selesai`.
3. The tile shows an error (the `attachPhoto` call failed).
4. Go back online and reload `/e/[id]`.
5. **Expected:** the photo is in the gallery anyway — the webhook attached it. `width`/`height`/`size_bytes`
   are NULL for that row, which the gallery tolerates (`fill` layout does not need them).

### Also verify on desktop (5 minutes)

| Check | Expected |
|---|---|
| Drag a `.HEIC` into the picker in **Chrome** | Tile fails with the HEIC message, not a silent blank image. Other files in the same batch still succeed. |
| Pick a 30 MB TIFF | Rejected before queueing: "Terlalu besar (30,0 MB). Maksimum 25 MB." |
| Pick a `.pdf` | Rejected: "…bukan file gambar." |
| Pick 12 photos when the cap is 10 | 10 queue; 2 rejection notices appear. |
| `npm run build` | Succeeds. No `next/image` "hostname not configured" error. |

---

## Open questions for the integrator

**OQ-1 — Where does `requireUserId()` live?** F02 owns it (roadmap §5) but the roadmap does not give a path.
I assumed `@/lib/auth/requireUserId`. If F02 puts it in `@/auth` or `@/lib/auth/session`, it is a one-line
import change in `app/actions/photos.ts`. **Decide before F02 ships.**

**OQ-2 — Where does the nanoid helper live, and what is it called?** I assumed
`import { newId } from '@/lib/db/ids'` returning `nanoid(12)`. F03 owns it. Same one-line fix.
Note I use `nanoid(21)` directly for blob pathnames, which is deliberate and separate — those need more
entropy than a DB id because they are the *only* thing protecting a public URL.

**OQ-3 — Is `MAX_PHOTOS_PER_GROUP = 10` the right cap?** Ten is a guess. It bounds worst-case upload time
and gallery height, and 10 × 300 KB = 3 MB per group. If the user routinely shoots a whole meal, 15 might
be better. Cheap to change; it is one constant.

**OQ-4 — Does F05 block "Simpan" while uploads are in flight?** `PhotoPicker` exposes the busy state only
as text. If the user taps Simpan mid-upload, `createExpense` receives only the photos that had finished,
and the rest become orphans. **Recommendation: F05 disables Simpan while `isBusy`.** That requires either
an `onBusyChange?: (busy: boolean) => void` prop on `PhotoPicker` or lifting the hook. I did not add the
prop because I do not want to guess F05's button architecture — tell me which and I will add it.

**OQ-5 — Should the sweeper become a Vercel Cron?** Currently manual (`npm run blob:sweep`). Automating a
job whose whole purpose is deleting storage feels like the wrong trade for a personal app, but if the user
would rather never think about it, a cron hitting a `CRON_SECRET`-protected route is ~20 lines. Note this
would be a **fourth route handler**, which conflicts with D6.

**OQ-6 — Pin the blob hostname in `remotePatterns`?** Currently `*.public.blob.vercel-storage.com`. Pinning
the literal store hostname is marginally tighter but breaks if the store is ever recreated. Preference?

**OQ-7 — Compression on very old Safari.** `useWebWorker: true` needs `OffscreenCanvas` (Safari 16.4+).
An XS Max on iOS 18 is fine. The library falls back to the main thread otherwise, which means a ~1.5 s jank
per photo rather than a failure. Accepting that; flag if you want an explicit "browser too old" message.

**OQ-8 — EXIF orientation.** I deliberately do *not* pass `exifOrientation`, relying on the library's own
handling, because passing it when the library already rotated causes a double rotation. This is the one
behaviour I could not verify without a real device. **QA step 4 is a hard gate** — if it fails, apply the
documented patch in §6. Flagging it so nobody assumes it was verified.

**OQ-9 — Does anything need a photo count on the month list?** F07's row spec includes "photo count".
That is a `COUNT(expense_photos)` in F03's `getMonthGroups`, not something F06 provides. Confirming it is
on F03's list.

---

## Task checklist

```
Phase 1 — setup
  [ ] 1  install @vercel/blob@2.8.0, browser-image-compression@2.0.2, tsx
  [ ] 2  verify libURL / preserveExif option names against the shipped .d.ts
  [ ] 3  next.config.ts images.remotePatterns + record the Hobby image quota
  [ ] 4  scripts/copy-image-compression-worker.mjs + predev/prebuild + .gitignore
  [ ] 5  create the PUBLIC blob store, vercel env pull, confirm BLOB_READ_WRITE_TOKEN
  ✅ commit
Phase 2 — contracts
  [ ] 6  lib/photos/constants.ts
  [ ] 7  lib/photos/types.ts
  [ ] 8  lib/photos/format.ts + lib/photos/pathname.ts
  ✅ commit
Phase 3 — compression
  [ ] 9  lib/photos/compress.ts
  ✅ commit
Phase 4 — server
  [ ] 10 lib/db/photos.ts
  [ ] 11 lib/blob/delete.ts
  [ ] 12 app/api/photos/upload/route.ts
  [ ] 13 app/actions/photos.ts
  ✅ commit
Phase 5 — picker
  [ ] 14 components/photos/usePhotoUploads.ts
  [ ] 15 components/photos/UploadTile.tsx
  [ ] 16 components/photos/PhotoPicker.tsx
  ✅ commit
Phase 6 — gallery
  [ ] 17 components/photos/PhotoGallery.tsx
  [ ] 18 components/photos/Lightbox.tsx
  ✅ commit
Phase 7 — housekeeping
  [ ] 19 scripts/blob-sweep.ts + npm run blob:usage / blob:sweep
  ✅ commit
Phase 8 — verification
  [ ] 20 npm run build passes
  [ ] 21 deploy preview, run the full iPhone QA table (19 steps)
  [ ] 22 run the EXIF/GPS check — HARD GATE
  [ ] 23 run npm run blob:usage, confirm 0 unexplained orphans
  ✅ commit + open PR
```
