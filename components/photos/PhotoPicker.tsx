'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { discardStagedPhotos } from '@/app/actions/photos'
import { CloseIcon } from '@/components/ui'
import { cn } from '@/lib/cn'
import { MAX_PHOTOS_PER_GROUP } from '@/lib/photos/constants'
import type { StagedPhoto } from '@/lib/photos/types'

import { UploadTile } from './UploadTile'
import { usePhotoUploads } from './usePhotoUploads'

/**
 * The picker — docs/plans/F06-photos.md Task 16.
 *
 * A horizontally scrolling strip of 74×74 tiles plus a ＋ cell, which is the design's draft
 * strip (R-41). Two modes, one component:
 *
 *   staged   (/new, F05)     controlled; the parent owns StagedPhoto[] and persists it in
 *                            its localStorage draft, then hands it to createExpense.
 *   attached (/e/[id], F07)  uncontrolled; each upload calls attachPhoto and the
 *                            server-rendered gallery becomes the source of truth.
 */

type CommonProps = {
  /** Default MAX_PHOTOS_PER_GROUP. */
  max?: number
  disabled?: boolean
  className?: string
  /**
   * Reconciliation R-31. Fires on every transition of "is anything still uploading".
   *
   * This exists because F05 owns the Simpan button and F06 owns the uploads: with no
   * channel between them, tapping Simpan mid-upload saves an expense whose gallery is
   * missing that photo, with no error and no trace. F05 disables Simpan while this is
   * true. It is the one case in the plan set where disabling the save button is correct.
   */
  onBusyChange?: (busy: boolean) => void
}

export type PhotoPickerProps = CommonProps &
  (
    | {
        mode: 'staged'
        value: StagedPhoto[]
        onChange: (next: StagedPhoto[]) => void
      }
    | {
        mode: 'attached'
        groupId: string
        /** How many photos the group already has, so the cap is right. */
        existingCount: number
      }
  )

