# Design integration

Source: Claude Design project `8c505e75-e97a-4c8e-b7c0-04aeb074bc7f`. Pulled via
`DesignSync`. The design's own values are mirrored verbatim in `docs/design/tokens.css`;
what the app actually ships is `app/globals.css`, and every difference between the two is
an amendment recorded below and verified by `scripts/palette-check.py`.

Two pulls so far. **The 2026-08-21 pull is the current system.** The 2026-08-19 section
further down is kept because most of its non-visual rulings still stand, but every colour,
both fonts and the whole type scale in it are superseded.

Read the current section in two halves. **R-42 through R-49 record the integration** — what
the design said and where the app had to differ to ship it. **R-131 onward are amendments
taken after the pull**, once the design was running on a real phone, and three of them
overrule the canvas outright. If a ruling in the first half and one in the second disagree,
the second wins; the first half is not edited to match, only annotated.

---

# 2026-08-21 — "flat, loud, graphic" (CURRENT)

Files: `00 Foundations`, `01 Components`, `02 Sheet and Media`,
**`04 App Prototype (Cutout Art)`**.

`04` differs from `03 App Prototype` by exactly two lines: every `assets/<creature>.png`
became `assets/<creature>-cut.png`. Same tokens, same layout, same everything — the artwork
just lost the white plate behind it. **v4 is the one this repo integrates**, and the
difference matters more in the app than it did on the canvas, because the art sits on
`paper` in light mode and on TRUE BLACK in dark, where a white square would have been a
white square.

## The direction, in one paragraph

Cool grey paper (`#e9e9e6`) and near-black ink. **One typeface — Archivo**, a hard
grotesque, at weights 500–900; the old serif/mono split is gone and **weight is the
hierarchy** (900 hero, 800 total, 700 row title, 600 item, 500 prose). Money gets its
column alignment from `font-variant-numeric: tabular-nums`, which is now load-bearing
rather than a nicety, because Archivo is proportional. **Red is the brand and the one
primary action per screen. Yellow is the highlighter** — month pill, active tab, the toast.
Pink and cyan are big background moments, never text. Eight saturated category hues, each
drawn as a **disc carrying a bold black two-letter mark**. Dark mode sits on true black and
stays saturated instead of dimming. **No borders on cards and no shadows anywhere**:
surfaces are flat blocks separated by contrast, exactly like print. Five **cut-out
creatures** scatter behind every screen.

## What changed from 2026-08-19

| | was | is |
|---|---|---|
| page | warm paper `#f0ede4` | cool grey `#e9e9e6`, true black in dark |
| type | Source Serif 4 + IBM Plex Mono | Archivo alone, 500–900 |
| hierarchy | family (language vs bookkeeping) | weight |
| money | mono, tabular by construction | Archivo + `tabular-nums` |
| card | hairline border + lighter fill | fill only, no border |
| category mark | tinted 2-letter code on the page | black 2-letter code on a colour disc |
| selected chip | category fill, `paper` text | category fill, black text, inverted disc |
| accent | one deep green | gone — yellow highlights, red acts |
| tab bar | `paper` with a hairline and an ink crown | solid black chassis, yellow active, red crown |
| toast | inverted to ink | yellow sticker, both schemes |
| empty state | dashed hairline on the page | pink plate, dashed `ink-3` |
| chart | accent + a second accent step | grey past months, red current month |
| buttons | mono, uppercase, tracked, outlined | sentence case, 800, flat blocks |
| background | nothing | five cut-out creatures |

## R-42 · The token NAMES survive; only their values move.

`paper`, `card`, `ink`, `ink-2`, `ink-3`, `rule`, `rule-strong`, `red`, `cat-*` and the
whole `--text-*` scale keep their names and are re-pointed. **Ruling: re-point, do not
rename.** Five features' worth of markup is written against these names, and a rename would
have turned a visual revamp into a 6,500-line find-and-replace whose diff nobody could
review. The design's own vocabulary is recorded in `tokens.css` beside each token
(`--bg` → `paper`, `--line-2` → `rule`, `--line` → `rule-strong`).

