# Cut-out art

Five decorative creatures, scattered behind every screen. Placed by
`components/CutoutArt.tsx`; positions and rotations are mirrored at the bottom of
`docs/design/tokens.css`.

## Expected files

    dragon.png    sheep.png    mountain.png    octopus.png    snake.png

Transparent PNG, roughly square. They are painted as `background-image` with
`background-size: contain`, so the intrinsic size does not matter — but the transparency
does: these sit on grey in light mode and on TRUE BLACK in dark, which is the whole point of
the design's "04 App Prototype (Cutout Art)" revision. Do not use the `03` artwork, which
has a white plate behind it.

## Where they come from

The Claude Design project `8c505e75-e97a-4c8e-b7c0-04aeb074bc7f`, as
`assets/<name>-cut.png`. They could not be pulled with the rest of the design — `DesignSync`
truncates a file at 256 KiB and each one is larger — so they are exported by hand. Save
them here WITHOUT the `-cut` suffix.

## If they are missing

Nothing breaks. A `background-image` that 404s paints nothing, the layer is `aria-hidden`
and `pointer-events-none`, and every screen keeps its plain `paper` background. That is
deliberate — see R-47 in `docs/design/DESIGN_INTEGRATION.md`.

## Before committing them

Compress hard. Five decorative images on a mobile-first app over an Indonesian mobile
connection is real weight, and the source files are >256 KiB each. `oxipng -o 4 --strip all`
or `pngquant --quality 65-85` typically takes these to a fraction of that with no visible
loss at the sizes they render (200–280 CSS px).
