import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'

import { getUserId } from '@/lib/auth/requireUserId'
import { assertGroupOwned } from '@/lib/db/queries'
import { upsertPhotoForUser } from '@/lib/db/photos'
import { blobEnv } from '@/lib/env'
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  BLOB_CACHE_MAX_AGE,
  MAX_UPLOAD_BYTES,
  PHOTO_REQUEST_PATHNAME_RE,
  UPLOAD_TOKEN_TTL_MS,
} from '@/lib/photos/constants'
import { IdSchema } from '@/lib/schema/expense'

/**
 * POST /api/photos/upload — roadmap §4.5, docs/plans/F06-photos.md Task 12.
 *
 * This route does NOT receive image bytes. It mints a short-lived signed token; the browser
 * then PUTs straight to Vercel Blob (decision D-A). That matters for three reasons: a
 * Vercel Function rejects request bodies over ~4.5 MB, streaming an upload through a
 * function bills wall-clock for zero computation, and only a direct browser PUT can report
 * honest progress.
 *
 * It is also the app's second security boundary after Server Actions. proxy.ts does not
 * cover it (R-5, and the matcher deliberately lists only page routes), so the auth check
 * below is the ONLY thing between an anonymous internet and a writable blob store.
 */

export const runtime = 'nodejs'

/** What the browser is allowed to tell us. Validated, never trusted. */
const ClientPayload = z.object({
  // Reuses F03a's id shape so "a group id" means the same thing here as in every action.
  groupId: IdSchema.nullish(),
})

/** Mirrored into the signed token; comes back to us on the webhook. */
const TokenPayload = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
})

export async function POST(request: Request): Promise<Response> {
  // Fail loudly and early if the store was never linked, rather than at token-mint time
  // with an SDK message about a missing store.
  blobEnv()

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      // ── Step 1: mint a short-lived client token ──────────────────────────────────────
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // AUTH. Without this the route is an open upload endpoint for the internet.
        // getUserId(), not requireUserId(): a redirect to an HTML sign-in page is a
        // terrible answer to fetch(), and handleUpload turns this throw into a 400.
        const userId = await getUserId()
        if (!userId) throw new Error('Not authenticated')

        // The client picks its own pathname, so constrain it hard: our prefix, our
        // alphabet, our extension. Stops path traversal and stops a hostile client
        // writing over or beside anything else in the store.
        if (!PHOTO_REQUEST_PATHNAME_RE.test(pathname)) {
          throw new Error('Invalid pathname')
        }

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        // If the upload is destined for an existing group, prove ownership NOW, while
        // there is a session to check it against. onUploadCompleted arrives later as a
        // server-to-server call with no cookies, so it cannot re-authorise — it trusts
        // this decision, carried in the signed token.
        if (payload.groupId) {
          await assertGroupOwned(userId, payload.groupId)
        }

        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES], // image/jpeg only
          maximumSizeInBytes: MAX_UPLOAD_BYTES, // 1.5 MB
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({
            userId,
            groupId: payload.groupId ?? null,
          }),
        }
      },

      // ── Step 2: Vercel calls us back once the bytes have landed ─────────────────────
      // NOTE: this NEVER fires against localhost — Vercel Blob cannot reach a laptop. It is
      // a production-only safety net (decision D-B), not the primary writer. The browser's
      // attachPhoto() call is the primary writer and works everywhere, which is what keeps
      // the whole feature developable locally.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = TokenPayload.safeParse(JSON.parse(tokenPayload || '{}'))
        if (!parsed.success) {
          // Nothing to retry: a malformed payload will be malformed on every attempt.
          console.error('[photos] bad tokenPayload on upload completion')
          return
        }
        const { userId, groupId } = parsed.data

        // No groupId => a /new draft (staged). There is no group to attach to yet; F05
        // persists it through createExpense. Nothing to do.
        if (!groupId) return

        try {
          const { created } = await upsertPhotoForUser({
            userId,
            groupId,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            // The webhook has no pixel data. attachPhoto() backfills these if it also
            // runs, or they stay NULL — §4.2 declares all three nullable for this reason.
            width: null,
            height: null,
            sizeBytes: null,
          })
          console.log('[photos] webhook attach', { groupId, pathname: blob.pathname, created })
        } catch (error) {
          // Re-thrown on purpose: a non-200 makes Vercel retry up to 5 times, which is
          // right for a transient DB blip and harmless for a permanent failure because
          // upsertPhotoForUser is idempotent (R-20).
          console.error('[photos] webhook attach failed', error)
          throw error
        }
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    // 400 for both phases. On the webhook phase a non-200 is the retry signal; on the
    // token phase it is the refusal. The message is intentionally terse — "Not
    // authenticated" / "Invalid pathname" — and never echoes a group id back, so a
    // probe cannot use this endpoint to learn which ids exist.
    console.error('[photos] upload route refused', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload rejected' },
      { status: 400 },
    )
  }
}
