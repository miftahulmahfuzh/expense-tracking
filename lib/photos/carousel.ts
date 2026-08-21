/**
 * The wrap-around maths for the Lightbox's photo track — F12 §3.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  WHY SENTINEL CLONES AND NOT A GESTURE REWRITE.
 *
 *  `Lightbox` chose CSS scroll-snap over a JS pager on purpose, and its docblock is emphatic:
 *  "Native momentum, native rubber-banding, native velocity. Better than any JS gesture
 *  library, in six lines." Wrapping is the one thing native paging cannot do, because there
 *  is nothing past the last slide to scroll to.
 *
 *  So we give it something. The track renders
 *
 *      [ Gn ]   G1   G2   G3   …   Gn   [ G1 ]
 *        ↑                                 ↑
 *      clone of last                clone of first
 *
 *  and the moment the scroller SETTLES on a clone we jump to its real twin with
 *  `behavior: 'auto'`. Both ends show an identical image at an identical snap alignment, so
 *  the jump renders as no change at all — and the alternative, hand-rolling transform paging,
 *  would have thrown away every word of that docblock to gain this.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pure and dependency-free so the arithmetic is unit-testable without a DOM, a scroller or a
 * touch. `lib/photos/__tests__/carousel.test.ts` covers n = 1, 2, 3, 7 — 2 is the interesting
 * one, because there the two clones outnumber nothing and the track is [B, A, B, A].
 */

/**
 * Does this photo count get sentinels at all?
 *
 * A single photo does NOT. There is nothing to wrap to, `overflow-x` has nothing to scroll,
 * and rendering the same image three times to achieve that would be two wasted decodes on the
 * most common case in the app — one receipt attached to one expense.
 */
export function isWrappable(count: number): boolean {
  return count > 1
}

/** How many cells the track renders: the photos, plus a leading and trailing sentinel. */
export function trackLength(count: number): number {
  return isWrappable(count) ? count + 2 : count
}

/** Where real photo `realIndex` sits in the track. The +1 is the leading sentinel. */
export function trackIndexFor(realIndex: number, count: number): number {
  return isWrappable(count) ? realIndex + 1 : realIndex
}

/**
 * Which real photo is showing at track position `trackPos`.
 *
 * THE ONE LINE THAT FIXES THREE THINGS AT ONCE: the `n / total` counter, the eager-load hint
 * for neighbours, and the `active` flag each `Slide` uses to reset its own zoom. Before the
 * sentinels existed all three read the scroll position directly; each would have been off by
 * one, and the zoom-reset bug in particular would only show up as "the photo I pinched is
 * still zoomed when I come back to it".
 *
 * Position 0 is the leading clone, which shows the LAST photo; position count+1 is the
 * trailing clone, which shows the FIRST. The double modulo is for a negative intermediate.
 */
export function realIndexFor(trackPos: number, count: number): number {
  if (count <= 0) return 0
  if (!isWrappable(count)) return Math.min(Math.max(trackPos, 0), count - 1)
  return (((trackPos - 1) % count) + count) % count
}

/**
 * If the scroller has settled on a sentinel, the track position to jump to. `null` means
 * "stay where you are", which is every ordinary swipe.
 *
 * CALL THIS ON SETTLE, NEVER DURING MOMENTUM. Rewriting `scrollLeft` while a fling is still
 * decelerating fights the scroller: iOS keeps applying the remaining velocity from the NEW
 * offset, so the photo visibly jerks and can overshoot two slides. `scrollend` is the signal;
 * a debounce on `scroll` is the fallback where that event does not exist yet.
 */
export function wrapTarget(trackPos: number, count: number): number | null {
  if (!isWrappable(count)) return null
  if (trackPos === 0) return count // leading clone → the real last
  if (trackPos === count + 1) return 1 // trailing clone → the real first
  return null
}

/**
 * Render this cell's image eagerly?
 *
 * Immediate neighbours in TRACK space, so a swipe is never a grey box — including the swipe
 * that crosses a sentinel, which is exactly the one a `realIndex`-based check would miss.
 */
export function isEager(trackPos: number, activeTrackPos: number): boolean {
  return Math.abs(trackPos - activeTrackPos) <= 1
}
