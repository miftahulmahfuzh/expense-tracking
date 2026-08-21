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
 */

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

/** The five behind every screen. */
const PAGE: Cutout[] = [
  { name: 'dragon', left: -110, top: 140, width: 280, rotate: -16 },
  { name: 'sheep', left: 258, top: 34, width: 200, rotate: 18 },
  { name: 'mountain', left: 110, top: 410, width: 260, rotate: 7 },
  { name: 'octopus', left: 262, top: 614, width: 230, rotate: -14 },
  { name: 'snake', left: -84, top: 648, width: 220, rotate: 10 },
]

/** The two on the pink sign-in plate, which covers the page layer. */
const SIGNIN: Cutout[] = [
  { name: 'snake', left: 246, top: 70, width: 250, rotate: 16 },
  { name: 'sheep', left: -76, top: 630, width: 240, rotate: -12 },
]

export function CutoutArt({ variant = 'page' }: { variant?: CutoutVariant }) {
  const art = variant === 'signin' ? SIGNIN : PAGE

  return (
    <div
      aria-hidden="true"
      // `absolute inset-0` inside the column, not `fixed`: the art belongs to the page, and a
      // fixed layer would sit still while the month list scrolled over it, which reads as a
      // rendering fault rather than as parallax. `overflow-hidden` is what crops the four
      // creatures that hang off the edges.
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {art.map((c, i) => (
        <span
          // Two `sheep` can appear in one variant's list in principle, so the index is part
          // of the key rather than the name alone.
          key={`${c.name}-${i}`}
          className="absolute bg-contain bg-no-repeat"
          style={{
            left: c.left,
            top: c.top,
            width: c.width,
            // Square boxes: every source file is square, and `contain` letterboxes inside
            // whatever we give it, so height must track width or the art floats in its box.
            height: c.width,
            transform: `rotate(${c.rotate}deg)`,
            backgroundImage: `url(/art/${c.name}.png)`,
          }}
        />
      ))}
    </div>
  )
}