Names that genuinely died, because their meaning did: `--accent`, `--accent-2`,
`--accent-soft`, `--font-serif`, `--font-mono`. Each of their ~50 call sites was changed by
hand rather than aliased, because "the green one" no longer means anything here.

## R-43 · Weight and tracking belong in the type scale, not at the call site.

> **The mechanism stands; the values below are superseded by R-131.** `text-label` is now
> 11px at 0.005em, and nothing in the app is capsed.

With one family, `text-label` has to carry 10px **and 800 and 0.14em** or every call site
re-specifies them and they drift. **Ruling: every `--text-*` entry declares its own
`--font-weight` and `--letter-spacing`.** This is also what let `font-mono` / `font-serif`
be deleted from ~84 call sites without replacing them with anything.

## R-44 · The category mark is a DISC, and `CategoryCode` is now an alias.

The design's pictogram is a solid colour circle with a bold black two-letter mark —
"like event badges" (`00 Foundations`). The bare tinted code the old system used is gone.
`CategoryDisc` is the new component; **`CategoryCode` is exported as an alias of it** so the
four feature plans written against that name keep compiling.

## R-45 · Three light-mode hues, `cat-food` and both `ink-3`s are AMENDED for contrast.

Same standard, and the same reasoning, as the 2026-08-19 pull's `ink-3` amendment. Every
number below is produced by `scripts/palette-check.py`, which is the gate — it exits
non-zero on a contrast failure and currently reports **0 failures**.

| token | design | shipped | why |
|---|---|---|---|
| `ink-3` light | `#8f8f8f` | `#666666` | 2.63:1 on paper. Now 4.72 paper / 5.74 card. |
| `ink-3` dark | `#7d7d7d` | `#858585` | 4.40:1 on card. Now 4.90 card / 5.69 paper. |
| `cat-food` | `#e0281e` | `#e22c22` | 4.49:1 under the black mark — one hundredth under. |
| `cat-transport` | `#1d6fe0` | `#2273e6` | 4.18:1 under the black mark. Now 4.66. |
| `cat-housing` | `#7a44e0` | `#8c5ae8` | 3.46:1 under the black mark. Now 4.74. |
| `cat-other` | `#6e6e6e` | `#767676` | 4.12:1 under the black mark. Now 4.62. |

The **brand** `--red` keeps the design's exact `#e0281e`; only the food *disc* moves, and by
an amount nobody can see with the two side by side.

Three tokens are ADDED for the same reason, all following the `--rule-strong` precedent of
the previous pull — a second value for a job the single design value cannot do:

- **`--red-ink`** (`#b31610` light) — red as **type**. `--red` measures 3.79:1 on paper and
  3.14:1 on the pink plate, and a form error and a "Hapus" button are made of red type.
  Fills use `--red`, type uses `--red-ink`. Same value in dark, where the red already clears.
- **`--red-fg`** (`#ffffff` light, `#0d0d0d` dark) — type printed **on** a red fill. The
  design hard-codes `#fff`, which is right in light (4.68) and a **failure in dark** (3.33),
  because dark's red is a bright `#ff4a3d`. The fill stays the design's value in both.
- **`--green-ink`** (`#12692f` light) — "spending less". The design has no green and
  expresses this by filling the delta tile; where it has to be type, the disc green measures
  3.32:1 on card.
- **`--chart-bar`** (`#8f8f8f` / `#6e6e6e`) — the 12-month chart's completed months. The
  design draws them in `--line-2`, which is 1.44:1 on card: eleven of twelve bars below
  every floor, with only the selected bar carrying a label.

## R-46 · Two things the design gets wrong that are NOT amended, and why.

