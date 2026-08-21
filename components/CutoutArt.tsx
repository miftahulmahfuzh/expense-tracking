/**
 * THE WALLPAPER. Five cut-out creatures scattered behind the whole app.
 *
 * This is the layer that makes the design read as a poster rather than as a form: the
 * screens are flat blocks of white and colour, and the art is what fills the grey between
 * them. It sits behind every screen in both route groups — see `AppShell` — and the sign-in
 * screen lays two more on top of its pink plate (`variant="signin"`).
 *
 * CUTOUTS, NOT SQUARES. The "04 App Prototype (Cutout Art)" pull differs from "03" by
 * exactly ten characters: every `assets/<creature>.png` became `assets/<creature>-cut.png`.
 * The art is the same; the white plate behind it is gone. That matters here more than it did
 * on the canvas, because these sit on `paper` in light mode and on TRUE BLACK in dark, and a
 * white square would have been a white square on black.
 *
 * PAINTED AS `background-image`, NOT AS `<img>`, for three reasons that all matter:
 *  - Decorative art has no place in the accessibility tree at all, and a CSS background is
 *    invisible to it by construction — no `alt=""` to forget, no `role` to argue about.
 *  - A missing file paints NOTHING. An `<img>` with a broken `src` paints a broken-image
 *    glyph in the middle of the page. The art ships separately from the code (see
 *    docs/design/DESIGN_INTEGRATION.md), so "not there yet" has to degrade to "plain grey
 *    page", never to five broken icons.
 *  - `background-size: contain` scales the art to a box we control, so one file serves
 *    every device pixel ratio without a `srcset`.
 *
 * GEOMETRY. The canvas is 414x896 and the positions below are lifted from it verbatim, in
 * px, anchored to the TOP of the column. They are deliberately NOT responsive: this is
 * scatter, so a creature landing 40px lower on a taller phone is not a layout bug, it is the
 * same scatter. Several are placed partly outside the column on purpose and the parent
 * clips them — a creature cropped by the page edge is the point of the composition.
 *
 * SCALE is the one knob. It grows every creature ABOUT ITS OWN CENTRE, so the scatter keeps
 * its shape and only the creatures get bigger — scaling the offsets too would drift the
 * whole composition down and to the right. The installed PNGs are 1000px on the long edge,
 * which is past 2x even at the largest size here, so turning this up costs no sharpness.
 *
 * IT IS PER VARIANT, and the sign-in one stays at the design's own size on purpose. The page
 * layer is wallpaper — it lives behind opaque cards and can be as loud as it likes. The
 * sign-in layer is a COMPOSITION: the design put the snake and the sheep exactly where they
 * frame the wordmark and clear the two lines of copy under the button, and scaling it up
 * walks the sheep's wool straight under "expensetracking.online", which is cream type on
 * cream wool. Loud wallpaper, composed sign-in.
 */
const SCALE: Record<CutoutVariant, number> = {
  page: 1.35,
  signin: 1,
}

export type CutoutVariant = 'page' | 'signin'

interface Cutout {
  /** File in `public/art/`, without the extension. */
  name: string
  /** Canvas coordinates, 414x896, top-left of the box. `left` may be negative. */
  left: number
  top: number
  width: number
  rotate: number
}

/**
 * The five behind every screen.
 *
 * RE-SCATTERED from the canvas, on purpose. The design's arrangement was composed against a
 * mock with one screenful of content; these positions are the same five creatures re-placed
 * against the real app. Three changes from "04 App Prototype":
 *
 *  - MOUNTAIN is dead centre now rather than right of it. It is the one landscape-shaped
 *    creature, so it anchors the composition and the other four orbit it.
 *  - SNAKE AND SHEEP TRADE PLACES. The snake takes the top right and the sheep the bottom
 *    left. Each keeps its own width — this is a swap of position, not of size.
 *  - THE SNAKE SITS LOWER than the sheep did, so its head clears the month header's white
 *    band instead of being cut in half by it.
 *
 * The sheep is cropped by the left edge at the bottom, which is intended: the rose is on the
 * sheep's right-hand side, so what survives the crop is the half worth seeing.
 */
const PAGE: Cutout[] = [
  { name: 'dragon', left: -110, top: 140, width: 280, rotate: -16 },
  // +15%: 220 -> 253, re-anchored so the extra size grows about its own centre (368, 220)
  // rather than pushing the snake down and right off the corner.
  { name: 'snake', left: 242, top: 94, width: 253, rotate: 18 },
  // Centred measured AFTER the 1.35x growth: the scaled box is 351px, so 77/318 puts its
  // middle on 207/448 — the middle of the 414x896 canvas.
  { name: 'mountain', left: 77, top: 318, width: 260, rotate: 7 },
  // +20%: 230 -> 276, grown about its centre (377, 729).
  { name: 'octopus', left: 239, top: 591, width: 276, rotate: -14 },
  /*
   * +20% (200 -> 240), +15deg clockwise (10 -> 25), and 1.5cm toward the middle of the
   * canvas. CSS fixes 1cm at 96/2.54 px, so 1.5cm is 57px, walked along the vector from the
   * sheep's own centre to (207, 448) — 0.537/-0.844 normalised, i.e. +31 across and -48 up.
   * Growth is applied about the centre first, so the two moves do not compound.
   */
  { name: 'sheep', left: -73, top: 580, width: 240, rotate: 25 },
]

/**
 * The two on the pink sign-in plate, which covers the page layer.
 *
 * The sheep is 76px BELOW where the canvas puts it (630), and that is a deliberate
 * correction rather than a transcription error. The design's sign-in ends at
 * "expensetracking.online"; this screen carries one more line under it — "Datamu privat.
 * Cuma kamu yang lihat." — which the app had before the revamp and which is worth keeping.
 * At the canvas position the sheep's face and the rose sit directly behind that line, cream
 * and red under grey type. One more line of copy needs one more line of clearance.
 */
const SIGNIN: Cutout[] = [
  { name: 'snake', left: 246, top: 70, width: 250, rotate: 16 },
  { name: 'sheep', left: -76, top: 706, width: 240, rotate: -12 },
]

export function CutoutArt({ variant = 'page' }: { variant?: CutoutVariant }) {
  const art = variant === 'signin' ? SIGNIN : PAGE
  const scale = SCALE[variant]

  return (
    <div
      aria-hidden="true"
      // `absolute inset-0` inside the column, not `fixed`: the art belongs to the page, and a
      // fixed layer would sit still while the month list scrolled over it, which reads as a
      // rendering fault rather than as parallax. `overflow-hidden` is what crops the four
      // creatures that hang off the edges.
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {art.map((c, i) => {
        const size = Math.round(c.width * scale)
        // Half the growth, taken off the origin, keeps the centre where the design put it.
        const shift = Math.round((size - c.width) / 2)
        return (
          <span
            // Two `sheep` can appear in one variant's list in principle, so the index is part
            // of the key rather than the name alone.
            key={`${c.name}-${i}`}
            className="absolute bg-contain bg-no-repeat"
            style={{
              left: c.left - shift,
              top: c.top - shift,
              width: size,
              // Square boxes: every source file is square, and `contain` letterboxes inside
              // whatever we give it, so height must track width or the art floats in its box.
              height: size,
              transform: `rotate(${c.rotate}deg)`,
              backgroundImage: `url(/art/${c.name}.png)`,
            }}
          />
        )
      })}
    </div>
  )
}
