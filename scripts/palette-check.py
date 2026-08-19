#!/usr/bin/env python3
"""Verify the F10 palette: WCAG contrast for every real pairing, plus categorical separation.

Run:  python3 scripts/palette-check.py

Zero dependencies, stdlib only. The token values below are transcribed from
app/globals.css §1 and must stay in step with it — if a colour changes, including anything
arriving from a later Claude Design pull, edit the two dicts and re-run rather than eyeball
the result. Reconciliation R-28 makes this a hard gate before /stats ships: F08 validated its
palette against surfaces (#fcfcfb / #1a1a19) that are NOT the ones the design shipped.

Two things this checks that a generic contrast tool would not:

  1. A category colour is used as TEXT — the two-letter mono code IS the category in a dense
     row — so it is held to 4.5:1, not to the 3:1 that a chart fill alone would need. The
     design claimed ≥4.5:1 on paper; that was a claim to verify, not to inherit.

  2. Pairwise separation in Oklab, because eight muted earthy hues that each pass contrast
     against the background can still be indistinguishable from each other, which is the
     failure R-3 caught in the original donut.

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

CATS = [
    'food',
    'groceries',
    'transport',
    'bills',
    'housing',
    'entertainment',
    'health',
    'other',
]

LIGHT = {
    'paper': '#f0ede4',
    'paper-2': '#e8e4d9',
    'card': '#fbfaf5',
    'ink': '#20211d',
    'ink-2': '#5d5c52',
    # Amended from the design's #8f8d81 (2.85:1 on paper). See globals.css §1.
    'ink-3': '#6e6c61',
    'rule': '#d8d3c4',
    'rule-2': '#eae6da',
    'rule-strong': '#8d887b',
    'accent': '#2f5d50',
    'accent-soft': '#e0e8e2',
    'red': '#8a3324',
    'red-soft': '#efdfd9',
    'cat-food': '#9c4a2a',
    'cat-groceries': '#63661f',
    'cat-transport': '#3e5c85',
    'cat-bills': '#8a651c',
    'cat-housing': '#6e4f33',
    'cat-entertainment': '#6d4a86',
    'cat-health': '#2c6b66',
    'cat-other': '#6d6b60',
}

DARK = {
    'paper': '#131311',
    'paper-2': '#1a1a17',
    'card': '#1e1e1a',
    'ink': '#eeebe1',
    'ink-2': '#a5a398',
    # Amended from the design's #6e6d64 (3.21:1 on card).
    'ink-3': '#86857b',
    'rule': '#2e2e28',
    'rule-2': '#242420',
    'rule-strong': '#696962',
    'accent': '#86bba6',
    'accent-soft': '#1e2a25',
    'red': '#c97a62',
    'red-soft': '#2a1d18',
    'cat-food': '#d69a76',
    'cat-groceries': '#adb063',
    'cat-transport': '#92aed1',
    'cat-bills': '#c9a95c',
    'cat-housing': '#bb9772',
    'cat-entertainment': '#b195d1',
    'cat-health': '#7fbcb3',
    'cat-other': '#9b988c',
}

TEXT = 4.5
GRAPHIC = 3.0
# The floor below which two categorical series stop being reliably tellable apart.
SEPARATION = 0.10

WAIVER = '''WAIVER — categorical separation is knowingly below the 0.10 floor, in both themes.

The eight hues are muted and earthy by design and sit as close as 0.042 apart in Oklab. That
was the exact failure R-3 caught in the original eight-slice donut, and it is NOT a failure
here, for one structural reason: in this design colour never carries a category on its own.

  · Every chip, picker cell, item row, bar-list head, tooltip and legend entry renders the
    two-letter code and, wherever there is room, the Indonesian label. `Chip`, `CategoryCode`
    and `CategoryPicker` have no colour-only mode to opt into.
  · The 12-month chart has no categorical series at all — the current month is `accent` and
    every other month is `rule` (design R-39).
  · The category breakdown is a bar list, not a donut, so each colour is attached to its own
    labelled row rather than competing with seven neighbours around a ring.

THIS WAIVER EXPIRES the moment a view identifies a category by colour alone. If F08 (or
anyone) adds a legend without codes, a pie, a stacked bar, or a colour-keyed sparkline, the
0.042 number becomes a real defect and the hues have to be re-spaced. Re-read this before
adding any chart that is not the bar list.'''


def checks(t: dict[str, str]) -> list[tuple[str, float, float]]:
    """Every pairing the components actually paint, with the threshold each is held to."""
    out: list[tuple[str, float, float]] = [
        # body text
        ('ink on card', contrast(t['ink'], t['card']), TEXT),
        ('ink on paper', contrast(t['ink'], t['paper']), TEXT),
        ('ink-2 on card', contrast(t['ink-2'], t['card']), TEXT),
        ('ink-2 on paper', contrast(t['ink-2'], t['paper']), TEXT),
        # ink-3 is labels and meta: small, but still text.
        ('ink-3 on card', contrast(t['ink-3'], t['card']), TEXT),
        ('ink-3 on paper', contrast(t['ink-3'], t['paper']), TEXT),
        # primary button and toast: paper on ink
        ('paper on ink', contrast(t['paper'], t['ink']), TEXT),
        # destructive button is red text and border on the page, never a red fill
        ('red on card', contrast(t['red'], t['card']), TEXT),
        ('red on paper', contrast(t['red'], t['paper']), TEXT),
        # the danger toast: red-soft on the inverted ink surface
        ('red-soft on ink', contrast(t['red-soft'], t['ink']), TEXT),
        # the active-tab dot and the current bar in F08's chart are graphical
        ('accent on paper', contrast(t['accent'], t['paper']), GRAPHIC),
        ('accent on card', contrast(t['accent'], t['card']), GRAPHIC),
        # rule-strong is the boundary that IDENTIFIES a control — input, secondary button,
        # picker cell — so 1.4.11's 3:1 applies to it. Plain `rule` and `rule-2` are a card
        # edge and a row separator: decorative, backed up by layout and by the card's own
        # fill, and deliberately left below 3:1. They are reported without a threshold below.
        ('rule-strong on paper', contrast(t['rule-strong'], t['paper']), GRAPHIC),
        ('rule-strong on card', contrast(t['rule-strong'], t['card']), GRAPHIC),
    ]

    for c in CATS:
        colour = t[f'cat-{c}']
        # As TEXT: the two-letter code, and the label inside an unselected chip.
        out.append((f'{c} code on card', contrast(colour, t['card']), TEXT))
        out.append((f'{c} code on paper', contrast(colour, t['paper']), TEXT))
        # Selected chip and picker cell: paper on the category fill.
        out.append((f'paper on {c} fill', contrast(t['paper'], colour), TEXT))
        # F08's 4px progress bar against its own well.
        out.append((f'{c} bar on rule-2', contrast(colour, t['rule-2']), GRAPHIC))

    return out


def main() -> int:
    failures = 0

    for name, t in (('LIGHT', LIGHT), ('DARK', DARK)):
        print('=' * 78)
        print(name)
        print('-' * 78)

        for label, got, want in checks(t):
            ok = got >= want
            if not ok:
                failures += 1
            print(f'  {"ok  " if ok else "FAIL"} {label:26} {got:6.2f}   (need {want})')

        # Informational, deliberately not part of the exit code. See WAIVER below.
        print()
        print('  decorative lines (no threshold — see checks() for why):')
        print(f'    rule on paper      {contrast(t["rule"], t["paper"]):.2f}')
        print(f'    rule-2 on card     {contrast(t["rule-2"], t["card"]):.2f}')

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
    print(WAIVER)
    print('=' * 78)
    print(f'CONTRAST FAILURES: {failures}')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