**The borderless field.** A field is a white block with no border until an error turns it
red. That is 1.23:1 against the page, below WCAG 1.4.11's 3:1 for the boundary that
identifies a control. **Ruling: follow the design.** The amendments above are all *colour
values*, which are invisible; adding a border back is a *structural* change that would
visibly contradict the revamp. Every field still carries a real `<label>`, a 2px
focus-visible ring, and full column width. The one-line revert is in `CONTROL_CLASS` and
`TextArea`: `border-transparent` → `border-rule-strong`.

**The breakdown bar on its track.** Four of eight fills are under 3:1 against the `rule`
track in light mode. **There is no track colour that fixes it** — the eight fills span
L\* 0.17 to 0.45, so any single track fails at one end or the other. Waived, with the
reasoning written out in `BAR_WAIVER` in `scripts/palette-check.py`: every row states its
label, its rupiah and its percent as text above the bar, and the bar carries a `role="img"`
label repeating all three.

## R-47 · The cut-out art is a `background-image`, not an `<img>`.

Three reasons, all load-bearing: decorative art has no business in the accessibility tree
and a CSS background is invisible to it by construction; a **missing file paints nothing**,
where a broken `<img>` paints a broken-image glyph; and `background-size: contain` serves
every device pixel ratio without a `srcset`.

The clipping lives on the art layer, **not** on the column. `overflow-hidden` on the column
would make it a scroll container, and `/m/[month]`'s sticky header would then stick to a box
that never scrolls — i.e. stop sticking, silently.

## R-48 · ⚠️ The five PNGs are not in this repo yet.

> **DISCHARGED — see R-136.** The art shipped on 2026-08-21. Everything below is the
> historical record of the gap, not a live instruction.

`get_file` truncates at 256 KiB and each `*-cut.png` is larger, so the art could not be
pulled with the rest of the design. `components/CutoutArt.tsx` is complete and wired; it
currently resolves five 404s and paints nothing, which is exactly the degradation R-47 was
built for.

**To finish it:** export the five cut-outs from the design canvas and save them as
`public/art/dragon.png`, `sheep.png`, `mountain.png`, `octopus.png`, `snake.png` —
transparent PNG, square, and worth compressing hard, because five decorative images on a
mobile-first app over an Indonesian connection is exactly the kind of weight this repo
budgets for elsewhere. No code change is needed once they are there.

## R-49 · Measurements to build to (supersedes R-41)

> **The vertical measurements here are superseded by R-132's 8px edge rule** — headers,
> footers and anything else touching a screen edge. Every horizontal measurement still
> stands, and R-134 adds the icon-glyph spec.

Screen gutter **22px**; 4pt spacing base. Buttons **54px**, small variant **44px**. Inputs
**50px** at **17px** text. Item rows **min 52px**, group rows **min 60px**. The category
disc is **28px** (26 inside a chip), its mark 9px/900. Delete target a full **44×44**.
Photo thumbnails 3-up; the draft strip uses **74×74** tiles. Sheet: grabber **44×5** in
`--rule-strong`, 16px top corners, no border, no close button — tapping the scrim dismisses.
Tab bar **54px** of solid `#0d0d0d` with a **56px** red crown breaking its top edge.
Lightbox goes true black **in both schemes**, with a yellow counter pill.

---

## Amendments taken AFTER the pull

R-42 through R-49 record the integration itself. Everything below was decided once the
design was already running in the app, and three of them (R-131, R-134, R-135) **overrule
the canvas** rather than transcribe it.

`05 Shipped State` on the design project is the canvas-side mirror of this block. It is
regenerated from `app/globals.css` and the components and pushed with `DesignSync`, which
makes it **downstream of this file and never a source for it** — the pull direction stays
`04` → repo, and the push direction is repo → `05`.

### Why the numbering jumps R-49 → R-131

This file's rulings and `docs/RECONCILIATION_v0.1.0.md`'s were meant to be one sequence —
this file opens at R-34 because that is where the reconciliation stood when it was started.
They then grew independently and **collided**: R-42, R-43, R-44, R-46, R-48 and R-49 each
name a different ruling in each file, which is why the code cites this one as
`design R-nn` (see `components/photos/UploadTile.tsx`, `app/(bare)/page.tsx`).

