'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { CloseIcon, DownloadIcon, ShareIcon, TrashIcon } from '@/components/ui'
import { useVisualViewport } from '@/lib/hooks/useVisualViewport'
import {
  isEager,
  isWrappable,
  realIndexFor,
  trackIndexFor,
  wrapTarget,
} from '@/lib/photos/carousel'
import type { ViewablePhoto } from '@/lib/photos/types'
import { copyText } from '@/lib/share/clipboard'

/**
 * Full-screen viewer — docs/plans/F06-photos.md Task 18 (decision D-E), extended by F12 §2–§3.
 *
 * Hand-rolled, and still zero gesture dependencies. `yet-another-react-lightbox` is ~40 KB gz
 * and `photoswipe` ~35 KB, and both ship desktop chrome, captions, thumbnail strips, slideshow
 * timers and plugin systems this app will never use. What is actually needed is:
 *
 *   horizontal paging  → CSS scroll-snap. Native momentum, native rubber-banding, native
 *                        velocity. Better than any JS gesture library, in six lines.
 *   wrap-around        → two sentinel clones and one scroll-jump on settle. lib/photos/carousel.ts
 *   pinch-zoom         → ~90 lines of two-finger touchmove maths, below.
 *   counter, chrome    → CSS.
 *
 * True black in both schemes (`photo-void`, design R-41): photos want a dark room, and a
 * paper-coloured surround would tint every image on screen.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THREE CONTROLS, THREE DIFFERENT REASONS THEY LIVE WHERE THEY DO (F12 §2):
 *
 *   download  PURE CLIENT. Fetches the blob and hands it to `navigator.share({ files })`,
 *             whose first row on iOS is *Save Image* — the only path from a web page to the
 *             Photos library. It imports no Server Action, so it can live in this file.
 *   share     A SERVER ACTION, so it CANNOT live in this file. `tests/share.bundle.test.ts`
 *             requires that `PhotoGallery` — which `/s/[token]` renders — reach no action at
 *             all. It arrives as the `onShare` prop, wired only by `PhotoManager`.
 *   delete    Same reasoning, same shape, and that is why `onDelete` was already a prop.
 *
 *  EACH ICON RENDERS ONLY IF ITS PROP IS PRESENT. On `/s/[token]` and `/f/[token]` the
 *  cluster is download-only, and that is a property of the module graph rather than a runtime
 *  check somebody could get wrong.
 * ════════════════════════════════════════════════════════════════════════════
 */

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const TAP_SLOP_PX = 10
const DOUBLE_TAP_MS = 280
/** Fallback settle detection where `scrollend` does not exist yet. See `useSettle`. */
const SETTLE_DEBOUNCE_MS = 120
/** How long the inline status pill stays before clearing itself. */
const STATUS_CLEAR_MS = 2400

/**
 * The Indonesian, collected. `components/photos` has no `copy.ts` — F06 inlined these — but
 * F12 more than doubled the count, and a floating cluster whose four labels live in four
 * different JSX branches is how one of them ends up saying something slightly different.
 */
const COPY = {
  close: 'Tutup',
  download: 'Simpan foto',
  share: 'Bagikan foto',
  delete: 'Hapus',
  deleteConfirm: 'Hapus Foto Ini',
  deleting: 'Menghapus…',
  cancel: 'Batal',
  copied: 'Tautan disalin',
  copyByHand: 'Salin manual',
  shareFailed: 'Gagal membuat tautan.',
  downloadFailed: 'Gagal menyiapkan foto.',
} as const

/**
 * KEYED TO A PHOTO, not reset when the photo changes.
 *
 * The obvious shape is a bare `Status` plus `useEffect(() => setStatus(null), [index])`, and it
 * is wrong twice: `react-hooks/set-state-in-effect` rejects it (a synchronous setState in an
 * effect is a second render pass), and it renders the stale status for one frame before clearing
 * it — so swiping away from a "Tautan disalin" pill flashes it on the next photo.
 *
 * Carrying the id and comparing during render has neither problem: the status for a photo you
 * are no longer looking at simply is not the current status.
 */
type Status =
  | { kind: 'copied' }
  /** Both clipboard paths failed. The URL is shown, selected, to long-press → Copy. */
  | { kind: 'manual'; url: string }
  | { kind: 'error'; message: string }

