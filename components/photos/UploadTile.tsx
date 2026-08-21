'use client'

import { cn } from '@/lib/cn'
import type { UploadItem } from '@/lib/photos/types'

/**
 * One in-flight tile in the picker strip — docs/plans/F06-photos.md Task 15.
 *
 * 74×74 (design R-41), which is the constraint that shaped this component: the plan's
 * sketch put a three-line error message and two text buttons inside the tile, and none of
 * that is legible at 74px. So the tile carries only STATE — a progress bar, a one-word
 * label, and a single ✕ — while the human-readable failure text is listed under the strip
 * by PhotoPicker, where there is room for a sentence.
 */

/** Present tense, because each is a thing happening right now. Design R-40 register. */
const LABEL: Record<UploadItem['status'], string> = {
  queued: 'Nunggu',
  compressing: 'Kecilin',
  uploading: 'Unggah',
  attaching: 'Simpan',
  done: 'Selesai',
  error: 'Gagal',
  canceled: 'Batal',
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
  const failed = item.status === 'error' || item.status === 'canceled'

  return (
    <div
      className={cn(
        // 74px is the design's draft-strip tile. size-[74px] rather than a spacing token
        // because this measurement belongs to one strip, not to the scale.
        'relative size-[74px] shrink-0 overflow-hidden rounded-field border bg-paper-2',
        failed ? 'border-red' : 'border-transparent',
      )}
    >
      {/*
        The ORIGINAL, as an object URL, so a thumbnail is on screen within ~200 ms —
        before compression has even started. next/image cannot help here (blob: URL, and
        the file is local), and this is the one place a raw <img> is unambiguously right.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt=""
        className={cn(
          'size-full object-cover',
          item.status === 'done' ? 'opacity-100' : 'opacity-55',
        )}
      />

      {/* Tapping a failed tile retries it: at 74×74 the whole tile is a generous target,
          which beats a 12px "coba lagi" link squeezed under a progress bar. */}
      {failed && (
        <button
          type="button"
          onClick={() => onRetry(item.key)}
          aria-label={`Coba lagi unggah foto ini${item.error ? `: ${item.error}` : ''}`}
          className="absolute inset-0 grid press place-items-center bg-red-soft/85"
        >
          <span aria-hidden="true" className="text-row text-red-ink">
            ↻
          </span>
        </button>
      )}

      {inFlight && (
        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-black/60 px-1 pt-1 pb-1">
          <div className="h-0.5 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white transition-[width] duration-200 ease-[var(--ease-out-soft)]"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <span className="block truncate text-label tracking-normal text-white">
            {LABEL[item.status]}
          </span>
        </div>
      )}

      {(item.status === 'error' || item.status === 'canceled') && (
        <span className="absolute inset-x-0 bottom-0 block truncate bg-black/60 px-1 py-0.5 text-center text-label tracking-normal text-white">
          {LABEL[item.status]}
        </span>
      )}

      {/*
        One affordance, one meaning: ✕ removes this tile. While the upload is in flight
        that means cancel; afterwards it means dismiss. Painted at 20px, expanded to the
        44px floor by `touch-target` (design R-41) so it is hittable without covering the
        photo it sits on.
      */}
      <button
        type="button"
        onClick={() => (inFlight ? onCancel(item.key) : onDismiss(item.key))}
        aria-label={inFlight ? 'Batalkan unggahan' : 'Hapus dari daftar'}
        className="touch-target absolute top-0.5 right-0.5 grid size-5 press place-items-center rounded-full bg-black/60 text-label text-white"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
