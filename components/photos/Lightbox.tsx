'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import type { PhotoDTO } from '@/lib/photos/types'

/**
 * Full-screen viewer — docs/plans/F06-photos.md Task 18, decision D-E.
 *
 * Hand-rolled, zero new dependencies. `yet-another-react-lightbox` is ~40 KB gz and
 * `photoswipe` ~35 KB, and both ship desktop chrome, captions, thumbnail strips, slideshow
 * timers and plugin systems this app will never use. What is actually needed is:
 *
 *   horizontal paging  → CSS scroll-snap. Native momentum, native rubber-banding, native
 *                        velocity. Better than any JS gesture library, in six lines.
 *   pinch-zoom         → ~90 lines of two-finger touchmove maths, below.
 *   counter, close     → CSS.
 *
 * True black in both schemes (`photo-void`, design R-41): photos want a dark room, and a
 * paper-coloured surround would tint every image on screen.
 */

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

  // Jump straight to the tapped photo rather than animating through the ones between.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: startIndex * el.clientWidth, behavior: 'auto' })
  }, [startIndex])

  // Lock the page behind the overlay, and restore exactly what was there — not ''.
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

  // Derive the index from scroll position, coalesced to one read per frame. Reading
  // scrollLeft on every scroll event is a layout thrash on a 60 Hz momentum scroll.
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

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const current = photos[index]

  const handleDelete = () => {
    if (!onDelete || !current) return
    startTransition(async () => {
      await onDelete(current)
      setConfirming(false)
      // Nothing left to look at.
      if (photos.length <= 1) onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-photo-void"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} dari ${photos.length}`}
      /* 100dvh, not 100vh: on iOS Safari 100vh is the URL-bar-collapsed height, so a 100vh
         overlay is ~80px too tall and pushes its own footer under the browser chrome. */
      style={{ height: '100dvh' }}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex h-full w-full [scrollbar-width:none] overflow-y-hidden overscroll-contain [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          /* Native paging: momentum, rubber-band and fling velocity for free. Disabled
             while zoomed so a one-finger pan does not flick to the next photo. */
          overflowX: zoomed ? 'hidden' : 'auto',
          scrollSnapType: zoomed ? 'none' : 'x mandatory',
        }}
      >
        {photos.map((photo, i) => (
          <Slide
            key={photo.id}
            photo={photo}
            active={i === index}
            /* Render the immediate neighbours eagerly, so a swipe is never a grey box. */
            eager={Math.abs(i - index) <= 1}
            onDismiss={onClose}
            onZoomChange={(z) => {
              if (i === index) setZoomed(z)
            }}
          />
        ))}
      </div>

      {/* ── chrome ─────────────────────────────────────────────────────────────────── */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-3 pb-3"
        /* env() is a no-op without viewport-fit=cover in the root layout; F10 sets it, so
           these keep the counter and ✕ clear of the notch on an XS Max. */
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="rounded-full bg-yellow px-3 py-1 tabular text-action text-[#0d0d0d]">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="pointer-events-auto grid size-touch press place-items-center rounded-full bg-white/15 text-row text-white"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      {onDelete && (
        <footer
          /* `pb-2`, no safe inset — the 8px edge rule (globals.css). The h-touch buttons carry
             the rest of the 22px themselves. */
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 px-3 pt-3 pb-2"
        >
          {confirming ? (
            <>
              {/*
                Not the design-system <Button>: every variant there is coloured for `paper`,
                and this footer floats over a true-black photo surround. Same geometry
                (h-touch, mono, uppercase, tracked) with the two colours this context needs.
              */}
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="h-touch press rounded-field bg-red px-5 text-action tracking-[0.14em] text-white uppercase disabled:opacity-60"
              >
                {pending ? 'Menghapus…' : 'Hapus foto ini'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-touch press rounded-field bg-white/15 px-5 text-action tracking-[0.14em] text-white uppercase"
              >
                Batal
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-touch press rounded-field bg-white/15 px-5 text-action tracking-[0.14em] text-white uppercase"
            >
              Hapus
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

/* ── one slide: pinch-zoom, pan, double-tap, tap-to-dismiss ─────────────────────────── */

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

  /*
   * Transform state lives in a ref and is written straight to `style.transform`, never in
   * React state. A pinch fires touchmove at up to 60 Hz and each frame would otherwise be a
   * setState → render → diff → commit; writing the transform directly keeps the gesture on
   * the compositor, which is the difference between smooth and visibly laggy on an XS Max.
   */
  const state = useRef({ scale: 1, x: 0, y: 0 })

  /*
   * Both callbacks come from the parent as inline arrows, so their identity changes on every
   * Lightbox render — including the ~60/s while a swipe is in flight. Read through refs and
   * the touch-listener effect below can depend on nothing, which is what stops it detaching
   * and reattaching its listeners in the middle of a gesture.
   */
  const onDismissRef = useRef(onDismiss)
  const onZoomChangeRef = useRef(onZoomChange)
  useEffect(() => {
    onDismissRef.current = onDismiss
    onZoomChangeRef.current = onZoomChange
  })

  const apply = useCallback(() => {
    const el = imgRef.current
    if (!el) return
    const { scale, x, y } = state.current
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
  }, [])

  // Reset zoom whenever this slide scrolls out of view, so coming back to it later starts
  // at fit rather than wherever the last pinch left it.
  useEffect(() => {
    if (active) return
    state.current = { scale: 1, x: 0, y: 0 }
    apply()
    onZoomChangeRef.current(false)
  }, [active, apply])

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
    let dismissTimer = 0
    let moved = false

    const dist = (t: TouchList) => {
      const [a, b] = [t[0]!, t[1]!]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    /** Keep the image inside its own bounds: travel is half the overflow in each axis. */
    const clampPan = () => {
      const el = imgRef.current
      if (!el) return
      const imgRect = el.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
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
        const t = e.touches[0]!
        tapStart = { x: t.clientX, y: t.clientY, t: Date.now() }
        panStartX = t.clientX
        panStartY = t.clientY
        panOriginX = state.current.x
        panOriginY = state.current.y
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two fingers are always ours. preventDefault stops Safari page-zooming instead.
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
        onZoomChangeRef.current(state.current.scale > 1)
        return
      }

      if (e.touches.length === 1 && state.current.scale > 1) {
        // One finger while zoomed: pan, and take the gesture away from the snap track so it
        // does not page to the next photo mid-inspection.
        e.preventDefault()
        moved = true
        const t = e.touches[0]!
        state.current.x = panOriginX + (t.clientX - panStartX)
        state.current.y = panOriginY + (t.clientY - panStartY)
        clampPan()
        apply()
        return
      }

      // One finger at 1x: let the track handle it — that is the native horizontal paging.
      const t = e.touches[0]
      if (
        t &&
        (Math.abs(t.clientX - tapStart.x) > TAP_SLOP_PX ||
          Math.abs(t.clientY - tapStart.y) > TAP_SLOP_PX)
      ) {
        moved = true
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return

      const now = Date.now()
      const isTap = !moved && now - tapStart.t < 300

      if (isTap && now - lastTapAt < DOUBLE_TAP_MS) {
        // Double tap: toggle zoom, anchored on the point that was tapped so the detail the
        // user aimed at is what ends up under their finger.
        lastTapAt = 0
        window.clearTimeout(dismissTimer)
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
        onZoomChangeRef.current(state.current.scale > 1)
        return
      }

      if (isTap) {
        lastTapAt = now
        // A single tap dismisses — but only after the double-tap window has passed, or the
        // first tap of a double-tap-to-zoom would close the viewer instead.
        const scaleAtTap = state.current.scale
        dismissTimer = window.setTimeout(() => {
          if (lastTapAt === now && scaleAtTap === 1) onDismissRef.current()
        }, DOUBLE_TAP_MS)
        return
      }

      // A gesture that ended at or below 1x (rubber-band): settle back to fit.
      if (state.current.scale <= 1) {
        state.current = { scale: 1, x: 0, y: 0 }
        apply()
        onZoomChangeRef.current(false)
      }
    }

    /*
      CRITICAL: React attaches touchmove at the root as a PASSIVE listener, so
      e.preventDefault() inside an onTouchMove JSX prop is a silent no-op — Safari page-zooms
      and the photo never scales. These must be registered natively with { passive: false }.
    */
    host.addEventListener('touchstart', onTouchStart, { passive: false })
    host.addEventListener('touchmove', onTouchMove, { passive: false })
    host.addEventListener('touchend', onTouchEnd, { passive: false })
    host.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      window.clearTimeout(dismissTimer)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [apply])

  return (
    <div
      ref={hostRef}
      className="relative grid h-full w-full shrink-0 grow-0 basis-full place-items-center overflow-hidden"
      /* scroll-snap-stop: always is what stops a fast flick skipping three photos — the
         usual complaint about snap-scroll galleries. */
      style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
    >
      {/*
        Plain <img>, not next/image (decision D-D): the blob is already ≤1600px and ≤300 KB,
        which is exactly what a full-screen viewer wants. Optimizing it again would spend a
        transformation and a cold start to save nothing.
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
        className="max-h-full max-w-full object-contain will-change-transform select-none"
        /* touch-action: none hands every touch to the handlers above; without it Safari
           claims the pinch for the page. */
        style={{ transformOrigin: 'center center', touchAction: 'none' }}
      />
    </div>
  )
}