export function Lightbox({
  photos,
  startIndex,
  onClose,
  onDelete,
  onShare,
}: {
  photos: ViewablePhoto[]
  startIndex: number
  /**
   * Omitted on `/f/[token]`, and its ABSENCE is what makes the viewer undismissable — there is
   * no separate `dismissible` flag, because two props that must agree are two props that can
   * disagree. No handler ⇒ no ✕, no tap-to-dismiss, no Escape.
   *
   * It must also be omitted rather than passed as a no-op: `/f/[token]` is a SERVER component,
   * and a function prop from a server component to a client one is not serialisable — React
   * throws "Functions cannot be passed directly to Client Components" at render.
   */
  onClose?: () => void
  onDelete?: (photo: ViewablePhoto) => Promise<void>
  /**
   * Mints (or re-reads) the public link for one photo and resolves to its absolute URL.
   * Supplied by `PhotoManager`; absent everywhere the viewer is read-only.
   */
  onShare?: (photo: ViewablePhoto) => Promise<string>
}) {
  /*
   * ════════════════════════════════════════════════════════════════════════
   *  THE FLOATING CONTROLS WERE INVISIBLE ON AN iPHONE AND FINE ON DESKTOP, AND THIS IS WHY.
   *
   *  `position: fixed` on iOS Safari resolves against the LAYOUT viewport, whose bottom edge
   *  sits UNDERNEATH Safari's bottom toolbar. So a `fixed inset-0` overlay is taller than the
   *  band the user can see, and anything pinned to its bottom — the whole download/share/delete
   *  cluster — renders below the fold, behind browser chrome. The counter at the top was
   *  visible the entire time, which is what made it look like the buttons had not shipped.
   *
   *  `AddExpenseClient` already solved exactly this for /new's Simpan bar, measured on this
   *  same device: "--app-h says how TALL the visible band is; --vv-top says WHERE it is … 46px
   *  of it, measured on an XS Max." This is that pattern, second consumer. Note that hook is
   *  now ref-counted precisely because there are two of us.
   *
   *  `min()` rather than a bare var, for that file's reason: a browser reporting a visual
   *  viewport TALLER than the layout one (mid-scroll, collapsing URL bar) must not stretch the
   *  overlay past the screen. 100dvh remains the first-paint and no-visualViewport fallback.
   * ════════════════════════════════════════════════════════════════════════
   */
  useVisualViewport()

  const trackRef = useRef<HTMLDivElement>(null)
  const count = photos.length
  const wrap = isWrappable(count)

  /*
   * TRACK position, not photo index — the two differ by the leading sentinel, and keeping the
   * raw scroll position as the state is what makes the wrap a no-op for everything else:
   * `realIndexFor` maps it back, so the counter, the eager hint and the zoom reset all read
   * the same corrected value.
   */
  const [trackPos, setTrackPos] = useState(() => trackIndexFor(startIndex, count))
  const [zoomed, setZoomed] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rawStatus, setRawStatus] = useState<(Status & { photoId: string }) | null>(null)
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const [pending, startTransition] = useTransition()

  const index = realIndexFor(trackPos, count)
  const current = photos[index]

  // Both derived, per the note on `Status`: a pending confirm or a status pill belongs to ONE
  // photo, and moving to another one ends it without any state having to change.
  const confirming = confirmingId !== null && confirmingId === current?.id
  const status = rawStatus && rawStatus.photoId === current?.id ? rawStatus : null

  const setStatus = (next: Status | null) =>
    setRawStatus(next && current ? { ...next, photoId: current.id } : null)
  const setConfirming = (on: boolean) => setConfirmingId(on && current ? current.id : null)

  /* ── the track ────────────────────────────────────────────────────────────────────────
     The sentinels are DUMB <img>, not `Slide`: no pinch handlers, no zoom state, no
     double-tap. You cannot inspect a photo you are mid-wrap through, so duplicating ~90 lines
     of touch maths onto a node that exists for one frame would be all cost.                */

  const cells = useMemo(() => {
    const body = photos.map((photo, i) => ({
      key: photo.id,
      photo,
      trackPos: trackIndexFor(i, count),
      clone: false,
    }))
    if (!wrap) return body
    return [
      { key: 'sentinel-head', photo: photos[count - 1]!, trackPos: 0, clone: true },
      ...body,
      { key: 'sentinel-tail', photo: photos[0]!, trackPos: count + 1, clone: true },
    ]
  }, [photos, count, wrap])

  // Jump straight to the tapped photo rather than animating through the ones between. The
  // `trackIndexFor` offset is what stops this landing on the leading sentinel instead.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: trackIndexFor(startIndex, count) * el.clientWidth, behavior: 'auto' })
  }, [startIndex, count])

  // Lock the page behind the overlay, and restore exactly what was there — not ''.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Derive the position from scroll, coalesced to one read per frame. Reading scrollLeft on
  // every scroll event is a layout thrash on a 60 Hz momentum scroll.
  const rafRef = useRef(0)
  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = trackRef.current
      if (!el || el.clientWidth === 0) return
      const next = Math.round(el.scrollLeft / el.clientWidth)
      setTrackPos((prev) => (prev === next ? prev : next))
    })
  }, [])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  /* ── the wrap ─────────────────────────────────────────────────────────────────────────
     ON SETTLE, NEVER DURING MOMENTUM. Rewriting scrollLeft mid-fling fights the scroller:
     iOS applies the remaining velocity from the NEW offset, so the photo jerks and can
     overshoot. `scroll-snap-stop: always` (below) guarantees a fling advances exactly one
     slide, so we always settle ON a sentinel rather than sailing past it.                 */

  useEffect(() => {
    const el = trackRef.current
    if (!el || !wrap) return

    const settle = () => {
      if (el.clientWidth === 0) return
      const pos = Math.round(el.scrollLeft / el.clientWidth)
      const target = wrapTarget(pos, count)
      if (target === null) return
      // `behavior: 'auto'` — instantaneous. Both ends show an identical image at an identical
      // snap alignment, so this renders as no change at all. A smooth scroll here would BE
      // the visible flick this whole mechanism exists to avoid.
      el.scrollTo({ left: target * el.clientWidth, behavior: 'auto' })
      setTrackPos(target)
    }

    /*
     * `scrollend` is Safari 18+ / Chrome 114+. Where it exists it is exact; where it does not
     * — an XS Max on an older iOS is squarely in scope — a quiet period is the best available
     * proxy, and being late is harmless because the wrap is invisible either way.
     *
     * Detected on `window` and stored as a BOOLEAN rather than tested inline on `el`:
     * TypeScript's `lib.dom` has no `onscrollend` on HTMLDivElement, so `if ('onscrollend' in
     * el)` narrows `el` to `never` inside the branch and every DOM call on it fails to compile.
     */
    const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window

    if (supportsScrollEnd) {
      el.addEventListener('scrollend', settle)
      return () => el.removeEventListener('scrollend', settle)
    }

    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, SETTLE_DEBOUNCE_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
    }
  }, [wrap, count])

  /*
   * A delete shortens `photos` under us, and the stored position can survive that as a position
   * that is still IN RANGE but is now a sentinel. Concretely: three photos, viewing the third at
   * track 3 of [C,A,B,C,A]; delete it and the track becomes [B,A,B,A] where 3 is the trailing
   * clone. The counter is right, the image is right, and a forward swipe has nowhere to go until
   * something scrolls.
   *
   * SCROLLS ONLY — NO setState. `handleScroll` picks the new position up through the normal path
   * one frame later, which is both what `react-hooks/set-state-in-effect` is asking for and
   * simpler than keeping two sources of truth for where the scroller is.
   *
   * Gated on the count SHRINKING, via a ref rather than on `trackPos`: running this on every
   * swipe would re-scroll during momentum, which is exactly what the settle handler above goes
   * out of its way not to do.
   */
  const prevCount = useRef(count)
  useEffect(() => {
    const shrank = count < prevCount.current
    prevCount.current = count
    if (!shrank || count === 0) return
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    // Land on a REAL slide, never a sentinel.
    const safe = Math.min(realIndexFor(trackPos, count), count - 1)
    el.scrollTo({ left: trackIndexFor(safe, count) * el.clientWidth, behavior: 'auto' })
  }, [count, trackPos])

  // `copied` and `error` are transient acknowledgements. `manual` is not: it is the URL the
  // user still has to copy by hand, so it stays until they dismiss it.
  useEffect(() => {
    if (status?.kind !== 'copied' && status?.kind !== 'error') return
    /*
     * `setRawStatus`, not the `setStatus` wrapper: the wrapper is a plain function redefined on
     * every render, so listing it as a dependency would re-arm this timer on every render and
     * omitting it is a lint warning. The raw useState setter is stable, and clearing
     * unconditionally is right — this effect only runs while a clearable status is showing.
     */
    const timer = window.setTimeout(() => setRawStatus(null), STATUS_CLEAR_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  /* ── download: fetch the bytes, then let the OS put them in Photos ────────────────────
     THE ACTIVATION TRAP, and `ShareButton` already paid for this lesson: `navigator.share()`
     must be called while the user gesture is still live, and WebKit's activation window is
     consumed by awaiting an unrelated promise. `onClick={async () => { await fetch(...);
     navigator.share() }}` works on wifi and throws NotAllowedError on cellular — i.e. it
     fails exactly when the user is out at dinner, which is the whole use case.

     So the fetch is WARMED on pointerdown, which fires before click, and the result is cached
     per photo id. By the time the click handler runs the File is normally already resolved and
     `share()` is called with the gesture intact.                                            */

  const fileCache = useRef(new Map<string, Promise<File>>())

  const fileFor = useCallback((photo: ViewablePhoto): Promise<File> => {
    const cached = fileCache.current.get(photo.id)
    if (cached) return cached
    const promise = fetch(photo.blobUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`blob responded ${res.status}`)
        const blob = await res.blob()
        return new File([blob], downloadNameFor(photo), { type: blob.type || 'image/jpeg' })
      })
      .catch((err: unknown) => {
        fileCache.current.delete(photo.id) // let the next tap retry
        throw err
      })
    fileCache.current.set(photo.id, promise)
    return promise
  }, [])

  const warmDownload = useCallback(() => {
    if (!current) return
    void fileFor(current).catch(() => {})
  }, [current, fileFor])

  async function handleDownload() {
    if (!current || busy) return
    setBusy('download')
    try {
      const file = await fileFor(current)
      /*
       * ════════════════════════════════════════════════════════════════════════
       *  THE SHEET IS FOR TOUCH DEVICES ONLY, and the `pointer: coarse` test is the whole
       *  reason. Card 1a asks to "save the image to user's gallery", and on iOS the OS share
       *  sheet is the ONLY route a web page has to the Photos library — `<a download>` there
       *  lands in Files, not Photos. So on a phone the sheet is not a detour, it is the feature.
       *
       *  On a DESKTOP it is a detour, and shipping it there was a real bug: Chrome on
       *  Windows/ChromeOS implements `navigator.share({ files })` perfectly well, so a download
       *  button opened a share dialog instead of saving a file. Someone pressing a download
       *  arrow on a laptop wants the file on disk, full stop.
       *
       *  `(pointer: coarse)` rather than a user-agent test: it asks the question we actually
       *  mean — is the primary input a finger — and it needs no list of platform strings to keep
       *  up to date. A phone and a tablet are coarse; a mouse or trackpad is fine.
       *
       *  BOTH CHECKS STAY INSIDE THE HANDLER, never at render. Branching what is RENDERED on a
       *  navigator or media capability is a hydration mismatch — the trap `ShareButton`
       *  documents — so the glyph is identical on the server, on a laptop and on an iPhone, and
       *  only the behaviour differs.
       * ════════════════════════════════════════════════════════════════════════
       */
      const touchFirst = window.matchMedia?.('(pointer: coarse)').matches ?? false
      if (
        touchFirst &&
        typeof navigator !== 'undefined' &&
        navigator.canShare?.({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file] })
          // The OS sheet already gave feedback. A pill on top of it is noise.
          return
        } catch (err) {
          // A dismissed sheet is a user choice, not a failure. Say nothing, do nothing.
          if (isAbortError(err)) return
          // Anything else — activation expired, a permissions policy — falls to the anchor.
        }
      }
      saveByAnchor(file)
    } catch {
      setStatus({ kind: 'error', message: COPY.downloadFailed })
    } finally {
      setBusy(null)
    }
  }

  /* ── share: mint the photo-only link and copy it ──────────────────────────────────────
     Warmed for the same reason as the download, and it matters more here: the clipboard API
     ALSO requires transient activation (see lib/share/clipboard.ts), so a cold mint would
     spend the gesture on a round trip and then fail to copy.                               */

  const urlCache = useRef(new Map<string, Promise<string>>())

  const urlFor = useCallback(
    (photo: ViewablePhoto): Promise<string> => {
      const cached = urlCache.current.get(photo.id)
      if (cached) return cached
      const promise = onShare!(photo).catch((err: unknown) => {
        urlCache.current.delete(photo.id)
        throw err
      })
      urlCache.current.set(photo.id, promise)
      return promise
    },
    [onShare],
  )

  const warmShare = useCallback(() => {
    if (!onShare || !current) return
    void urlFor(current).catch(() => {})
  }, [onShare, current, urlFor])

  async function handleShare() {
    if (!onShare || !current || busy) return
    setBusy('share')
    try {
      const url = await urlFor(current)
      if (await copyText(url)) setStatus({ kind: 'copied' })
      else setStatus({ kind: 'manual', url })
    } catch {
      setStatus({ kind: 'error', message: COPY.shareFailed })
    } finally {
      setBusy(null)
    }
  }

  /* ── delete ──────────────────────────────────────────────────────────────────────────── */

  const handleDelete = () => {
    if (!onDelete || !current) return
    startTransition(async () => {
      await onDelete(current)
      setConfirming(false)
      // Nothing left to look at. `onClose` is always present wherever `onDelete` is — only the
      // public read-only page omits it — but the guard keeps that an assumption the type checks.
      if (count <= 1) onClose?.()
    })
  }

  return (
    <div
      /*
       * `inset-x-0`, NOT `inset-0`: `top` and `height` are both set below, and adding `bottom: 0`
       * would over-constrain the box — the browser then silently drops one of the three, which
       * is not a thing to leave to chance on the property that decides whether the controls are
       * on screen.
       */
      className="fixed inset-x-0 z-50 bg-photo-void"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} dari ${count}`}
      /* See the docblock at the top of this component. 100dvh is the fallback, never the answer:
         it tracks the layout viewport, which iOS does not shrink for browser chrome. */
      style={{
        top: 'var(--vv-top, 0px)',
        height: 'min(var(--app-h, 100dvh), 100dvh)',
      }}
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
        {cells.map((cell) =>
          cell.clone ? (
            <Sentinel key={cell.key} photo={cell.photo} />
          ) : (
            <Slide
              key={cell.key}
              photo={cell.photo}
              active={cell.trackPos === trackPos}
              /* Render the immediate neighbours eagerly, so a swipe is never a grey box —
                 measured in TRACK space, which is what covers the swipe across a sentinel. */
              eager={isEager(cell.trackPos, trackPos)}
              onDismiss={onClose}
              onZoomChange={(z) => {
                if (cell.trackPos === trackPos) setZoomed(z)
              }}
            />
          ),
        )}
      </div>

      {/* ── chrome ─────────────────────────────────────────────────────────────────────── */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-3 pb-3"
        /* env() is a no-op without viewport-fit=cover in the root layout; F10 sets it, so
           these keep the counter and ✕ clear of the notch on an XS Max. */
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="rounded-full bg-yellow px-3 py-1 tabular text-action text-[#0d0d0d]">
          {index + 1} / {count}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={COPY.close}
            className="pointer-events-auto grid size-touch press place-items-center rounded-full bg-white/15 text-white"
          >
            <CloseIcon />
          </button>
        )}
      </header>

      {/* Unconditional: `download` needs no prop, so every caller gets at least one control. */}
      <footer
        /*
         * `pb-5.5` (22px), NOT the `pb-2` this shipped with. `Toast` draws the distinction and I
         * had it backwards: "a FLOATING pill, so the 8px edge rule applies to its own bottom
         * edge rather than to a line of type inside a full-bleed bar: 22px keeps the whole
         * capsule clear of the home indicator." This cluster is a floating pill, not a bar —
         * nothing here bleeds to the edge — so 8px put three 44px circles down onto the XS Max's
         * home indicator instead of clear of it.
         *
         * RIGHT-aligned, per the card: on a 414px screen the bottom-right corner is where a
         * right thumb already rests.
         */
        className="absolute inset-x-0 bottom-0 flex flex-col items-end gap-2 px-3 pt-3 pb-5.5"
      >
        {status && <StatusSlot status={status} onDismiss={() => setStatus(null)} />}

        {confirming ? (
          <div className="flex w-full items-center justify-end gap-3">
            {/*
                Not the design-system <Button>: every variant there is coloured for `paper`,
                and this footer floats over a true-black photo surround. Same geometry
                (h-touch, 12px/800 Title Case) with the two colours this context needs.
              */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="h-touch press rounded-field bg-red px-5 text-action text-white disabled:opacity-60"
            >
              {pending ? COPY.deleting : COPY.deleteConfirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-touch press rounded-field bg-white/15 px-5 text-action text-white"
            >
              {COPY.cancel}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <ClusterButton
              label={COPY.download}
              busy={busy === 'download'}
              onPointerDown={warmDownload}
              onClick={handleDownload}
            >
              <DownloadIcon />
            </ClusterButton>

            {onShare && (
              <ClusterButton
                label={COPY.share}
                busy={busy === 'share'}
                onPointerDown={warmShare}
                onClick={handleShare}
              >
                <ShareIcon />
              </ClusterButton>
            )}

            {onDelete && (
              <ClusterButton label={COPY.delete} onClick={() => setConfirming(true)}>
                <TrashIcon />
              </ClusterButton>
            )}
          </div>
        )}
      </footer>
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
  photo: ViewablePhoto
  active: boolean
  eager: boolean
  /**
   * Omitted on `/f/[token]` (F12). A single tap then does nothing at all — no dismiss, and
   * deliberately no alternative, because on the public page there is no view behind this one
   * to return to.
   */
  onDismiss?: () => void
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
    /*
     * touch-action moves WITH the zoom, and getting this wrong breaks paging outright — see the
     * note on the element below. At 1x the browser must be allowed to use a horizontal drag for
     * the snap track; once zoomed, it must not, because we are panning the image ourselves.
     *
     * Written here rather than through React for the same reason as the transform: this runs
     * inside a 60 Hz gesture, and a setState per frame is the difference between smooth and
     * visibly laggy on an XS Max.
     */
    el.style.touchAction = scale > 1 ? 'none' : 'pan-x'
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
          if (lastTapAt === now && scaleAtTap === 1) onDismissRef.current?.()
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
        /*
         * ════════════════════════════════════════════════════════════════════════
         *  `pan-x`, NOT `none`. THIS ONE VALUE DECIDES WHETHER SWIPING WORKS AT ALL.
         *
         *  It was `none` from F06 until F12, with the comment "hands every touch to the
         *  handlers above; without it Safari claims the pinch for the page". The second half is
         *  true. The first half is the bug: per spec, `touch-action: none` means the browser
         *  performs NO default touch behaviour for a touch starting on this element — and that
         *  includes SCROLLING AN ANCESTOR SCROLL CONTAINER. The scroll-snap track is an
         *  ancestor. So a one-finger horizontal swipe beginning on the photo never paged.
         *
         *  WHY NOBODY CAUGHT IT: the image is `object-contain`, so a portrait receipt on a
         *  wider viewport leaves letterbox bars, and a swipe on THOSE hits the host div — which
         *  sets no touch-action — and pages perfectly. It is only broken where it matters: a
         *  phone held in portrait, where the photo fills nearly the full width and there is
         *  almost no bar left to grab.
         *
         *  `pan-x` allows exactly the one default behaviour we want (horizontal panning, i.e.
         *  the snap track) and still withholds `pinch-zoom`, so Safari does not page-zoom —
         *  which is what the original comment was actually protecting against. The two-finger
         *  handler calls preventDefault in a non-passive listener regardless.
         *
         *  It flips to `none` while zoomed, in `apply()` above: at >1x a one-finger drag is our
         *  pan, and letting the track have it would flick to the next photo mid-inspection.
         * ════════════════════════════════════════════════════════════════════════
         */
        style={{ transformOrigin: 'center center', touchAction: 'pan-x' }}
      />
    </div>
  )
}

/* ── chrome pieces ─────────────────────────────────────────────────────────────────────── */

/**
 * One circle in the floating cluster. The label is the `aria-label` and never visible: three
 * words across the bottom of a 414px screen would cover the photo they are acting on, and the
 * word survives where it matters — for a screen reader and for voice control.
 */
function ClusterButton({
  label,
  busy = false,
  onClick,
  onPointerDown,
  children,
}: {
  label: string
  busy?: boolean
  onClick: () => void
  onPointerDown?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-busy={busy || undefined}
      className="grid size-touch press place-items-center rounded-full bg-white/15 text-white disabled:opacity-60"
    >
      {children}
    </button>
  )
}

/**
 * The one feedback slot, above the cluster.
 *
 * NOT the app's `Toast` (F12): the toast is a sibling of the whole app inside `ToastProvider`,
 * so it does paint above this overlay — but `--toast-bottom` puts it 22px off the bottom edge,
 * centred, which on a 414px screen is directly on top of the cluster it would be reporting
 * about. A slot inside the Lightbox's own chrome has no overlap to manage, no z-index to win,
 * and no `paper` colours to drag over a black surround.
 */
function StatusSlot({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (status.kind === 'manual') {
    return (
      <div className="flex w-full items-center gap-2">
        {/*
          Read-only and selected on focus, so the fallback is long-press → Copy. NOT the design
          system's `Input`, which is coloured for `paper` — but the 17px floor it exists to
          carry is reproduced here, because that is what stops Safari zooming the viewport the
          moment this gets focus.
        */}
        <input
          readOnly
          value={status.url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={COPY.copyByHand}
          className="min-w-0 flex-1 rounded-field bg-white/15 px-3 py-2 tabular text-[17px] text-white"
        />
        <button
          type="button"
          onClick={onDismiss}
          aria-label={COPY.close}
          className="grid size-touch shrink-0 press place-items-center rounded-full bg-white/15 text-white"
        >
          <CloseIcon />
        </button>
      </div>
    )
  }

  return (
    <p
      role="status"
      className={
        status.kind === 'error'
          ? 'rounded-field bg-red px-3 py-1.5 text-action text-white'
          : 'rounded-field bg-yellow px-3 py-1.5 text-action text-[#0d0d0d]'
      }
    >
      {status.kind === 'error' ? status.message : COPY.copied}
    </p>
  )
}

/**
 * A wrap sentinel: the same bytes as a real slide, none of the behaviour.
 *
 * It exists so the scroller has somewhere to go past the ends (lib/photos/carousel.ts). It is
 * on screen for the length of one settle, is replaced by its real twin before anyone can touch
 * it, and is `aria-hidden` because it is the same photo announced twice.
 */
function Sentinel({ photo }: { photo: ViewablePhoto }) {
  return (
    <div
      aria-hidden="true"
      className="relative grid h-full w-full shrink-0 grow-0 basis-full place-items-center overflow-hidden"
      style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.blobUrl}
        alt=""
        draggable={false}
        /* Eager, always: this is the frame the wrap gesture lands on, and the browser already
           has the bytes — its real twin is one slide away and was rendered by `isEager`. */
        loading="eager"
        decoding="async"
        className="max-h-full max-w-full object-contain select-none"
      />
    </div>
  )
}

/** WebKit reports a dismissed share sheet as AbortError. That is a user choice, not a failure. */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * The filename the user ends up with.
 *
 * Derived from the blob URL rather than from `blobPathname`, which is why `ViewablePhoto` does
 * not need that field: a Vercel Blob URL ends in exactly that pathname
 * (`…/photos/<id>-<suffix>.jpg`), so the basename is already unique and already carries the
 * right extension. Inventing one would risk `.jpg` on a PNG, which some Android download
 * managers refuse to open.
 */
function downloadNameFor(photo: ViewablePhoto): string {
  let base: string | undefined
  try {
    base = new URL(photo.blobUrl).pathname.split('/').pop()
  } catch {
    base = undefined // not an absolute URL — fall through to the generated name
  }
  return base && /\.[a-z0-9]{2,5}$/i.test(base) ? base : `foto-${photo.id}.jpg`
}

/**
 * The direct path: every desktop browser, plus a touch device whose share sheet refused or
 * whose activation expired.
 *
 * On a desktop this is the CORRECT primary behaviour, not a fallback — see the pointer test in
 * `handleDownload`. On iOS, reached only after the sheet declined, it lands in Files › Downloads
 * rather than Photos, which is the honest degradation.
 */
function saveByAnchor(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking synchronously cancels the download in WebKit — the URL has to outlive the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
