/**
 * Scrolling something into view when a sticky bar is sitting on top of the view.
 *
 * WHY `scrollIntoView` IS NOT ENOUGH. `/new` and `/e/[id]` both put their primary action in a
 * `sticky bottom-0` bar INSIDE the scroll pane (see `new/StickyBar.tsx`), so the bottom of
 * that pane is permanently covered. The browser knows nothing about it: `block: 'center'`
 * centres in the pane's full height and `block: 'nearest'` counts the pane's bottom edge as
 * visible, so both of them happily park a focused field underneath the bar. On a
 * keyboard-shrunk viewport the bar was measured at 138 of the pane's 344px — 40% — which is
 * how a newly added item row ended up with its category chip and amount field behind Simpan.
 *
 * `scroll-padding-bottom` is the CSS answer and is not used here on purpose: it is ignored by
 * `block: 'center'`, Safari's honouring of it in `scrollIntoView` has been unreliable, and the
 * bar's height is not a constant — it grows a line when a validation summary appears. Reading
 * the bar's own rect is exact, needs no ResizeObserver and is the same number the user sees.
 */

/** Breathing room kept between the revealed row and both edges of the visible band. */
export const REVEAL_MARGIN = 8

export type RevealGeometry = {
  /** Top edge of the scroll pane, in client coordinates. */
  paneTop: number
  /**
   * The first occluded y: the sticky bar's top edge, or the pane's own bottom when the pane
   * has no bar. Both are read from a live rect, so a pinned bar and a bar still in flow at
   * the end of a short list give the correct answer without a special case.
   */
  occlusionTop: number
  /** The row to reveal — the whole `<li>`, not the field, so the amount line comes with it. */
  rowTop: number
  rowBottom: number
  margin: number
}

/**
 * How far to scroll the pane so `row` sits inside the band the user can actually see.
 * Positive scrolls content up. Zero means the row is already clear — do nothing, because a
 * gratuitous scroll on every keystroke-triggered re-render reads as the page fighting you.
 *
 * Pure, and separated from the DOM for exactly that reason: this is the part with the
 * off-by-one risk, and `lib/scroll/__tests__` exercises it against the geometry measured off
 * the original bug report rather than against a browser.
 */
export function revealDelta({
  paneTop,
  occlusionTop,
  rowTop,
  rowBottom,
  margin,
}: RevealGeometry): number {
  const firstVisible = paneTop + margin
  const lastVisible = occlusionTop - margin

  let delta = 0
  if (rowBottom > lastVisible) delta = rowBottom - lastVisible
  /*
   * Clamp AFTER the lift, not before. A row taller than the visible band cannot satisfy both
   * edges, and the top wins: the name input and its error message are up there, and pushing
   * them off the top of the pane to reveal the amount field would be a worse bug than the one
   * being fixed.
   */
  if (rowTop - delta < firstVisible) delta = rowTop - firstVisible

  return Math.round(delta)
}

/**
 * Apply {@link revealDelta} to a real row.
 *
 * `bar` is the sticky footer, or null for a pane without one. Pass the ROW element (the
 * `<li>`), not the focused input — the caller owns the markup and therefore owns which
 * ancestor counts as the row.
 *
 * `behavior` is 'smooth' for a deliberate jump the user asked for (tapping Simpan and being
 * sent to the offending field) and 'auto' for a correction they did not (the keyboard opening
 * and moving the bar under their feet): visualViewport fires resize repeatedly through the
 * keyboard animation, and a smooth scroll queued per event reads as a stutter.
 */
export function revealAboveBar(
  row: HTMLElement,
  bar: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
): void {
  const pane = row.closest('.scroll-pane')
  if (!(pane instanceof HTMLElement)) {
    // No pane means the document itself scrolls, and then there is no sticky bar to dodge.
    row.scrollIntoView({ block: 'center', behavior })
    return
  }

  const paneBox = pane.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()

  const delta = revealDelta({
    paneTop: paneBox.top,
    occlusionTop: bar ? bar.getBoundingClientRect().top : paneBox.bottom,
    rowTop: rowBox.top,
    rowBottom: rowBox.bottom,
    margin: REVEAL_MARGIN,
  })

  // scrollBy clamps to the pane's own range, so no bounds check is needed here.
  if (delta !== 0) pane.scrollBy({ top: delta, behavior })
}