Renumbering either file would invalidate ~40 citations in shipped comments, so the collision
stays. New rulings here start at **R-131, one past the highest number used anywhere in the
repo**, so nothing minted from here on needs the `design` prefix to be unambiguous. Keep
that rule: before minting, take the max across both files.

## R-131 · No caps anywhere. Casing is what a string IS, not how big it is.

The design capses every label under 12px: `eyebrow`, `sticker`, `sticker-lg` and the tab
bar all carried `text-transform: uppercase`, and twelve call sites added it by hand.
**Ruling: the treatment is retired outright. No `text-transform` remains in
`app/globals.css` and no `uppercase` class remains in a component.** Recorded as THE CASING
RULE in the base layer, next to THE 17px RULE.

Two things this is *not*. It is not a copy rewrite — no string was ever authored in caps,
every one was already Title or sentence case, so the caps lived entirely in the stylesheet.
And it is not a typeface change: Archivo is variable with a full lowercase set, so there was
no font limitation to work around.

What was real is that casing was a function of SIZE — capsed at 10–11px, Title or sentence
case at 14 and up. `Button.tsx` had already argued the case for dropping caps at the large
tier ("authority from weight and size instead"); this finishes the same migration at the
small one, so what a string looks like now depends on what it is:

| what it is | casing | example |
|---|---|---|
| labels, headings, nav | Title Case | `Judul` · `Item` · `Tautan Publik` · `Bulan Ini` |
| sentences and prose | sentence | `Gagal menyimpan. Coba lagi ya.` |
| data phrases | lowercase | `6 catatan · 17 item · ⧉ 2 foto` |

Indonesian Title Case leaves function words lowercase — `dari`, `di`, `ke`, `dan`, `atau`,
`yang`, `untuk` — hence **`Ulangi dari Teks`**, never `Ulangi Dari Teks`. Two exceptions
keep their caps because they are not text: the two-letter category glyphs (R-34) and
`expensetracking.online`, which is a domain.

**Supersedes the values in R-43, not its mechanism.** Tracking was tuned for caps, so it
collapses to ~**0.005em**, and each small tier gains a step — `label` 10→11, `action`
11→12, `sticker-lg` 12→13 — because caps carry more optical presence than the words
replacing them, and dropping them without the step makes a label read quieter than it is.
The weight and the tracking still live in the scale entry, which is all R-43 ever claimed.

Verified headless at 320px and 390px: **zero elements with `text-transform: uppercase`** on
every route — the direct assertion rather than an inference from grep — no horizontal
overflow, and the tab bar's three labels unclipped at both widths. The 11→12px step on
`--text-action` was the one change with a real chance of breaking that bar.

Plan: `docs/plans/F11-title-case.md`.

## R-132 · The 8px edge rule. The bottom safe-area inset is not padding.

Every screen puts its first and last rows the same **8px** past whatever boundary the system
hands it: the status bar at the top, the physical screen edge at the bottom. With a 44px
notch inset and a control's own ~14px of internal slack that lands the type **~22px off each
edge**, which is the number to check a screenshot against.

**The asymmetry is not an oversight.** The notch is hardware and the status bar is drawn
over the page, so the top has to clear `env(safe-area-inset-top)` or the clock sits on the
title. The home indicator is a hint drawn *on top of* a screen the app fully owns, so the
bottom measures from the real edge and the last row rides level with the pill rather than
stacked above the 34px reserved for it.

**Ruling: do not add `env(safe-area-inset-bottom)` to anything that sits at the bottom of
the screen.** Padding by the full inset is what this replaced, and it left every footer
floating ~26px too high — a symptom that only shows on real hardware, which is how it
survived four features. The `pb-safe` utility was **deleted** rather than deprecated, so the
old instinct has nothing to reach for.

