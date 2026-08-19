'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'

import { attachPhoto } from '@/app/actions/photos'
import { compressForUpload, rejectionReason } from '@/lib/photos/compress'
import { UPLOAD_CONCURRENCY, UPLOAD_CONTENT_TYPE } from '@/lib/photos/constants'
import { newPhotoPathname } from '@/lib/photos/pathname'
import type { StagedPhoto, UploadItem } from '@/lib/photos/types'

/**
 * The client-side upload pipeline — docs/plans/F06-photos.md Task 14.
 *
 * All of the state machine lives here so PhotoPicker stays presentational. One file per
 * picked photo: compress → upload → (attach) → done, with cancel and per-file retry.
 */

export type UploadMode =
  /** /new — no group exists yet. Blobs upload now, rows come later via createExpense. */
  | { kind: 'staged' }
  /** /e/[id] — attach immediately. */
  | { kind: 'attached'; groupId: string }

type Options = {
  mode: UploadMode
  /** How many more files may be accepted right now. */
  remaining: number
  /** Fires once per successfully uploaded (and, in attached mode, persisted) file. */
  onCommitted?: (photo: StagedPhoto) => void
  /** Fires when files are refused before queueing (wrong type / too big / over the cap). */
  onRejected?: (messages: string[]) => void
}

/** Minimal counting semaphore — keeps UPLOAD_CONCURRENCY files in flight, no more. */
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

/** Collision-proof per mount without needing a counter in state. */
let keySeq = 0
const nextKey = () => `u${(keySeq += 1)}`

export function usePhotoUploads({ mode, remaining, onCommitted, onRejected }: Options) {
  const [items, setItems] = useState<UploadItem[]>([])

  const semaphore = useRef(createSemaphore(UPLOAD_CONCURRENCY))
  const controllers = useRef(new Map<string, AbortController>())
  const previewUrls = useRef(new Set<string>())

  // Read through refs so the async pipeline never captures a stale callback: `run` is
  // created once and may still be mid-flight several renders later.
  const modeRef = useRef(mode)
  const onCommittedRef = useRef(onCommitted)
  const onRejectedRef = useRef(onRejected)
  useEffect(() => {
    modeRef.current = mode
    onCommittedRef.current = onCommitted
    onRejectedRef.current = onRejected
  })

  // Object URLs are a real leak on a phone: each one pins a 3-5 MB decoded original in
  // memory until revoked, and the picker holds up to ten.
  useEffect(() => {
    const urls = previewUrls.current
    const inFlight = controllers.current
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
      // Unmounting mid-upload: stop the transfers. Anything whose PUT had already
      // committed is unreferenced and gets swept (§11).
      inFlight.forEach((c) => c.abort())
      inFlight.clear()
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

        // ── compress: 0 → 30% of the bar ────────────────────────────────────────────
        // 30/70 is roughly honest: ~0.6-1.5 s to compress a 12 MP photo on an XS Max,
        // ~1-3 s to upload 300 KB over LTE.
        patch(item.key, { status: 'compressing', progress: 0, error: null })
        const compressed = await compressForUpload(item.file, {
          signal,
          onProgress: (p) => patch(item.key, { progress: Math.round(p * 0.3) }),
        })
        if (signal.aborted) {
          patch(item.key, { status: 'canceled' })
          return
        }

        // ── upload: 30 → 100% ───────────────────────────────────────────────────────
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
        // ALWAYS blob.pathname, never the one we asked for: addRandomSuffix means Vercel
        // rewrote it, and the one we asked for does not exist in the store.
        uploadedPathname = blob.pathname

        const staged: StagedPhoto = {
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          width: compressed.width,
          height: compressed.height,
          sizeBytes: compressed.compressedBytes,
        }

        // ── attach (existing group only) ────────────────────────────────────────────
        if (current.kind === 'attached') {
          patch(item.key, { status: 'attaching', progress: 100 })
          await attachPhoto({ groupId: current.groupId, ...staged })
        }

        patch(item.key, { status: 'done', progress: 100, result: staged, error: null })
        onCommittedRef.current?.(staged)
      } catch (error) {
        if (signal.aborted) {
          // Cancellation, not failure. There is a millisecond race where the PUT
          // committed just before the abort landed; anything stranded there is
          // unreferenced and the sweeper takes it (§11).
          patch(item.key, { status: 'canceled' })
        } else {
          patch(item.key, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Gagal mengunggah.',
          })
          if (uploadedPathname) {
            // Bytes are up but the row failed. In production the onUploadCompleted
            // webhook has probably already attached it, and a retry is idempotent
            // either way (R-20).
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

      // `remaining` counts what is already committed, so the budget is decremented here
      // as files are accepted — otherwise picking 12 at once would queue all 12.
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
          key: nextKey(),
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

  /**
   * Re-runs the pipeline for ONE file, from compression, reusing the retained File.
   * Files already 'done' are never re-compressed or re-uploaded and their blobPathnames
   * do not change. In attached mode a retry that re-uploads produces a NEW blob (new
   * random pathname); the previously stranded one is unreferenced and gets swept.
   */
  const retry = useCallback(
    (key: string) => {
      setItems((prev) => {
        const target = prev.find((it) => it.key === key)
        if (target) void run({ ...target, status: 'queued', progress: 0, error: null })
        return prev.map((it) =>
          it.key === key ? { ...it, status: 'queued', progress: 0, error: null } : it,
        )
      })
    },
    [run],
  )

  /** Drop a tile from the list. Does NOT delete blobs — PhotoPicker owns that decision. */
  const dismiss = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    setItems((prev) => {
      const target = prev.find((it) => it.key === key)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
        previewUrls.current.delete(target.previewUrl)
      }
      return prev.filter((it) => it.key !== key)
    })
  }, [])

  const isBusy = items.some(
    (it) =>
      it.status === 'queued' ||
      it.status === 'compressing' ||
      it.status === 'uploading' ||
      it.status === 'attaching',
  )

  return { items, addFiles, cancel, retry, dismiss, isBusy }
}