export function PhotoPicker(props: PhotoPickerProps) {
  const { max = MAX_PHOTOS_PER_GROUP, disabled = false, className, onBusyChange } = props

  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [notices, setNotices] = useState<string[]>([])

  const committedCount = props.mode === 'staged' ? props.value.length : props.existingCount
  const remaining = Math.max(0, max - committedCount)

  // Read through a ref: `handleCommitted` is called from an async pipeline that may have
  // started several renders ago, and in staged mode it appends to the CURRENT value.
  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  })

  const handleCommitted = useCallback(
    (photo: StagedPhoto) => {
      const current = propsRef.current
      if (current.mode === 'staged') {
        current.onChange([...current.value, photo])
      } else {
        // The row already exists; re-render the server component so the gallery shows it.
        router.refresh()
      }
    },
    [router],
  )

  const { items, addFiles, cancel, retry, dismiss, isBusy } = usePhotoUploads({
    mode:
      props.mode === 'attached' ? { kind: 'attached', groupId: props.groupId } : { kind: 'staged' },
    remaining,
    onCommitted: handleCommitted,
    onRejected: setNotices,
  })

  // R-31: publish the busy state on every transition, and once on mount so a parent that
  // renders its button from this value starts in the right state.
  useEffect(() => {
    onBusyChange?.(isBusy)
  }, [isBusy, onBusyChange])

  /*
   * In attached mode a finished tile and the gallery would show the same photo twice. Rather
   * than guessing with a timer, dismiss finished tiles when `existingCount` GROWS: that
   * value comes from the server component, so it only increases once the row is confirmed
   * and rendered. Race-free, and there is never a frame where the photo is in neither place.
   */
  const attachedCount = props.mode === 'attached' ? props.existingCount : 0
  const previousCount = useRef(attachedCount)
  useEffect(() => {
    if (attachedCount > previousCount.current) {
      items.filter((it) => it.status === 'done').forEach((it) => dismiss(it.key))
    }
    previousCount.current = attachedCount
    // `items` is deliberately not a dependency: this must run when the SERVER count moves,
    // not on every progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedCount, dismiss])

  const removeStaged = useCallback((photo: StagedPhoto) => {
    const current = propsRef.current
    if (current.mode !== 'staged') return
    current.onChange(current.value.filter((p) => p.blobPathname !== photo.blobPathname))
    // Fire and forget: from this moment the bytes are unreferenced, and §11.1 says
    // anything the user explicitly removed goes now rather than waiting for a sweep.
    void discardStagedPhotos([photo.blobPathname])
  }, [])

  // Tiles are hidden once 'done': in staged mode the committed photo below renders it, and
  // in attached mode the gallery does.
  const visibleItems = items.filter((it) => it.status !== 'done')

  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="eyebrow">Foto</h2>
        <span className="tabular text-meta text-ink-3">
          {committedCount}/{max}
        </span>
      </div>

      {/*
        A strip, not a grid: at 74px + 6px gaps five tiles are visible on a 414px screen and
        the rest scroll, so adding a tenth photo never pushes the running total off screen.
        `scroll-pane` contains the rubber-band so the page behind does not move.
      */}
      {/* No negative-margin bleed to the screen edge: that would assume this component's
          parent is gutter-padded, and F05 renders it inside a Card while F07 does not. */}
      <div className="flex gap-1.5 overflow-x-auto scroll-pane pb-1">
        {props.mode === 'staged' &&
          props.value.map((photo) => (
            <div
              key={photo.blobPathname}
              className="relative size-[74px] shrink-0 overflow-hidden rounded-field bg-paper-2"
            >
              {/*
                Plain <img>, not next/image: this tile is transient (it lives only as long
                as the draft), and running each staged photo through the optimizer would
                spend a transformation on an image the user may discard in ten seconds.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.blobUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeStaged(photo)}
                aria-label="Hapus foto ini"
                className="touch-target absolute top-0.5 right-0.5 grid size-5 press place-items-center rounded-full bg-black/60 text-white"
              >
                {/* F12: was a `✕` character. Same 14px optical size, now a real glyph. */}
                <CloseIcon size="xs" />
              </button>
            </div>
          ))}

        {visibleItems.map((item) => (
          <UploadTile
            key={item.key}
            item={item}
            onCancel={cancel}
            onRetry={retry}
            onDismiss={dismiss}
          />
        ))}

        {remaining > 0 && !disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'grid size-[74px] shrink-0 press place-items-center rounded-field',
              // The design's dashed add-tile ("02 Sheet and Media"): bare, not filled, so it
              // reads as a slot rather than as a photo. `ink-3` rather than `rule` on the
              // dash because this is a control whose only boundary is its border, which WCAG
              // 1.4.11 holds to 3:1 — the hairline is 1.09:1 and would not qualify.
              'border border-dashed border-ink-3 bg-transparent text-ink-2',
            )}
          >
            <span className="text-center">
              <span aria-hidden="true" className="block text-[20px] leading-none font-bold">
                +
              </span>
              <span className="mt-1 block text-label">Tambah</span>
            </span>
          </button>
        )}
      </div>

      {/*
        This ONE element is the entire capture story. On iOS Safari it opens the native
        sheet: Take Photo · Photo Library · Choose File. We deliberately do NOT build a
        getUserMedia camera — the native sheet has the real camera UI, focus, HDR, flash and
        Live Photo handling, and it is what the user already knows. We also do NOT set
        `capture`, which would force camera-only and remove Photo Library, and Photo Library
        is how a QRIS screenshot gets in.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files)
          // Reset, or picking the SAME file twice in a row fires no change event.
          event.target.value = ''
        }}
      />

      {/* The readable half of a failure. The 74px tile shows only that something went
          wrong; the sentence explaining it belongs here, where there is width for it. */}
      {(notices.length > 0 || items.some((it) => it.error)) && (
        <ul role="status" className="mt-2 space-y-1">
          {notices.map((n) => (
            <li key={n} className="text-body text-red-ink">
              {n}
            </li>
          ))}
          {items
            .filter((it) => it.error)
            .map((it) => (
              <li key={it.key} className="text-body text-red-ink">
                {it.error}
              </li>
            ))}
        </ul>
      )}

      {isBusy && <p className="mt-2 text-meta text-ink-3">Foto masih diunggah…</p>}
    </section>
  )
}