| surface | its own bottom pad | why that number |
|---|---|---|
| tab bar | 16px | A full-bleed bar. Its own pad IS the home-indicator clearance now. |
| `/new` sticky footer | 8px | Paints to the edge; the 54px button's slack pays the rest. |
| docked sheet footer | 8px | Owns the bottom edge exactly like `/new`'s footer. |
| lightbox footer | 8px | Its 44px buttons carry the rest of the 22px. |
| toast | 22px | A floating capsule, so the rule applies to its own bottom edge and it pays in full. With a tab bar: `54 + 16 + 24`. |
| `/s/[token]` footer | 22px | A bare text link, with no tap target to borrow slack from. |
| `pb-tabbar` | 102px | `54 + 16 + 32`. No inset — the bar already reserved it once. |

`pt-safe-header` becomes `max(1.25rem, env(safe-area-inset-top) + 0.5rem)` — **52px on an
XS Max, down from 72**. The floor is for a flat phone and the desktop column, where `env()`
resolves to 0 and 8px from the window edge reads as broken.

`/new`'s column lost the `100dvh − env(safe-area-inset-bottom)` subtraction it used to need
to cancel the layout's `pb-safe`. With nothing padding it, the footer paints to the edge and
there is nothing left to subtract.

**Supersedes the vertical half of R-49.** Every horizontal measurement there still stands.

## R-133 · Fullscreen mode. The wallpaper needed somewhere to be seen.

No counterpart in the design. Five cut-out creatures scatter behind every screen (R-47), and
on `/m/[month]` almost all of that sits behind an opaque white header and a column of opaque
white cards. **Ruling: `/m/[month]` gets a fullscreen mode that retracts the app chrome and
leaves the art, the day stickers and the cards.** State is a cookie (`lib/fullscreen.ts`)
read in the `(shell)` layout, so the first paint is already correct rather than flipping
after hydration.

Three mechanics worth not breaking:

- The header **closes rather than slides**: `grid-rows-[1fr]` → `[0fr]` under
  `overflow-clip`, with its border going transparent and its background going to `paper`.
- **It keeps `pt-safe` while collapsed.** The inset half of the padding has to live on an
  element the collapse cannot take with it, or the first card lands under the clock. That is
  what `pt-header-air` — `max(0.5rem, 1.25rem − env(safe-area-inset-top))` — is for: it
  carries the decorative half only, and the two halves sum to `pt-safe-header` exactly at
  every inset. That is why neither is a plain constant.
- **`pb-tabbar` is NOT reduced in fullscreen.** The 102px band it reserves is what the
  floating toggle then sits in, so the last row clears whichever of the two is on screen.

The toggle is a 44px circle: `ink` on `paper` while the bar is up, `yellow` on `tab-bg` once
active. Inactive it is raised by `--spacing-tab + 1rem` — the bar's links *plus* its own
`pb-4` — or the chip sits 6px off the bar's top edge instead of the intended 22px.

## R-134 · `/e/[id]` opens with a 30px screen title and two icon actions.

Reverses two earlier decisions on the same header.

**The chrome label is now `text-title`.** It was an 11px eyebrow on the reasoning that "the
expense's own title is the 30px thing on this screen" — but it is not: that title is an
editable `Input` at `--text-input`. There was never a second large heading to fight, only a
chrome label two type steps below every other screen's. `/new` and `/e/[id]` are the two
`(bare)` screens and both open with chevron · title · actions; they now typeset that title
identically. The band's height is unchanged either way — the 44px icon boxes set it.

**The full-width `Hapus pengeluaran` button at the foot of the screen is gone.** Delete is a
trash glyph beside the share glyph. This **mints the icon vocabulary**: 22px (`size-5.5`),
`stroke-width: 2.5`, `stroke-linecap: square`, `stroke-linejoin: miter`, `currentColor`, and
paths drawn by hand rather than pulled from an icon set — a square-capped 2.5 stroke is the
line weight this design already draws everything else at. `gap-0.5` between the two boxes,
and `-mr-2.5` on the group so each 44px box overhangs the gutter by the same 10px the
chevron does, which puts both outermost glyphs optically flush with the column while their
targets stay full size.

