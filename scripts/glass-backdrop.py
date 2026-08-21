#!/usr/bin/env python3
"""Measure what the wallpaper puts behind a frosted surface. Regenerates GLASS_BACKDROP.

Run:  python3 scripts/glass-backdrop.py          # needs Pillow + numpy

This is NOT part of the gate. `scripts/palette-check.py` is stdlib-only and fast enough to
run on every change; decoding five 1000px PNGs and Gaussian-blurring them is neither. So this
script measures the two numbers that the art contributes, prints them as a paste-ready block,
and palette-check.py carries them as constants — the same arrangement as the token hexes,
which are also transcribed by hand from globals.css and re-checked when they move.

RE-RUN IT WHEN, and only when, one of these changes:
  · a PNG in public/art/ is replaced or re-exported
  · CutoutArt's SCALE or any creature's `width` moves (the blur is in CSS px, so the render
    size decides how much of a creature one blur radius covers)
  · --glass-blur moves off 14px

WHAT IT COMPUTES. For each creature: composite the PNG over the page colour at the size it is
actually painted at, Gaussian-blur it by the CSS blur radius, and find the extreme pixel. The
LIGHT minimum governs dark text on a light glass tint; the DARK maximum governs light text on
a dark one. Both are worst-case over every pixel of every creature, which is stricter than any
real screen — a creature is never behind every card at once — and deliberately so: the scatter
is not responsive (R-136), so which card lands on which creature is a function of the device
height and the length of the month.

IT REPORTS AN RGB TRIPLE, not a luminance, because alpha compositing happens per channel in
sRGB and a luminance would have to be turned back into a neutral grey to be usable — which is
wrong for a saturated pixel. Reporting the pixel lets palette-check.py composite it exactly.
Picking the pixel by its own luminance is safe: compositing a fixed tint over it is an affine
map per channel with a positive coefficient, and luminance rises monotonically in every
channel, so the darkest backdrop pixel is also the darkest composite for any tint and alpha.

The blur is modelled as a Gaussian of sigma = the CSS radius, which is what `blur()` specifies.
Real UA implementations approximate it with three box passes; the difference is a fraction of
a percent of luminance and lands on the safe side here, because a truer Gaussian preserves
slightly more of the extremes than three box passes do.
"""

import sys

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover - developer tool
    sys.exit('needs Pillow and numpy:  pip install pillow numpy')

# From app/globals.css §1.
PAPER = (0xE9, 0xE9, 0xE6)
BLACK = (0x00, 0x00, 0x00)
GLASS_BLUR = 14  # --glass-blur, in CSS px

# From components/CutoutArt.tsx: PAGE[].width, times SCALE['page'].
SCALE = 1.35
WIDTHS = {'dragon': 280, 'snake': 253, 'mountain': 300, 'octopus': 240, 'sheep': 260}


def linear(a: np.ndarray) -> np.ndarray:
    c = a / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb: np.ndarray) -> np.ndarray:
    lin = linear(rgb)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def blurred_backdrop(name: str, base: tuple[int, int, int]) -> np.ndarray:
    """One creature over `base`, at render size, blurred by the glass radius. H*W*3 sRGB."""
    im = Image.open(f'public/art/{name}.png').convert('RGBA')
    w = round(WIDTHS[name] * SCALE)
    im = im.resize((w, max(1, round(im.height * w / im.width))), Image.Resampling.LANCZOS)

    a = np.asarray(im, dtype=float)
    rgb, alpha = a[..., :3], a[..., 3:] / 255.0
    composited = rgb * alpha + np.array(base, dtype=float) * (1 - alpha)

    # Blur in 8-bit sRGB, which is what a UA does — not in linear light. Blurring in linear
    # would be more correct optically and would report a MORE extreme pixel, so matching the
    # browser here is not the lenient choice.
    blurred = Image.fromarray(composited.astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(GLASS_BLUR)
    )
    return np.asarray(blurred, dtype=float)


def extreme(name: str, base: tuple[int, int, int], darkest: bool) -> tuple[int, int, int]:
    px = blurred_backdrop(name, base).reshape(-1, 3)
    lum = luminance(px)
    i = int(lum.argmin() if darkest else lum.argmax())
    return tuple(int(v) for v in px[i])  # type: ignore[return-value]


def main() -> int:
    def hexs(c: tuple[int, int, int]) -> str:
        return '#{:02x}{:02x}{:02x}'.format(*c)

    worst = {}
    print(f'{"creature":10} {"light darkest":>16} {"dark brightest":>16}')
    print('-' * 44)
    for name in WIDTHS:
        lo = extreme(name, PAPER, darkest=True)
        hi = extreme(name, BLACK, darkest=False)
        print(f'{name:10} {hexs(lo):>16} {hexs(hi):>16}')
        if 'light' not in worst or luminance(np.array(lo, float)) < luminance(
            np.array(worst['light'], float)
        ):
            worst['light'] = lo
        if 'dark' not in worst or luminance(np.array(hi, float)) > luminance(
            np.array(worst['dark'], float)
        ):
            worst['dark'] = hi

    print()
    print('paste into scripts/palette-check.py:')
    print()
    print('GLASS_BACKDROP = {')
    print(f"    'light': '{hexs(worst['light'])}',  # darkest the wallpaper goes under glass")
    print(f"    'dark': '{hexs(worst['dark'])}',  # brightest it goes on true black")
    print('}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
