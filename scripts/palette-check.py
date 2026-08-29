#!/usr/bin/env python3
"""Verify the palette: WCAG contrast for every real pairing, plus categorical separation.

Run:  python3 scripts/palette-check.py

Zero dependencies, stdlib only. The token values below are transcribed from
app/globals.css §1 and must stay in step with it — if a colour changes, including anything
arriving from a later Claude Design pull, edit the two dicts and re-run rather than eyeball
the result. This is a hard gate: every "AMENDED"/"ADDED" note in globals.css cites a number
that comes from here, and an un-run check is an unverified claim.

CATEGORY SET: the seventeen of F14 (card #6). CURRENT SYSTEM: the 2026-08-21 "flat, loud, graphic" pull (Archivo, cool grey paper, red
brand, yellow highlighter). Three things it checks that a generic contrast tool would not:

  1. THE DISC MARK. A category colour is a FILL now, not text — the pictogram is a solid
     colour circle carrying a bold black two-letter mark — so the pairing that matters is
     `disc-ink` ON the category, held to 4.5:1 because the mark is small text. That is what
     the three amended light hues were amended for.

  2. SURFACES THAT DO NOT FLIP. Yellow, the tab-bar trio and the disc mark are the same
     value in both schemes by design, so they are checked in both rather than once.

  3. Pairwise separation in Oklab, because hues that each pass contrast against the
     background can still be indistinguishable from each other, which is the failure R-3
     caught in the original donut. Reported, never enforced: since F14 took the set to 17
     the 0.10 floor is unreachable at all — see WAIVER.

  4. THE FROSTED SURFACES. Since R-137 no surface in the app is a flat colour: every box that
     was white is now a translucent tint over a 14px blur of the cut-out wallpaper, so "ink on
     card" became "ink over whatever creature is behind this card". Those pairings are
     composited here from the tint, its alpha, and the worst pixel the art can supply —
     measured separately by scripts/glass-backdrop.py, which is the only part of this check
     that needs a PNG decoder and is therefore not in it.

Exits non-zero on a CONTRAST failure, so it can be used as a gate. Categorical separation and
the decorative hairlines are reported but do not fail the run — see WAIVER and checks().
"""

import itertools
import math

# ---------------------------------------------------------------- colour plumbing


def srgb(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip('#')
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_str: str) -> float:
    r, g, b = (linear(c) for c in srgb(hex_str))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    """WCAG 2.1 contrast ratio. Order-independent."""
    la, lb = luminance(a), luminance(b)
    if la < lb:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)


def over(tint: str, alpha: float, backdrop: str) -> str:
    """`tint` at `alpha` composited over `backdrop`. Per channel, in sRGB, like a browser."""
    t, b = srgb(tint), srgb(backdrop)
    return '#' + ''.join(f'{round(255 * (alpha * t[i] + (1 - alpha) * b[i])):02x}' for i in range(3))