`Bagikan` survives unchanged as the **`aria-label`**. The icon changed nothing about the
accessible name: same canonical string from `copy.ts`, still what voice control matches on.

Three smaller corrections on the same screen: the body gained `pt-gutter` so `Judul` is not
stuck to the header hairline; the share-link panel moved **above** the note; and an empty
note renders as a `+ Tambah Catatan` row instead of an empty box — same 48px height, same
12px/800, same ink as `+ Tambah Item`, because two different-looking "add a thing" rows on
one screen is how a design starts drifting.

`app/(bare)/e/[id]/loading.tsx` tracks this header exactly. **If it grows or loses a
control, that file is the second place to change.**

## R-135 · A day total prints only when the day holds more than one expense.

`/m/[month]`'s day heading carries that day's total on the right. On a day with a single
expense it is the group row's own total, printed twice, 8px apart. **Ruling: render it only
when `bucket.rows.length > 1`.** The design has no day total at all, so this trims an
addition rather than overruling a design value.

## R-136 · R-48 is discharged. The art is in the repo.

The five cut-outs are in `public/art/` as `dragon.png`, `sheep.png`, `mountain.png`,
`octopus.png` and `snake.png`, installed by `scripts/install-art.mjs`. `CutoutArt` resolves
them and paints. R-48's warning and its "to finish it" instructions are now history.

The scatter shipped **re-placed and scaled 1.35×**, not transcribed. The canvas composed its
arrangement against a mock holding one screenful of content; these positions are the same
five creatures placed against the real app. Mountain is dead centre, so the one
landscape-shaped creature anchors the composition; snake and sheep trade places; and the
snake sits lower, so its head clears the month header's white band instead of being cut in
half by it. Growth is applied about each creature's own centre, so the scatter keeps its
shape and only the creatures get bigger.

The sign-in layer stays at **the design's own scale**, on purpose. The page layer is
wallpaper and can be as loud as it likes behind opaque cards; the sign-in layer is a
composition that frames the wordmark and clears the copy under the button.

---

# 2026-08-19 — warm paper and two serifs (SUPERSEDED)

> Everything about **colour, typeface and type scale** below is superseded by the
> 2026-08-21 pull. What still stands: **R-34** (category codes, and the `CategoryMeta`
> contract change), **R-37** (`inputMode="numeric"`), **R-38** (no tab bar on `/e/[id]`),
> **R-39** (the breakdown is a bar list, not a donut) and **R-40** (the Indonesian copy is
> fixed). **R-35** is reversed in substance but not in method — still two webfonts' worth of
> reasoning, now spent on one. **R-36** (zero shadows) is not just kept but tightened: the
> card hairline is gone too.

## R-34 · Category identity is a two-letter mono code, not an emoji. ⚠️ contract change

The roadmap §4.1 and F03's `CATEGORY_META` specify an `emoji` per category. The design
replaces it with a **ledger mark**: `MJ`, `BH`, `TR`, `TG`, `TT`, `HB`, `KS`, `LN`.

**Ruling: adopt the codes; `emoji` is removed from `CategoryMeta`.** This is better on
three independent grounds, not just aesthetics:

- Emoji rendering varies by OS, vendor and font-version; a two-letter code is the same
  glyph everywhere and can be tinted with the category colour, which an emoji cannot.
- It is the accessibility channel. In the item row the code *is* the category — there is no
  room for a full chip — so the redundancy that makes the palette safe for colour-blind
  users comes free on every screen, not just the picker.
- It sets in IBM Plex Mono at 10px and aligns in a column. An emoji does neither.

```diff
  export type CategoryMeta = {
    id: Category
    label: string          // 'Makan & Jajan'
-   emoji: string          // '🍜'
+   code: string           // 'MJ' — two chars, uppercase, unique
    color: `--color-cat-${Category}`
    hint: string
  }
```

