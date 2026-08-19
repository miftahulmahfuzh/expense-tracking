'use client'

import Image from 'next/image'
import { useState } from 'react'

import type { PhotoDTO } from '@/lib/photos/types'

import { Lightbox } from './Lightbox'

/**
 * The thumbnail grid — docs/plans/F06-photos.md Task 17.
 *
 * PRESENTATIONAL, and that is a security property, not a style. This module imports no
 * Server Action. Reconciliation R-26: /s/[token] is public, and a gallery that imported
 * `deletePhoto` would ship that action's id in the share page's bundle. Deletion is wired
 * by PhotoManager, which only the owner's page renders.
 *
 * Takes only serialisable props, so a server component can render it directly.
 */

export type PhotoGalleryProps = {
  photos: PhotoDTO[]
  /**
   * Owner view only. Omit on /s/[token] and the grid is read-only.
   * PhotoManager supplies this; page code should use PhotoManager instead of wiring it.
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
      {/* 3-up at 6px gaps (design R-41). On a 414px screen with a 22px gutter that is
          ~120px per cell — hence the `sizes` hint below. */}
      <ul className="grid grid-cols-3 gap-1.5">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={`Buka foto ${index + 1} dari ${photos.length}`}
              /* aspect-square + object-cover is the whole thumbnail story: every cell is a
                 perfect square whatever the source aspect ratio, centre-cropped rather
                 than letterboxed, so the grid reads as a grid. */
              className="relative block aspect-square w-full press overflow-hidden rounded-field border border-rule bg-paper-2"
            >
              <Image
                src={photo.blobUrl}
                alt=""
                fill
                /*
                  THE reason next/image is here (decision D-D). Without `sizes` the browser
                  assumes 100vw and fetches the full 1600px source: twelve thumbnails would
                  be ~3.6 MB on cellular to paint twelve ~120px squares. With it, each cell
                  gets a ~15-25 KB rendition — a ~10x transfer win on the screen the user
                  opens most.
                */
                sizes="(max-width: 640px) 33vw, 200px"
                className="object-cover"
                /* Always below the fold on /e/[id]. Never eager. */
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