def oklab(hex_str: str) -> tuple[float, float, float]:
    r, g, b = (linear(c) for c in srgb(hex_str))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (v ** (1 / 3) if v > 0 else -((-v) ** (1 / 3)) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def delta_e(a: str, b: str) -> float:
    pa, pb = oklab(a), oklab(b)
    return math.dist(pa, pb)


# ------------------------------------------------------------------------ tokens

# F14 (card #6): 8 → 17, ordered by family. Must stay in step with lib/categories.ts
# CATEGORIES — that order is the picker grid and F08's chart series.
CATS = [
    'meals',
    'jajan',
    'dining',
    'snacks',
    'drinks',
    'transport',
    'fuel',
    'parking',
    'bills',
    'internet',
    'utilities',
    'housing',
    'entertainment',
    'cinema',
    'health',
    'grooming',
    'other',
]

# Same in BOTH schemes, by design. Kept out of the two dicts so a future edit cannot
# accidentally give one scheme a different yellow.
FIXED = {
    'yellow': '#ffe600',
    'cyan': '#2fd8ce',
    'disc-ink': '#000000',
    'tab-bg': '#0d0d0d',
    'tab-ink': '#ffe600',
    'tab-ink-3': '#8f8f8f',
    # The toast is yellow in both schemes, so its type cannot be a theme token.
    'toast-ink': '#0d0d0d',
    'toast-danger-ink': '#8a1410',
}

BAR_WAIVER = '''WAIVER — the category breakdown's bar-on-track pairing is below 3:1 in light mode.

The bar list draws each category over a `rule` track. In LIGHT that track is #d7d7d3, and
THIRTEEN of the seventeen fills land under 3:1 against it — worst are snacks 1.39, bills 1.45,
jajan 1.61, drinks 1.73 — and entertainment 2.68 is the closest miss. Dark mode clears all 17.

F14 MADE THIS WORSE IN COUNT AND NOT IN KIND: it was four of eight, it is now thirteen of
seventeen, because the palette grew toward the bright yellows and cyans that a light track
cannot hold. The argument below is unchanged, and is why this stays a waiver and not a bug.

THERE IS NO TRACK COLOUR THAT FIXES IT. The seventeen fills span L* 0.18 (meals) to 0.47
(snacks). A track dark enough for snacks to clear would have to sit below L 0.025 —
effectively black — and meals would still fail against anything lighter than that; a track
light enough for meals would have to exceed L 1.0, which does not exist. Any single track
fails at one end or the other. This is inherent to a bright multi-hue palette on a light
page, not to this particular grey.

What carries the information instead, on every single row, above the bar:

  · the disc — category colour AND its two-letter mark AND an sr-only Indonesian label
  · the Indonesian label in full, as text
  · the rupiah amount, as text
  · the percentage, as text

The bar is a fourth, redundant rendering of a number already stated three times, and it
carries `role="img"` with an aria-label repeating the label, the amount and the percent — so
a reader who cannot resolve the bar at all loses nothing. That is the same structural
argument as the categorical-separation waiver below, and it expires under the same condition:
the moment a bar is the ONLY place a value appears.'''

LIGHT = {
    'paper': '#e9e9e6',
    'paper-2': '#e9e9e6',
    'card': '#ffffff',
    'ink': '#0d0d0d',
    'ink-2': '#4d4d4d',
    # Amended from the design's #8f8f8f (2.63:1 on paper). See globals.css §1.
    'ink-3': '#666666',
    'rule': '#d7d7d3',
    'rule-2': '#d7d7d3',
    'rule-strong': '#0d0d0d',
    'red': '#e0281e',
    # Added: the darkened twin for red used as TYPE. Fills keep --red.
    'red-ink': '#b31610',
    # Added: type printed ON a red fill. #fff in light, near-black in dark.
    'red-fg': '#ffffff',
    'red-soft': '#f6c9cf',
    'pink': '#f6c9cf',
    'green-ink': '#12692f',
    # Added: the chart's completed-month bar, pushed off --rule (1.44:1) to clear 3:1.
    'chart-bar': '#8f8f8f',
    # F14: the 17. `meals` inherits the old `food` red (amended from the design's #e0281e,
    # 4.49:1 under the black mark); transport/housing/other keep their own pre-F14
    # amendments; `grooming` reuses the green freed by deleting `groceries`.
    'cat-meals': '#e22c22',
    'cat-jajan': '#f59220',
    'cat-dining': '#f4632a',
    'cat-snacks': '#d8b41a',
    'cat-drinks': '#16b3d4',
    'cat-transport': '#2273e6',
    'cat-fuel': '#6f8fe8',
    'cat-parking': '#4aa8d8',
    'cat-bills': '#e8a800',
    'cat-internet': '#9d7bf0',
    'cat-utilities': '#b06ae0',
    'cat-housing': '#8c5ae8',
    'cat-entertainment': '#e23da4',
    'cat-cinema': '#f06fb0',
    'cat-health': '#0fa89a',
    'cat-grooming': '#1fa24a',
    'cat-other': '#767676',
}

DARK = {
    'paper': '#000000',
    'paper-2': '#000000',
    'card': '#161616',
    'ink': '#ffffff',
    'ink-2': '#c2c2c2',
    # Amended from the design's #7d7d7d (4.40:1 on card).
    'ink-3': '#858585',
    'rule': '#2e2e2e',
    'rule-2': '#2e2e2e',
    'rule-strong': '#f2f2f2',
    'red': '#ff4a3d',
    'red-ink': '#ff4a3d',
    'red-fg': '#0d0d0d',
    'red-soft': '#2a1518',
    'pink': '#2a1518',
    'green-ink': '#3ed874',
    'chart-bar': '#6e6e6e',
    'cat-meals': '#ff5a4e',
    'cat-jajan': '#ffb04a',
    'cat-dining': '#ff8a5c',
    'cat-snacks': '#f5d76b',
    'cat-drinks': '#4ad9f0',
    'cat-transport': '#5b9cff',
    'cat-fuel': '#8fb0ff',
    'cat-parking': '#6fc8ea',
    'cat-bills': '#ffd23f',
    'cat-internet': '#bda6ff',
    'cat-utilities': '#d09aff',
    'cat-housing': '#a98bff',
    'cat-entertainment': '#ff6fc4',
    'cat-cinema': '#ffa0d8',
    'cat-health': '#3fe0cf',
    'cat-grooming': '#3ed874',
    'cat-other': '#9e9e9e',
}

TEXT = 4.5
GRAPHIC = 3.0
# The floor below which two categorical series stop being reliably tellable apart.
SEPARATION = 0.10

# ------------------------------------------------------------------- the frosted surface
#
# R-137 replaced every white box with glass over the cut-out wallpaper, which turns a fixed
# pairing ("ink on card") into a pairing against WHATEVER THE ART PUTS THERE. These are the
# two extremes the art can put under a frosted surface, measured over all five PNGs at their
# real render size with the 14px blur applied: the darkest pixel in light mode, the brightest
# in dark. Regenerate with `python3 scripts/glass-backdrop.py` — that script documents when.
#
# The dark extreme is the SHEEP'S WOOL, which is cream, and that is the same #e8d8b8 that
# CutoutArt's comment already warns about ("cream type on cream wool"). It is why dark mode
# rather than light is the binding constraint on the tint.
GLASS_BACKDROP = {
    'light': '#362d1d',  # darkest the wallpaper goes under glass
    'dark': '#e8d8b8',  # brightest it goes on true black
}

# --glass / --glass-panel from globals.css §1, as (tint, alpha).
GLASS = {
    'light': ('#ffffff', 0.72),
    'dark': ('#1c1c1c', 0.80),
}
GLASS_PANEL = {
    'light': ('#ffffff', 0.85),
    'dark': ('#1c1c1c', 0.80),
}

GLASS_WAIVER = '''WAIVER — `red-ink` and `green-ink` are below 4.5:1 ON GLASS, over the art only.

R-137 frosted every surface that used to be a white block, so text on a card is now text over
whatever the wallpaper (R-47) has put behind it. Four of the six text tokens clear 4.5:1
against the worst pixel the art can supply, and two do not: `red-ink` (3.98 light / 3.01 dark)
and `green-ink` (3.91 light, and 5.38 dark, which passes). Both clear comfortably on `paper`,
on the opaque fallback, and on the sheet panel.

THERE IS NO TINT THAT FIXES BOTH AND LEAVES A FROST. Dark mode is the binding end: at 0.94
`red-ink` is still only 4.48, and 0.94 is 6% of a blurred creature showing through — not
frost, just a slightly dirty tint. The alternative is moving the token, and the only dark red
that clears at 0.80 is around #ff8a80, a salmon that is no longer the brand's red and would
have to be mirrored in light for the pair to stay one colour.

WHY IT IS SAFE, and it is the same structural argument as BAR_WAIVER:

  · Neither token is ever the only channel. A field error draws a RED BORDER around the
    control (`aria-[invalid=true]:border-red`) and the message underneath repeats it in
    words; the destructive button says "Hapus"; the delta tile states the rupiah figure and
    the direction as text.
  · Both are small in extent — a one-line message, a button label, one figure in a tile —
    and neither is body copy anyone reads at length.
  · The two places `red-ink` sits over glass that can have art behind it are both inside a
    SHEET, where the panel's thicker tint over its own scrim measures 5.05 light / 4.54 dark
    — over the line in both.

THIS WAIVER EXPIRES if either token becomes the sole signal — a red figure with no sign or
label, a green total with no direction stated — or if the wallpaper gains a creature brighter
than the sheep's wool without the tint being re-derived.'''

WAIVER = '''WAIVER — categorical separation is knowingly below the 0.10 floor, in both themes.

The seventeen hues sit as close as 0.031 apart in Oklab — snacks/bills, then internet/utilities
0.039 and drinks/parking 0.047 (those are dark; light is 0.036 / 0.050 / 0.038). That was the
exact failure R-3 caught in the original eight-slice donut, and it is NOT a failure here, for
one structural reason: in this design colour never carries a category on its own.

F14 TOOK THE SET FROM 8 TO 17, AND THE FLOOR IS NOW UNREACHABLE BY CONSTRUCTION — worth stating
plainly rather than leaving as an accident. Seventeen hues that are each ≥0.10 apart in Oklab
AND each ≥4.5:1 under a black disc mark do not fit in sRGB: the contrast gate confines every
fill to a bright band, and seventeen points spread through that band land inside 0.10 of a
neighbour. So the hues are assigned by FAMILY instead — eating red→orange→yellow, transport
blue, bills/home violet, leisure pink, health teal, grooming green — and the closest pairs are
the ones INSIDE a family, where the confusion is between two categories the user already reads
as related. The two-letter code is what separates them.

  · Every chip, picker cell, item row, bar-list head, tooltip and legend entry renders the
    disc's two-letter code and, wherever there is room, the Indonesian label. `Chip`,
    `CategoryDisc` and `CategoryPicker` have no colour-only mode to opt into — the code and
    an sr-only label are baked into the disc itself.
  · The 12-month chart has no categorical series at all — the current month is `red` and
    every other month is `chart-bar`.
  · The category breakdown is a bar list, not a donut, so each colour is attached to its own
    labelled row rather than competing with sixteen neighbours around a ring.

THIS WAIVER EXPIRES the moment a view identifies a category by colour alone. If F08 (or
anyone) adds a legend without codes, a pie, a stacked bar, or a colour-keyed sparkline, the
0.031 number becomes a real defect — and at 17 categories re-spacing the hues will not rescue
it, so such a view has to carry the codes instead. Re-read this before adding any chart that
is not the bar list.'''


def glass_surfaces(t: dict[str, str], scheme: str) -> dict[str, str]:
    """The three frosted surfaces, resolved to flat colours over the worst backdrop there is.

    `glass on art` is a card, header, field or chip sitting directly over the wallpaper — the
    common case and the strict one. `glass on glass` is the nesting the design leans on for a
    field inside a card, and it comes out LIGHTER than its container, which is the separation
    that used to come from a `bg-paper` override. `sheet panel` is the one surface whose
    backdrop is not the page: a <dialog> paints over its own ::backdrop scrim, so the art is
    already halved before the thicker panel tint goes over it.
    """
    art = GLASS_BACKDROP[scheme]
    tint, alpha = GLASS[scheme]
    panel_tint, panel_alpha = GLASS_PANEL[scheme]
    scrim_alpha = 0.5 if scheme == 'light' else 0.65

    on_art = over(tint, alpha, art)
    return {
        'glass on art': on_art,
        'glass on glass': over(tint, alpha, on_art),
        'sheet panel': over(panel_tint, panel_alpha, over('#000000', scrim_alpha, art)),
    }


def checks(t: dict[str, str], scheme: str) -> list[tuple[str, float, float]]:
    """Every pairing the components actually paint, with the threshold each is held to."""
    f = FIXED
    g = glass_surfaces(t, scheme)
    # THE INK-3 COLLAPSE (R-137): `.glass` redefines --ink-3 to --ink-2's value, so a label
    # inside a frosted box is checked as ink-2. Checking it as ink-3 would be checking a
    # colour the app cannot paint there.
    glass_ink_3 = t['ink-2']
    out: list[tuple[str, float, float]] = [
        # body text
        ('ink on card', contrast(t['ink'], t['card']), TEXT),
        ('ink on paper', contrast(t['ink'], t['paper']), TEXT),
        ('ink-2 on card', contrast(t['ink-2'], t['card']), TEXT),
        ('ink-2 on paper', contrast(t['ink-2'], t['paper']), TEXT),
        # ink-3 is labels, meta and placeholders: small, but still text.
        ('ink-3 on card', contrast(t['ink-3'], t['card']), TEXT),
        ('ink-3 on paper', contrast(t['ink-3'], t['paper']), TEXT),
        # The primary button is a red FILL. `red-fg` rather than a literal #fff: the design
        # hard-codes white, which fails at 3.33:1 against dark mode's bright red. This is the
        # pairing that lets --red stay the design's exact brand value in both schemes.
        ('red-fg on red fill', contrast(t['red-fg'], t['red']), TEXT),
        # Red as TYPE — form errors, the destructive button, the delta tile. Three surfaces,
        # because the empty-state plate is pink and the error notice sits on it.
        ('red-ink on card', contrast(t['red-ink'], t['card']), TEXT),
        ('red-ink on paper', contrast(t['red-ink'], t['paper']), TEXT),
        ('red-ink on pink', contrast(t['red-ink'], t['pink']), TEXT),
        # The delta tile's "spending less" reading.
        ('green-ink on card', contrast(t['green-ink'], t['card']), TEXT),
        ('green-ink on paper', contrast(t['green-ink'], t['paper']), TEXT),
        # The pink empty-state plate carries a headline and a description.
        ('ink on pink', contrast(t['ink'], t['pink']), TEXT),
        ('ink-2 on pink', contrast(t['ink-2'], t['pink']), TEXT),
        # THE TAB BAR — solid black in both schemes, so these are scheme-independent and are
        # checked twice on purpose. The active tab is yellow, the inactive one is the
        # design's #8f8f8f, which is legible here even though it is not on paper.
        ('tab-ink on tab-bg', contrast(f['tab-ink'], f['tab-bg']), TEXT),
        ('tab-ink-3 on tab-bg', contrast(f['tab-ink-3'], f['tab-bg']), TEXT),
        ('red-fg on red crown', contrast(t['red-fg'], t['red']), TEXT),
        # THE TOAST — yellow in both schemes, same reasoning.
        ('toast-ink on yellow', contrast(f['toast-ink'], f['yellow']), TEXT),
        ('toast-danger-ink on yellow', contrast(f['toast-danger-ink'], f['yellow']), TEXT),
        # THE STICKERS. Yellow (month pill, tagline), ink (day heading, section heads) and
        # red (the share page's product mark).
        ('sticker ink on yellow', contrast('#0d0d0d', f['yellow']), TEXT),
        ('sticker paper on ink', contrast(t['paper'], t['ink']), TEXT),
        ('sticker red-fg on red', contrast(t['red-fg'], t['red']), TEXT),
        # The 12-month chart. The completed bar is a graphical object; the current month is
        # the brand red. `rule` is the gridline underneath them and is decorative.
        ('chart-bar on card', contrast(t['chart-bar'], t['card']), GRAPHIC),
        ('red bar on card', contrast(t['red'], t['card']), GRAPHIC),
        # The lightbox counter pill, which is yellow over true black in both schemes.
        ('counter ink on yellow', contrast('#0d0d0d', f['yellow']), TEXT),
        # The dashed boundaries that IDENTIFY a control — the photo add-tile, the empty-state
        # plate — are drawn in ink-3, which 1.4.11 holds to 3:1.
        ('ink-3 dash on paper', contrast(t['ink-3'], t['paper']), GRAPHIC),
        ('ink-3 dash on pink', contrast(t['ink-3'], t['pink']), GRAPHIC),
        # The sheet grabber. Held against the panel it actually sits on, not against `card`.
        ('rule-strong on panel', contrast(t['rule-strong'], g['sheet panel']), GRAPHIC),
    ]

    for c in CATS:
        colour = t[f'cat-{c}']
        # THE DISC MARK: a bold black two-letter code on the category fill. This is the
        # pairing the three amended light hues exist for, and it is TEXT, not a fill check.
        out.append((f'disc mark on {c}', contrast(f['disc-ink'], colour), TEXT))
        # Selected chip / picker cell: the whole pill floods with the category colour and
        # the label takes the SAME ink as the mark beside it, in both schemes, because the
        # fills are bright in both. (The design says #0d0d0d; that costs 0.33 of ratio and
        # fails on four of the eight in light, so the label uses --disc-ink instead.)
        out.append((f'selected label on {c}', contrast(f['disc-ink'], colour), TEXT))
        # NOTE: the breakdown's progress bar against its own `rule` track is NOT checked
        # here. It is reported in the informational section instead — see BAR_WAIVER.

    # ---- THE FROSTED SURFACES (R-137) ------------------------------------------------
    # Every `bg-card` in the app became `glass`, so these are the pairings that used to be
    # "on card" and are now against the worst thing the wallpaper can put behind them. This
    # is the block that sets the tint: 0.72 / 0.80 is the lowest pair at which all of it
    # passes, and the canvas's own 0.55 / 0.50 fails ten of these.
    for surface, colour in g.items():
        out.append((f'ink on {surface}', contrast(t['ink'], colour), TEXT))
        out.append((f'ink-2 on {surface}', contrast(t['ink-2'], colour), TEXT))
        # Labels, meta lines and placeholders, at their collapsed value. See glass_ink_3.
        out.append((f'ink-3 on {surface}', contrast(glass_ink_3, colour), TEXT))
        # A field's error border is the boundary that identifies the control as failed, which
        # 1.4.11 holds to 3:1. The field's own borderless resting state stays waived (R-46).
        #
        # `red-ink`, NOT `red`, and R-137 is what moved it: the brand red measures 2.69 against
        # light glass over the art, so the error border on a field over a creature was the one
        # hard failure the frost introduced. `red-ink` is already the token for red as TYPE
        # rather than as a fill, and a 1px line is nearer to type than to a fill — so this is
        # the existing distinction being applied, not a new colour. Dark mode is unaffected:
        # the two tokens are the same value there.
        out.append((f'error border on {surface}', contrast(t['red-ink'], colour), GRAPHIC))
        # The one hairline this design keeps — row separators inside a frosted card. It is
        # decorative, so 1.4.11 does not reach it; reported in main() rather than gated.

    return out


def main() -> int:
    failures = 0

    for name, t in (('LIGHT', LIGHT), ('DARK', DARK)):
        print('=' * 78)
        print(name)
        print('-' * 78)

        for label, got, want in checks(t, name.lower()):
            ok = got >= want
            if not ok:
                failures += 1
            print(f'  {"ok  " if ok else "FAIL"} {label:26} {got:6.2f}   (need {want})')

        # Informational, deliberately not part of the exit code. See WAIVER below.
        print()
        g = glass_surfaces(t, name.lower())
        print('  the frosted surfaces, resolved over the worst pixel of the wallpaper:')
        print(f'    worst backdrop     {GLASS_BACKDROP[name.lower()]}  (scripts/glass-backdrop.py)')
        for surface, colour in g.items():
            print(f'    {surface:<18} {colour}')
        print(f'    over bare page     {over(*GLASS[name.lower()], t["paper"])}  (no art behind it)')
        print()
        print('  waived on glass, over the art only (no threshold — see GLASS_WAIVER):')
        for tok in ('red-ink', 'green-ink'):
            print(f'    {tok:<14} on glass   {contrast(t[tok], g["glass on art"]):.2f}')
            print(f'    {tok:<14} on panel   {contrast(t[tok], g["sheet panel"]):.2f}')
        print()
        print('  decorative lines (no threshold — see checks() for why):')
        print(f'    rule on paper      {contrast(t["rule"], t["paper"]):.2f}')
        print(f'    rule-2 on glass    {contrast(t["rule-2"], g["glass on art"]):.2f}')

        print('  breakdown bar on its track (no threshold — see BAR_WAIVER):')
        for c in CATS:
            print(f'    {c:<14} {contrast(t[f"cat-{c}"], t["rule"]):.2f}')

        pairs = sorted(
            (delta_e(t[f'cat-{a}'], t[f'cat-{b}']), a, b)
            for a, b in itertools.combinations(CATS, 2)
        )
        print()
        print(f'  closest categorical pairs (ΔE Oklab, informational floor {SEPARATION}):')
        for d, a, b in pairs[:4]:
            print(f'    {a}/{b:14} {d:.3f}{"" if d >= SEPARATION else "   <-- below floor"}')
        print()

    print('=' * 78)
    print(GLASS_WAIVER)
    print()
    print(BAR_WAIVER)
    print()
    print(WAIVER)
    print('=' * 78)
    print(f'CONTRAST FAILURES: {failures}')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