| key | code | label |
|---|---|---|
| `food` | `MJ` | Makan & Jajan |
| `groceries` | `BH` | Belanja Harian |
| `transport` | `TR` | Transport |
| `bills` | `TG` | Tagihan |
| `housing` | `TT` | Tempat Tinggal |
| `entertainment` | `HB` | Hiburan |
| `health` | `KS` | Kesehatan |
| `other` | `LN` | Lainnya |

**Blast radius:** F03 (`lib/categories.ts`), F05 and F07 (item rows, picker), F08 (bar-list
row heads), F09 (shared page). All were going to read `CATEGORY_META` anyway; they read a
different field.

## R-35 · Two webfonts, self-hosted through `next/font/google`. Reverses F10's system stack.

F10 chose the system stack for zero bytes. The design is **built on** the serif/mono split —
drop the fonts and the entire hierarchy collapses into one voice.

**Ruling: take the fonts, but not the way the design loads them.** The design HTML uses a
`<link>` to `fonts.googleapis.com`, which is a render-blocking third-party round trip.
`next/font/google` downloads both families at **build** time, self-hosts them from our own
origin, and emits `font-display: swap` with zero external requests:

```ts
import { Source_Serif_4, IBM_Plex_Mono } from 'next/font/google'
export const serif = Source_Serif_4({ subsets: ['latin'], display: 'swap', variable: '--font-source-serif' })
export const mono  = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500'], display: 'swap', variable: '--font-plex-mono' })
```

Latin subset only, two mono weights only, no italic on the mono. F10's performance concern
was legitimate; this answers it without giving up the design.

## R-36 · Zero shadows. Tightens F10's "two shadows".

Elevation is `--card` sitting lighter than `--paper` plus a hairline `--rule`. The bottom
sheet earns its layer from the `--scrim` behind it; the toast from inverting to ink. The
raised **Tambah** button is an ink circle breaking the tab bar's top rule — still shadowless.
This survives dark mode, where shadows are invisible anyway.

## R-37 · `inputMode="numeric"`, and R-32 is reversed.

R-32 accepted F10's `decimal`. The design specifies `numeric` **with dots inserted as you
type, never typed** — so there is no separator for the user to enter and no decimal to
reach for. `numeric` is correct; my original brief was right for a reason I hadn't
articulated. The `Rp` prefix sits *outside* the editable value, as a static mono span.

## R-38 · No tab bar on `/e/[id]`. Reverses F07.

The prototype shows the tab bar on `month`, `add` and `stats` only. Detail gets a header
with `‹` back, a mono "Detail" label, and **Bagikan** as a text button top-right.

**Ruling: the design is right** — detail is a pushed view, not a tab destination, and this
is the platform convention the user's thumb already expects. F07's route group holds; `/e/`
moves outside it, joining `/new` and `/s/`.

## R-39 · The category breakdown was already a bar list. R-3 confirmed independently.

The design's `/stats` renders each category as a row — code, label, amount, then a 4px
progress bar tinted with the category colour. That is exactly what F08's validator forced
us to. Two independent processes reaching the same answer is the strongest signal we have
that R-3 was right.

The 12-month chart is plain bars: current month in `--accent`, the rest in `--rule`,
single-letter labels beneath. Zero-height months are visible as bare labels.

## R-40 · Copy is now fixed, in Indonesian.

The prototype settles wording that was `TBD` across five plans. These strings are canonical:

| Where | String |
|---|---|
| Sign-in eyebrow / title / sub | `expensetracking.online` · `Expense Tracking` · `Catat pengeluaran dengan sekali tempel.` |
| Google button | `Lanjut dengan Google` |
| Month meta line | `6 catatan · 18 item` |
| Empty state | `Belum ada catatan` / `Bulan ini masih kosong. Tempel catatan pertamamu di tab Tambah.` |
| Parse button / loading | `Rapikan` · `Merapikan catatanmu…` |
| Draft actions | `Simpan` · `Ulangi dari teks` · `+ Tambah item` |
| Field labels | `Judul` · `Nama` · `Jumlah` · `Foto` · `Total` |
| Sheets | `Pilih kategori` · `Ubah item` |
| Toasts | `Item dihapus` · `Pengeluaran dihapus` · `Tersimpan` · `Urungkan` |
| Destructive | `Hapus pengeluaran` |
| Share footer | `Dibagikan lewat expensetracking.online` |
| Photo badge | `⧉ 3` (glyph + count, inside the mono meta line) |

## R-41 · Measurements to build to

Screen gutter **22px**; 4pt spacing base. Buttons **52px** tall, small variant **44px**.
Inputs **48px** tall at **17px** text. Item rows **min 52px**, group rows **min 56px**.
Delete target a full **44×44**. Photo thumbnails 3-up at **6px** gaps; the draft strip uses
**74×74** tiles. Sheet: grabber 36×4, `--r-card` top corners, no close button — tapping the
scrim dismisses. Lightbox goes true black `#0d0d0b` **in both schemes**, because photos want
a dark room.

---

## Still to verify before `/stats` ships

**R-28 stands and now has real numbers to check.** F08 validated its palette against
surfaces `#fcfcfb` / `#1a1a19`; the design's actual surfaces are `--card` `#fbfaf5` /
`#1e1e1a` and `--paper` `#f0ede4` / `#131311`. Close, but not identical, and three
light-mode slots were already near the 3:1 relief floor. **Re-run the `dataviz` validator
against `docs/design/tokens.css` before building the chart**, and treat a failure as a
reason to nudge a hue, not to ship it.

The design claims ≥4.5:1 for every category on its own surface. That is a claim to verify,
not an assumption to inherit — the same standard I held F08 to.

---

## Verified by F10 (2026-08-19)

**R-28 is discharged.** `scripts/palette-check.py` now measures the design's real surfaces
(`--card` `#fbfaf5` / `#1e1e1a`, `--paper` `#f0ede4` / `#131311`) rather than the ones F08 guessed at.

The design's claim of ≥4.5:1 for every category on its own surface **holds** — and it was held to the
stricter standard on purpose, because the two-letter code renders the category colour as *text*, not
as a chart fill:

| | light, on card | light, on paper | dark, on card | dark, on paper |
|---|---|---|---|---|
| range across the eight | 5.08 – 7.10 | 4.53 – 6.34 | 5.78 – 7.76 | 6.43 – 8.63 |

`paper` on a selected chip's fill also clears 4.5:1 in both schemes (4.53 – 6.34 light, 6.43 – 8.63
dark), so the "text flips to paper" trick in R-34 is sound rather than lucky.

**Two failures elsewhere in the palette were found and fixed, not waived:**

- `--ink-3` measured **2.85:1** on paper. It is every label, meta line, placeholder and inactive tab
  label — small text with no large-text exemption. Darkened along its hue to `#6e6c61` / `#86857b`
  (R-48).
- A third line token, `--rule-strong`, was added for the border that *identifies a control*, which
  WCAG 1.4.11 holds to 3:1 and `--rule` misses at 1.28:1 (R-49).

**One waiver, with an expiry.** Pairwise separation between the eight hues is ΔE 0.065 light / 0.042
dark, below the 0.10 categorical floor. Accepted because nothing in this design keys a category by
colour alone — the code is always present, the 12-month chart has no categorical series, and the
breakdown is a labelled bar list. The checker prints the waiver and its expiry on every run: **it
lapses the moment a view identifies a category by colour alone** (R-50).

Also corrected: `tokens.css` declares the eight category values as `--color-cat-<key>` and then
re-declares those same names inside `@theme inline`, which is a circular reference that computes to
nothing. `app/globals.css` splits the raw value from the alias (R-47). The values here are unchanged
and remain the provenance record.

**On the numbering:** these rulings, R-34…R-41, are the canonical R-34…R-41. F03a's addendum in
`RECONCILIATION_v0.1.0.md` had independently reused the same five numbers and has been renumbered to
R-42…R-46. F10's own rulings continue at R-47.
