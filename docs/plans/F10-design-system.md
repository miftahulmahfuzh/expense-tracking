# F10 — Design System & iOS Polish

**Depends on:** F01 (Next 16 + TS + Tailwind v4 scaffold)
**Blocks:** F05, F06, F07, F08, F09 — five features import these primitives.
**Wave:** 1 (lands alongside F01, before the data layer)

**F10 owns:** `app/globals.css`, `app/layout.tsx`, the two route-group layouts, `components/ui/**`, `lib/categories.ts`, `lib/cn.ts`, the money half of `lib/format.ts`, `app/manifest.ts`, all icon assets.

**F10 does not own:** any screen. Screens are F05/F07/F08/F09. If you find yourself writing a page in this plan, stop.

---

## STATUS — implemented 2026-08-19, and this plan is partly superseded

**Read this before trusting anything below it.**

F10 executed after the Claude Design pull, so two committed documents outrank most of this file:

1. `docs/RECONCILIATION_v0.1.0.md` — the arbitration record. R-7, R-8, R-9, R-24, R-25 change what
   F10 owns; the *Addendum — rulings from F10* (R-47…R-53) records every decision implementation
   forced.
2. `docs/design/DESIGN_INTEGRATION.md` — the design pull (R-34…R-41). It replaced the palette, both
   font families, the type scale, the shadow policy and the category glyph.

What survived from this plan is its **structure**: the `--color-*` / `--text-*` namespace reset, the
iOS base layer, the money rail, the utilities, the component classes, the native-`<dialog>` sheet,
the route-group split, the PWA metadata, and every component's props. What did not survive is every
colour value, both typefaces, the type scale, `lib/categories.ts` and `lib/format.ts` ownership, and
several component defaults.

Concretely, in this file:

| Section | Status |
|---|---|
| §0 Design direction | **Superseded.** The direction is warm paper + ink with a serif/mono split, not a single ink accent on grey. Read DESIGN_INTEGRATION.md's opening paragraph instead. |
| Contract deltas D-1, D-2 | **Overturned** by R-7 and R-8. F03a owns `lib/categories.ts` and all of `lib/format.ts`; F10 imports both. |
| Contract delta D-3 | **Accepted** — `formatIdrDigits` shipped. |
| Contract delta D-4 | **Accepted** as R-24 and verified against a real build. |
| Task 1 | Done. Tailwind v4 wiring confirmed CSS-first, no `tailwind.config.js`. |
| Tasks 2–5 | **Values superseded, structure shipped.** See `app/globals.css`, whose comments carry the reasoning. |
| Task 6 | `lib/cn.ts` shipped. `lib/categories.ts` was F03a's; F10 changed one field per design R-34. |
| Task 7 | **Not done, correctly** — R-8 makes F03a's `lib/format.ts` canonical. |
| Tasks 8–11, 13–15 | Shipped, restyled to the design. Prop-level deltas are in R-52. |
| Task 12 (fonts) | **Reversed** by design R-35: two self-hosted webfonts, not the system stack. |
| Visual QA + Accessibility checklists | **Still outstanding.** They need a device. See the end of the F10 addendum. |
| Contrast tables under *Accessibility pass* | **Stale** — they describe the OKLCH palette. The live numbers come from `scripts/palette-check.py`. |
| *Interfaces I publish* | **Rewritten to match what shipped.** This is the section to read. |
| Appendix | **Replaced** by the committed `scripts/palette-check.py`. |

---

## 0. Design direction — read this before writing any CSS

The brief is one sentence: *"the core UI/UX tenet is simplicity. make the UI to be intuitive and simple at the same time. i am a simple guy, i love simple things."* That is not permission to be bland. It is a constraint that forces every decision to be load-bearing.

Three commitments, and everything in this plan derives from them:

**1. Chrome is ink. Colour only ever means something.**
There is exactly one accent and it is not a hue — it is *ink*: a near-black with a faint blue cast in light mode, a near-white with the same cast in dark mode. It is always the highest-contrast element on the page. Primary buttons, the raised **Tambah** button, the active tab, the focus ring: all ink. Nothing in the app is coloured for decoration. If you see colour, it is carrying information — a category, a danger, a success. That single rule is why an eight-colour category palette can coexist with a calm interface: the palette lives entirely inside chips and charts, never in the furniture.

This is also why the accent is deliberately *not* a saturated hue. A blue primary button would sit in the same visual register as the `transport` chip and the app would read as a fintech dashboard. Ink cannot be confused with data.

**2. Every amount in the app lives on one right-hand rail.**
Money is the hero content. The signature is not an ornament, it is alignment: on every list, every row, every card, the amount is right-aligned in a shared column with tabular figures, so scrolling a month reads as scanning a single column of numbers. `Rp 38.500` and `Rp 266.350` line up digit-for-digit. This is the `rail` grid utility plus `font-variant-numeric: tabular-nums`, and it is enforced by the `Money` component so no feature can opt out by accident.

**3. Two shadows in the entire application, and both belong to things that literally float.**
Cards are separated by a hairline border, not a shadow. This is not only taste — shadows disappear on a dark background and borders do not, so a border-based system is the one that survives both themes without a second vocabulary. The only shadowed objects are the raised **Tambah** button and the bottom sheet, because both are physically above the page.

Deliberately **not** doing: gradients, glassmorphism, a card that lifts on hover (there is no hover on a phone), an icon library, a splash-screen matrix, drag-to-dismiss on the sheet, a settings screen, a theme toggle. Chanel's rule — take one thing off before leaving the house. The thing taken off was a dotted leader line between item name and amount on list rows. The alignment already does that job; the dots were decoration.

**Copy voice:** Indonesian-flavoured, sentence case, verbs. `Simpan`, `Rapikan`, `Tambah item`, `Urungkan`, `Hapus`. Errors state what happened and what to do, never apologise. Empty screens are invitations, not shrugs.

---

## Contract deltas

Four. Each is additive or a clarification; none contradicts the roadmap.

**D-1 — `lib/categories.ts` is authored by F10, not F03.**
Roadmap §4.1 places the file in the contract but does not assign an owner; §5/F03 lists it implicitly. F10 ships in wave 1 and `Chip`/`CategoryPicker` cannot exist without it, whereas F03 only needs `CATEGORIES` for a `z.enum`. **F10 creates the file exactly as §4.1 specifies and F03 imports from it.** F03 must not redeclare `CATEGORIES`.

**D-2 — F10 ships the money half of `lib/format.ts`.**
`MoneyInput` needs `parseIdrLoose` and `Money` needs `formatIdr`, both listed under §4.7 (F03). F10 is wave 1, F03 is wave 2. **F10 creates `lib/format.ts` containing `formatIdr`, `formatIdrDigits` and `parseIdrLoose` only. F03 appends `TZ`, `todayJakartaISO()` and `monthKey()` to the same file and must not redefine the three money functions.** If `lib/format.ts` already exists when this plan is executed, merge rather than overwrite.

**D-3 — §4.7 gains one export: `formatIdrDigits(n: number): string` → `"38.500"`.**
`formatIdr` becomes `` `Rp ${formatIdrDigits(n)}` ``. `Money` needs the digits without the prefix so it can typeset `Rp` at a smaller optical size in a muted colour. Behaviour of `formatIdr` is unchanged.

**D-4 — the `--color-*` and `--text-*` Tailwind namespaces are reset.**
`bg-red-500`, `text-gray-700`, `text-sm`, `text-2xl` and every other stock Tailwind colour and size utility are **removed from the build**. Only the tokens in §1 exist. This is the mechanism that keeps five parallel feature plans on one design system instead of three. Every feature author must read *Interfaces I publish → Token reference* before writing a class name. `--radius-*`, `--shadow-*` and `--spacing` are *extended*, not reset, so `rounded-full`, `shadow-none` and the numeric spacing scale all still work.

---

## Task list

Tasks are sized to be finished and verified one at a time. Commit checkpoints are marked **✅ COMMIT**.

### Task 1 — Confirm the Tailwind v4 wiring F01 left behind

Tailwind v4 has **no `tailwind.config.js`**. Configuration is CSS-first via `@theme` in a stylesheet. Confirm F01 set it up the v4 way and not the v3 way.

```bash
cd /home/miftah/expense-tracking
cat package.json | grep -E '"(tailwindcss|@tailwindcss/postcss|next|react)"'
cat postcss.config.mjs
ls tailwind.config.* 2>/dev/null && echo "!! v3 config present — see below" || echo "ok: no v3 config"
grep -rn '@import "tailwindcss"' app/
```

Expected:

```
"next": "16.3.1"
"react": "19.2.8"
"tailwindcss": "4.3.3"
"@tailwindcss/postcss": "^4.3.3"
```

```js
// postcss.config.mjs
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

```
ok: no v3 config
app/globals.css:1:@import "tailwindcss";
```

If `tailwind.config.js` exists, delete it — unless it is referenced by an `@config` directive, in which case remove that directive first. If `postcss.config.mjs` still lists `tailwindcss` and `autoprefixer` as separate plugins, that is the v3 shape; replace it with the block above (`@tailwindcss/postcss` includes autoprefixing).

> **v4 facts this plan relies on** (verified against the v4 docs, not assumed from v3):
> - `@theme` must be **top level**. It cannot be nested inside a media query. This is why theme-reactive colours use the two-layer pattern in Task 2.
> - `@theme inline { --color-x: var(--raw) }` makes utilities emit `var(--raw)` instead of copying the value, which is what lets a token flip under `prefers-color-scheme`.
> - `--namespace-*: initial` inside `@theme` removes every default in that namespace.
> - `dark:` defaults to `@media (prefers-color-scheme: dark)` with no configuration. We barely use it — the tokens do the work — but it is available.
> - In v4 `border` and `divide` default to `currentColor`, not gray-200. Task 3 restores a sane default.
> - `ring` is 1px and `currentColor` by default. `outline-none` is now `outline-hidden`.

---

### Task 2 — `app/globals.css`, part 1: the raw palette

Create `app/globals.css` (replacing whatever F01 scaffolded). This task writes the top of the file only.

Every token is declared in the `:root` block **and** redeclared in the dark block. Never declare a token only inside the media query — a token that exists in one theme and not the other is how you ship a white-on-white screen.

```css
/* app/globals.css */
@import "tailwindcss";

/* ==========================================================================
   1. RAW PALETTE
   The only place a literal colour appears in this repository.
   Written in oklch: perceptually uniform lightness, so "one step darker"
   means the same thing for every hue, and every value below has been checked
   to be inside the sRGB gamut (no browser gamut-mapping surprises).
   ========================================================================== */

:root {
  color-scheme: light dark;

  /* -- surfaces: exactly three ------------------------------------------ */
  --app-surface:        oklch(0.968 0.004 265); /* page background   #F3F4F7 */
  --app-surface-raised: oklch(1.000 0.000 265); /* cards, sheet, bar #FFFFFF */
  --app-surface-sunken: oklch(0.938 0.006 265); /* input wells       #E8EAEF */

  /* -- lines: hairline and emphasis -------------------------------------- */
  --app-border:         oklch(0.895 0.008 265); /*                   #DADCE2 */
  --app-border-strong:  oklch(0.810 0.010 265); /*                   #BEC1C8 */

  /* -- text --------------------------------------------------------------- */
  --app-text:           oklch(0.240 0.014 265); /*                   #1C1F26 */
  --app-text-muted:     oklch(0.540 0.014 265); /*                   #6B6F77 */

  /* -- accent = ink. Always the highest-contrast element on the page. ----- */
  --app-accent:         oklch(0.305 0.058 265); /*                   #212E4C */
  --app-accent-fg:      oklch(0.990 0.002 265); /* on accent         #FBFCFD */
  --app-accent-soft:    oklch(0.945 0.020 265); /* selected rows     #E6EDFB */

  /* -- status -------------------------------------------------------------- */
  --app-danger:         oklch(0.530 0.200 25);  /*                   #C51D28 */
  --app-danger-soft:    oklch(0.955 0.020 25);  /*                   #FEEBE9 */
  --app-success:        oklch(0.505 0.134 150); /*                   #0E7938 */

  /* -- the 8 categories: chart fill --------------------------------------- */
  --cat-food:           oklch(0.645 0.131 80);  /* amber   #B7830C */
  --cat-groceries:      oklch(0.580 0.150 146); /* green   #2F913E */
  --cat-transport:      oklch(0.545 0.187 257); /* blue    #0C6BDA */
  --cat-bills:          oklch(0.575 0.190 25);  /* red     #D2393A */
  --cat-housing:        oklch(0.615 0.180 303); /* violet  #9B63DC */
  --cat-entertainment:  oklch(0.660 0.160 348); /* pink    #D664A3 */
  --cat-health:         oklch(0.622 0.104 200); /* teal    #0C999F */
  --cat-other:          oklch(0.600 0.016 265); /* grey    #7B808A */

  /* -- the 8 categories: text-safe ink (chips, legends, labels) ----------- */
  --cat-food-ink:          oklch(0.470 0.094 80);  /* #765408 */
  --cat-groceries-ink:     oklch(0.445 0.131 146); /* #0A6620 */
  --cat-transport-ink:     oklch(0.450 0.154 257); /* #0852A8 */
  --cat-bills-ink:         oklch(0.455 0.178 25);  /* #A30D1C */
  --cat-housing-ink:       oklch(0.455 0.180 303); /* #6C31A6 */
  --cat-entertainment-ink: oklch(0.460 0.160 348); /* #932467 */
  --cat-health-ink:        oklch(0.455 0.075 200); /* #096367 */
  --cat-other-ink:         oklch(0.450 0.016 265); /* #51555E */

  /* -- shadows: exactly two, both for things that physically float -------- */
  --app-shadow-raise:
    0 1px 2px oklch(0.24 0.02 265 / 0.10),
    0 8px 20px -8px oklch(0.24 0.02 265 / 0.28);
  --app-shadow-sheet:
    0 -8px 40px -12px oklch(0.18 0.02 265 / 0.30);

  /* -- modal scrim. Deliberately theme-independent: ::backdrop custom-
        property inheritance is not reliable across the Safari versions we
        care about, so this value is hard-coded in the dialog rule too. ---- */
  --app-scrim: rgb(0 0 0 / 0.42);
}

@media (prefers-color-scheme: dark) {
  :root {
    --app-surface:        oklch(0.165 0.010 265); /* #0C0E13 */
    --app-surface-raised: oklch(0.215 0.012 265); /* #17191F */
    --app-surface-sunken: oklch(0.128 0.010 265); /* #05070B */

    --app-border:         oklch(0.315 0.014 265); /* #2E3239 */
    --app-border-strong:  oklch(0.410 0.016 265); /* #464A53 */

    --app-text:           oklch(0.965 0.004 265); /* #F2F3F6 */
    --app-text-muted:     oklch(0.710 0.012 265); /* #9EA2A9 */

    /* ink inverts: still the highest-contrast element on the page */
    --app-accent:         oklch(0.935 0.030 265); /* #E0EAFE */
    --app-accent-fg:      oklch(0.205 0.022 265); /* #121721 */
    --app-accent-soft:    oklch(0.285 0.030 265); /* #232A39 */

    --app-danger:         oklch(0.700 0.170 25);  /* #F66D67 */
    --app-danger-soft:    oklch(0.300 0.060 25);  /* #47211E */
    --app-success:        oklch(0.760 0.140 150); /* #68CA80 */

    --cat-food:           oklch(0.790 0.150 80);  /* #ECAE30 */
    --cat-groceries:      oklch(0.735 0.140 146); /* #6AC072 */
    --cat-transport:      oklch(0.700 0.153 257); /* #5C9FFC */
    --cat-bills:          oklch(0.720 0.168 25);  /* #FC746D */
    --cat-housing:        oklch(0.735 0.160 303); /* #BE8EFB */
    --cat-entertainment:  oklch(0.775 0.140 348); /* #F68FC5 */
    --cat-health:         oklch(0.800 0.100 200); /* #64D1D7 */
    --cat-other:          oklch(0.700 0.015 265); /* #9A9EA8 */

    --cat-food-ink:          oklch(0.855 0.120 80);  /* #F9C76F */
    --cat-groceries-ink:     oklch(0.845 0.112 146); /* #9CE0A0 */
    --cat-transport-ink:     oklch(0.820 0.088 257); /* #A0C7FD */
    --cat-bills-ink:         oklch(0.835 0.088 25);  /* #FDB3AC */
    --cat-housing-ink:       oklch(0.840 0.093 303); /* #D7BCFD */
    --cat-entertainment-ink: oklch(0.850 0.096 348); /* #FDB4D9 */
    --cat-health-ink:        oklch(0.865 0.080 200); /* #91E3E7 */
    --cat-other-ink:         oklch(0.830 0.012 265); /* #C3C7CF */

    --app-shadow-raise:
      0 1px 2px oklch(0 0 0 / 0.40),
      0 10px 28px -10px oklch(0 0 0 / 0.65);
    --app-shadow-sheet:
      0 -8px 44px -12px oklch(0 0 0 / 0.70);

    --app-scrim: rgb(0 0 0 / 0.58);
  }
}
```

**Why the category hues sit where they do.** Seven chromatic hues spread around the wheel at 25° / 80° / 146° / 200° / 257° / 303° / 348°, plus one deliberately achromatic grey for `other`. Lightness is *varied* rather than uniform (L 0.545 → 0.660 in light, 0.700 → 0.800 in dark) so that adjacent donut segments differ on two channels, not just hue — the standard fix for eight-series categorical palettes. `other` is the only greyscale entry, which is exactly right semantically: "Lainnya" should not shout.

---

### Task 3 — `app/globals.css`, part 2: the Tailwind theme

Append to the same file. Two `@theme` blocks: a static one that resets namespaces and defines everything that does not change with the theme, and an `inline` one that bridges the raw palette into utility classes.

```css
/* ==========================================================================
   2. TAILWIND THEME (static)
   ========================================================================== */

@theme {
  /* Reset the two namespaces we own completely. bg-red-500 and text-sm cease
     to exist; there is exactly one design system in this repo. See D-4. */
  --color-*: initial;
  --text-*: initial;

  /* the four the framework itself needs back */
  --color-transparent: transparent;
  --color-current: currentColor;
  --color-white: #fff;
  --color-black: #000;

  /* -- type scale, tuned for a 414px column ------------------------------ */
  --text-micro: 0.6875rem;                 /* 11 — eyebrows, uppercase only */
  --text-micro--line-height: 1rem;
  --text-micro--letter-spacing: 0.06em;
  --text-micro--font-weight: 600;

  --text-meta: 0.8125rem;                  /* 13 — dates, counts, captions  */
  --text-meta--line-height: 1.125rem;
  --text-meta--letter-spacing: 0.004em;

  --text-label: 0.9375rem;                 /* 15 — field labels, chip text  */
  --text-label--line-height: 1.25rem;

  --text-body: 1.0625rem;                  /* 17 — body AND the input floor */
  --text-body--line-height: 1.5rem;

  --text-lead: 1.25rem;                    /* 20 — per-expense total        */
  --text-lead--line-height: 1.625rem;
  --text-lead--letter-spacing: -0.012em;

  --text-title: 1.5rem;                    /* 24 — page + group titles      */
  --text-title--line-height: 1.75rem;
  --text-title--letter-spacing: -0.020em;

  --text-hero: 2.5rem;                     /* 40 — the month total          */
  --text-hero--line-height: 2.5rem;
  --text-hero--letter-spacing: -0.032em;

  /* -- families (see Task 12 for the reasoning) -------------------------- */
  --font-sans: system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  /* -- named spacing on top of the default 4px scale --------------------- */
  --spacing-gutter: 1.25rem;   /* 20px — page inset at 414px               */
  --spacing-touch: 2.75rem;    /* 44px — the tap-target floor              */
  --spacing-tab: 3.5rem;       /* 56px — tab bar height, excl. safe area   */

  /* -- the mobile column ------------------------------------------------- */
  --container-app: 30rem;      /* 480px → max-w-app                        */

  /* -- radii: four steps, that is the entire vocabulary ------------------ */
  --radius-sm: 0.5rem;         /* 8  — chips, small controls               */
  --radius-md: 0.75rem;        /* 12 — buttons, inputs                     */
  --radius-lg: 1.125rem;       /* 18 — cards                               */
  --radius-xl: 1.375rem;       /* 22 — sheet top corners                   */

  /* -- one easing curve -------------------------------------------------- */
  --ease-out-soft: cubic-bezier(0.32, 0.72, 0, 1);
}

/* ==========================================================================
   3. TAILWIND THEME (inline) — bridges the raw palette to utilities.
   `inline` makes `bg-surface` compile to `background-color: var(--app-surface)`
   rather than baking the light value in, which is what lets it flip under
   prefers-color-scheme. @theme cannot live inside a media query, so this
   two-layer arrangement is the v4 way, not a workaround.
   ========================================================================== */

@theme inline {
  --color-surface:        var(--app-surface);
  --color-surface-raised: var(--app-surface-raised);
  --color-surface-sunken: var(--app-surface-sunken);

  --color-border:         var(--app-border);
  --color-border-strong:  var(--app-border-strong);

  --color-text:           var(--app-text);
  --color-text-muted:     var(--app-text-muted);

  --color-accent:         var(--app-accent);
  --color-accent-fg:      var(--app-accent-fg);
  --color-accent-soft:    var(--app-accent-soft);

  --color-danger:         var(--app-danger);
  --color-danger-soft:    var(--app-danger-soft);
  --color-success:        var(--app-success);

  --color-cat-food:          var(--cat-food);
  --color-cat-groceries:     var(--cat-groceries);
  --color-cat-transport:     var(--cat-transport);
  --color-cat-bills:         var(--cat-bills);
  --color-cat-housing:       var(--cat-housing);
  --color-cat-entertainment: var(--cat-entertainment);
  --color-cat-health:        var(--cat-health);
  --color-cat-other:         var(--cat-other);

  --color-cat-food-ink:          var(--cat-food-ink);
  --color-cat-groceries-ink:     var(--cat-groceries-ink);
  --color-cat-transport-ink:     var(--cat-transport-ink);
  --color-cat-bills-ink:         var(--cat-bills-ink);
  --color-cat-housing-ink:       var(--cat-housing-ink);
  --color-cat-entertainment-ink: var(--cat-entertainment-ink);
  --color-cat-health-ink:        var(--cat-health-ink);
  --color-cat-other-ink:         var(--cat-other-ink);

  --shadow-raise: var(--app-shadow-raise);
  --shadow-sheet: var(--app-shadow-sheet);
}
```

**Verify the namespace reset actually took effect** before moving on:

```bash
npm run build >/dev/null 2>&1
CSS=$(find .next/static/css -name '*.css' | head -1)
grep -c 'bg-red-500\|\.text-sm{' "$CSS"        # expect: 0
grep -c 'bg-surface\|text-hero'   "$CSS"        # expect: >0
```

Expected: `0` then a non-zero number. If the first is non-zero, the reset is in the wrong block or after the definitions — the `--color-*: initial` line must come **first** inside the static `@theme`.

---

### Task 4 — `app/globals.css`, part 3: base layer and the iOS rules

Every rule in this block is here because Safari on an iPhone does something specific and annoying without it.

```css
/* ==========================================================================
   4. BASE
   ========================================================================== */

@layer base {
  /* v4 defaults border-color to currentColor; restore a sane hairline so a
     bare `border` class never paints a text-coloured 1px line. */
  *, ::before, ::after, ::backdrop, ::file-selector-button {
    border-color: var(--app-border);
  }

  html {
    background-color: var(--app-surface);
    /* Safari enlarges text on rotation without this. */
    -webkit-text-size-adjust: 100%;
    /* Kill the grey flash on every tap. A real :active state replaces it —
       see the `press` utility. Never ship one without the other. */
    -webkit-tap-highlight-color: transparent;
  }

  body {
    /* 100dvh, never 100vh: 100vh on iOS Safari is the URL-bar-collapsed
       height, so a 100vh layout is ~80px too tall until you scroll. */
    min-height: 100dvh;
    background-color: var(--app-surface);
    color: var(--app-text);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    line-height: 1.5rem;
    -webkit-font-smoothing: antialiased;
    /* Stop the whole document rubber-banding. Scrollable panes opt back in
       with `scroll-pane`, which contains their own overscroll. */
    overscroll-behavior-y: none;
  }

  /* ---- THE 16px RULE ---------------------------------------------------
     Safari zooms the entire page when a text field smaller than 16px takes
     focus, then leaves you zoomed. There is no CSS to prevent the zoom other
     than the font-size itself, and the "fix" you will find online
     (user-scalable=no) disables pinch-zoom for everyone, which is an
     accessibility failure and is banned in this repo. We use 17px, giving a
     1px margin against rounding.
     ---------------------------------------------------------------------- */
  input, textarea, select {
    font-family: inherit;
    font-size: 1.0625rem;   /* 17px — do not lower this. Ever. */
    line-height: 1.5rem;
    color: inherit;
    background-color: transparent;
    border-radius: 0;       /* iOS rounds inputs by default */
    -webkit-appearance: none;
    appearance: none;
  }
  button { font-family: inherit; font-size: inherit; }

  /* iOS renders a magnifier/clear affordance we did not ask for */
  input[type="search"]::-webkit-search-decoration,
  input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }
  input::-webkit-date-and-time-value { text-align: left; }

  /* Focus ring: keyboard only. A touch tap must not leave a ring behind. */
  :where(a, button, input, textarea, select, summary, [tabindex]):focus:not(:focus-visible) {
    outline: none;
  }
  :where(a, button, input, textarea, select, summary, [tabindex]):focus-visible {
    outline: 2px solid var(--app-accent);
    outline-offset: 2px;
  }

  ::selection { background-color: var(--app-accent-soft); color: var(--app-text); }

  /* Headings inherit; we set every size explicitly at the call site. */
  h1, h2, h3, h4 { font-weight: 650; letter-spacing: -0.015em; }

  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

---

### Task 5 — `app/globals.css`, part 4: utilities and component classes

```css
/* ==========================================================================
   5. UTILITIES
   ========================================================================== */

/* Tabular figures. Applied by <Money> automatically; use directly for any
   other column of numbers (item counts, percentages in F08). */
@utility tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* THE MONEY RAIL. Label on the left, amount right-aligned in a shared column,
   baselines locked. Every list row in the app uses this. */
@utility rail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: 0.75rem;
}

/* Tap feedback that replaces the tap-highlight we removed. */
@utility press {
  transition: transform 120ms var(--ease-out-soft), opacity 120ms var(--ease-out-soft);
  &:active { transform: scale(0.975); opacity: 0.92; }
  @media (prefers-reduced-motion: reduce) {
    &:active { transform: none; }
  }
}

/* Expands a visually-small control to a 44×44 hit area without changing its
   painted size. Used by Chip, the row delete affordance, chevrons. */
@utility touch-target {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: max(100%, var(--spacing-touch));
    height: max(100%, var(--spacing-touch));
    transform: translate(-50%, -50%);
  }
}

/* Safe areas. `env()` returns 0 on non-notched devices, so these are free. */
@utility pt-safe { padding-top: env(safe-area-inset-top); }
@utility pb-safe { padding-bottom: env(safe-area-inset-bottom); }
@utility px-safe {
  padding-left:  max(var(--spacing-gutter), env(safe-area-inset-left));
  padding-right: max(var(--spacing-gutter), env(safe-area-inset-right));
}
/* Sticky header: gutter + the notch. */
@utility pt-safe-header { padding-top: calc(env(safe-area-inset-top) + 0.75rem); }
/* Bottom of a scrolling page, so content clears the tab bar + home indicator. */
@utility pb-tabbar {
  padding-bottom: calc(var(--spacing-tab) + env(safe-area-inset-bottom) + 1.5rem);
}

/* Any independently scrolling region. Contains its own rubber-band so the
   page behind it never moves. */
@utility scroll-pane {
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* ==========================================================================
   6. COMPONENT CLASSES
   Only for things utilities cannot express: ::backdrop, @starting-style,
   and colour-mix driven by a runtime custom property.
   ========================================================================== */

@layer components {
  /* ---- Chip -------------------------------------------------------------
     Colour comes in as --c / --ci set inline by the Chip component, so there
     is one rule instead of eight. */
  .chip-surface {
    background-color: color-mix(in oklab, var(--c) 14%, var(--app-surface-raised));
    color: var(--ci);
  }
  .chip-surface[data-selected="true"] {
    background-color: color-mix(in oklab, var(--c) 22%, var(--app-surface-raised));
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .chip-dot { background-color: var(--c); }

  /* ---- Sheet (native <dialog>) -----------------------------------------
     <dialog>.showModal() gives us focus trapping, Escape and inertness for
     free. We only supply motion and geometry.
     The base rule is the CLOSED state; [open] is the open state;
     @starting-style provides the entry frame. display/overlay transition with
     allow-discrete so the exit animation is allowed to finish. */
  .sheet {
    display: none;
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
    align-items: flex-end;
    justify-content: center;
    transition-property: display, overlay;
    transition-duration: 280ms;
    transition-behavior: allow-discrete;
  }
  .sheet[open] { display: flex; }

  .sheet::backdrop {
    /* hard-coded on purpose: ::backdrop custom-property inheritance is not
       dependable on the Safari versions we target */
    background: rgb(0 0 0 / 0.42);
    opacity: 0;
    transition: opacity 280ms var(--ease-out-soft),
                display 280ms allow-discrete,
                overlay 280ms allow-discrete;
  }
  .sheet[open]::backdrop { opacity: 1; }
  @starting-style { .sheet[open]::backdrop { opacity: 0; } }

  @media (prefers-color-scheme: dark) {
    .sheet::backdrop { background: rgb(0 0 0 / 0.58); }
  }

  .sheet-panel {
    width: 100%;
    max-width: var(--container-app);
    max-height: 88dvh;
    display: flex;
    flex-direction: column;
    background-color: var(--app-surface-raised);
    color: var(--app-text);
    border-top-left-radius: var(--radius-xl);
    border-top-right-radius: var(--radius-xl);
    box-shadow: var(--app-shadow-sheet);
    transform: translateY(100%);
    transition: transform 280ms var(--ease-out-soft);
    will-change: transform;
  }
  .sheet[open] .sheet-panel { transform: translateY(0); }
  @starting-style { .sheet[open] .sheet-panel { transform: translateY(100%); } }

  @media (prefers-reduced-motion: reduce) {
    .sheet, .sheet::backdrop, .sheet-panel { transition-duration: 1ms; }
  }

  /* ---- Toast placement --------------------------------------------------
     Sits above the tab bar when there is one, above the home indicator when
     there is not. `:has()` keeps this declarative — no JS measuring. */
  :root { --toast-bottom: calc(env(safe-area-inset-bottom) + 1rem); }
  :root:has([data-tabbar]) {
    --toast-bottom: calc(var(--spacing-tab) + env(safe-area-inset-bottom) + 0.75rem);
  }

  /* ---- Skeleton (F05's parse placeholder, F07/F08 loading) ------------- */
  .skeleton {
    background-color: var(--app-surface-sunken);
    border-radius: var(--radius-sm);
    animation: skeleton-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }
}
```

> **`@starting-style` support note.** Safari 17.4+ and Chrome 117+ support it. An iPhone XS Max runs up to iOS 18, so the target device is covered. On anything older the sheet appears without a slide — it still opens, closes, traps focus and dismisses correctly. Degradation is cosmetic; do not add a JS animation fallback.

**✅ COMMIT**

```bash
git add app/globals.css
git commit -m "feat(design): Tailwind v4 token system, iOS base layer, sheet + rail primitives"
```

---

### Task 6 — `lib/cn.ts` and `lib/categories.ts`

No `clsx`, no `tailwind-merge`. A five-line join is enough because every component puts the caller's `className` last, so later utilities win on source order.

```ts
// lib/cn.ts
export type ClassValue = string | false | null | undefined

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ")
}
```

```ts
// lib/categories.ts
// Authored by F10 (see Contract delta D-1). F03 imports CATEGORIES from here
// for its z.enum and must not redeclare it.

export const CATEGORIES = [
  "food",          // Makan & Jajan — warung, resto, kopi, snack
  "groceries",     // Belanja Harian — Indomaret, Alfamart, supermarket
  "transport",     // Transport — bensin, parkir, tol, ojek, grab
  "bills",         // Tagihan — internet, listrik, pulsa, IPL, iuran
  "housing",       // Tempat Tinggal — sewa apartemen, kos, service charge
  "entertainment", // Hiburan — bioskop, game, langganan streaming
  "health",        // Kesehatan — obat, dokter, vitamin
  "other",         // Lainnya
] as const

export type Category = (typeof CATEGORIES)[number]

export interface CategoryMeta {
  key: Category
  /** Indonesian label shown to the user. */
  label: string
  emoji: string
  /** CSS custom property holding the chart-fill colour. */
  colorVar: `--cat-${Category}`
  /** CSS custom property holding the text-safe ink colour. */
  inkVar: `--cat-${Category}-ink`
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  food:          { key: "food",          label: "Makan & Jajan",  emoji: "🍜", colorVar: "--cat-food",          inkVar: "--cat-food-ink" },
  groceries:     { key: "groceries",     label: "Belanja Harian", emoji: "🛒", colorVar: "--cat-groceries",     inkVar: "--cat-groceries-ink" },
  transport:     { key: "transport",     label: "Transport",      emoji: "🛵", colorVar: "--cat-transport",     inkVar: "--cat-transport-ink" },
  bills:         { key: "bills",         label: "Tagihan",        emoji: "🧾", colorVar: "--cat-bills",         inkVar: "--cat-bills-ink" },
  housing:       { key: "housing",       label: "Tempat Tinggal", emoji: "🏠", colorVar: "--cat-housing",       inkVar: "--cat-housing-ink" },
  entertainment: { key: "entertainment", label: "Hiburan",        emoji: "🎬", colorVar: "--cat-entertainment", inkVar: "--cat-entertainment-ink" },
  health:        { key: "health",        label: "Kesehatan",      emoji: "💊", colorVar: "--cat-health",        inkVar: "--cat-health-ink" },
  other:         { key: "other",         label: "Lainnya",        emoji: "🧩", colorVar: "--cat-other",         inkVar: "--cat-other-ink" },
}

/**
 * Canonical order. Drives the 2×4 picker grid AND the chart series order in
 * F08 — keeping them identical means a colour always means the same thing
 * in the same position. Adjacent entries are the most visually separated
 * pairs available in the palette.
 */
export const CATEGORY_ORDER: readonly Category[] = CATEGORIES

/** Inline style object that drives .chip-surface / .chip-dot. */
export function categoryStyle(c: Category): React.CSSProperties {
  const m = CATEGORY_META[c]
  return { "--c": `var(${m.colorVar})`, "--ci": `var(${m.inkVar})` } as React.CSSProperties
}

/** Chart fill for Recharts (F08): pass straight to `fill`. */
export function categoryFill(c: Category): string {
  return `var(${CATEGORY_META[c].colorVar})`
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v)
}
```

> `categoryStyle` returns a `React.CSSProperties` — add `import type * as React from "react"` at the top of the file, or move these two helpers into `components/ui/Chip.tsx` if you would rather keep `lib/` React-free. Either is fine; pick one and be consistent.

---

### Task 7 — `lib/format.ts` (money half only — Contract delta D-2)

If the file already exists, merge; do not clobber F03's date helpers.

```ts
// lib/format.ts
// MONEY HALF — owned by F10 (Contract delta D-2).
// F03 appends TZ / todayJakartaISO() / monthKey() below and must not
// redefine anything in this section.

const IDR = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 })

/** 38500 → "38.500" — dot thousands separators, no prefix, no decimals. */
export function formatIdrDigits(n: number): string {
  return IDR.format(Math.round(n))
}

/** 38500 → "Rp 38.500" */
export function formatIdr(n: number): string {
  return `Rp ${formatIdrDigits(n)}`
}

/**
 * Loose Indonesian money input → whole rupiah, or null if unparseable.
 *   "45k" → 45000        "45rb" → 45000       "1,5jt" → 1500000
 *   "Rp 38.500" → 38500  "38500" → 38500      "2 jt" → 2000000
 * Note: in Indonesian notation "." is a THOUSANDS separator and "," is the
 * decimal comma. That is the opposite of en-US and is the single most common
 * source of bugs here.
 */
export function parseIdrLoose(input: string): number | null {
  if (typeof input !== "string") return null
  let s = input.toLowerCase().trim()
  if (!s) return null

  s = s.replace(/^rp\.?\s*/, "").replace(/\s+/g, "")
  if (!s) return null

  const m = s.match(/^([0-9.,]+)(k|rb|ribu|jt|juta|m|jtan)?$/)
  if (!m) return null

  const [, rawNum, rawUnit] = m

  // Strip thousands dots, convert the decimal comma to a point.
  let numeric = rawNum.replace(/\./g, "")
  const commas = (numeric.match(/,/g) ?? []).length
  if (commas > 1) return null
  numeric = numeric.replace(",", ".")
  if (numeric === "" || numeric === ".") return null

  const value = Number(numeric)
  if (!Number.isFinite(value) || value < 0) return null

  const mult =
    rawUnit === "k" || rawUnit === "rb" || rawUnit === "ribu" ? 1_000 :
    rawUnit === "jt" || rawUnit === "juta" || rawUnit === "jtan" || rawUnit === "m" ? 1_000_000 :
    1

  const out = Math.round(value * mult)
  return out > 1_000_000_000 ? null : out
}
```

Sanity check before committing:

```bash
npx tsx -e '
import { parseIdrLoose, formatIdr } from "./lib/format"
const cases: [string, number|null][] = [
  ["45k",45000],["45rb",45000],["1,5jt",1500000],["Rp 38.500",38500],
  ["38500",38500],["2 juta",2000000],["26k",26000],["",null],["abc",null],
]
for (const [i,e] of cases) {
  const g = parseIdrLoose(i)
  console.log(g===e ? "ok  " : "FAIL", JSON.stringify(i), "→", g, "(expected", e + ")")
}
console.log(formatIdr(266350))
'
```

Expected: nine `ok` lines and `Rp 266.350`.

**✅ COMMIT**

```bash
git add lib/cn.ts lib/categories.ts lib/format.ts
git commit -m "feat(design): category metadata, cn helper, IDR money formatting"
```

---

### Task 8 — Primitives, batch 1: `Button`, `Card`, `Money`

Create `components/ui/`.

```tsx
// components/ui/Button.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/cn"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive"
export type ButtonSize = "md" | "lg"

export interface ButtonBaseProps {
  variant?: ButtonVariant
  /** md = 44px min height (the tap-target floor), lg = 52px (page-level CTAs) */
  size?: ButtonSize
  fullWidth?: boolean
  leadingIcon?: React.ReactNode
}

export interface ButtonProps
  extends ButtonBaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  /** Disables the button, keeps its width, swaps the label for a spinner. */
  loading?: boolean
}

const BASE =
  "relative inline-flex items-center justify-center gap-2 select-none whitespace-nowrap " +
  "rounded-md font-semibold press disabled:opacity-45 disabled:pointer-events-none"

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-touch px-4 text-body",
  lg: "min-h-13 px-5 text-body",
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:     "bg-accent text-accent-fg",
  secondary:   "bg-surface-raised text-text border border-border-strong",
  ghost:       "bg-transparent text-text",
  destructive: "bg-danger text-accent-fg",
}

/** Exported so a non-<button> element can borrow the look (rare — prefer ButtonLink). */
export function buttonClasses(o: ButtonBaseProps = {}): string {
  const { variant = "primary", size = "md", fullWidth = false } = o
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && "w-full")
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-5 animate-spin", className)}
      viewBox="0 0 24 24" fill="none" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.25" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {leadingIcon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  )
}

export interface ButtonLinkProps
  extends ButtonBaseProps,
    Omit<React.ComponentProps<typeof Link>, "className"> {
  className?: string
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leadingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...rest}>
      {leadingIcon}
      {children}
    </Link>
  )
}
```

```tsx
// components/ui/Card.tsx
import * as React from "react"
import { cn } from "@/lib/cn"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article" | "li"
  /** Adds the standard 16px inset. Turn off for edge-to-edge lists inside a card. */
  padded?: boolean
}

/**
 * A card is a raised surface with a hairline border and NO shadow. Shadows in
 * this app are reserved for the two objects that physically float (the raised
 * Tambah button and the sheet). Borders also survive dark mode; shadows do not.
 */
export function Card({ as: Tag = "div", padded = true, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border bg-surface-raised",
        padded && "p-4",
        className,
      )}
      {...rest}
    />
  )
}
```

```tsx
// components/ui/Money.tsx
import * as React from "react"
import { cn } from "@/lib/cn"
import { formatIdrDigits } from "@/lib/format"

export type MoneySize = "hero" | "lg" | "md" | "sm"
export type MoneyTone = "default" | "muted" | "danger" | "success"

export interface MoneyProps {
  /** Whole rupiah. Negative renders a minus sign; use `signed` for deltas. */
  value: number
  /** hero=40px month total · lg=24px group total · md=20px · sm=17px item */
  size?: MoneySize
  tone?: MoneyTone
  /** Show the "Rp" prefix. Off inside a column that already has a Rp header. */
  showPrefix?: boolean
  /** Force a leading + on positives (F08 month-over-month delta). */
  signed?: boolean
  className?: string
}

const SIZE: Record<MoneySize, string> = {
  hero: "text-hero font-semibold",
  lg:   "text-title font-semibold",
  md:   "text-lead font-semibold",
  sm:   "text-body font-medium",
}

const PREFIX_SIZE: Record<MoneySize, string> = {
  hero: "text-lead",
  lg:   "text-label",
  md:   "text-label",
  sm:   "text-meta",
}

const TONE: Record<MoneyTone, string> = {
  default: "text-text",
  muted:   "text-text-muted",
  danger:  "text-danger",
  success: "text-success",
}

/**
 * The read-only amount. Always tabular so a column of these aligns
 * digit-for-digit — that alignment is the app's signature and this component
 * is the only thing allowed to typeset money.
 */
export function Money({
  value,
  size = "sm",
  tone = "default",
  showPrefix = true,
  signed = false,
  className,
}: MoneyProps) {
  const neg = value < 0
  const sign = neg ? "−" : signed ? "+" : ""
  const digits = formatIdrDigits(Math.abs(value))

  return (
    <span
      className={cn("tabular inline-flex items-baseline gap-1", SIZE[size], TONE[tone], className)}
      aria-label={`${sign === "−" ? "minus " : ""}${formatIdrDigits(Math.abs(value))} rupiah`}
    >
      {showPrefix && (
        <span className={cn("font-medium text-text-muted", PREFIX_SIZE[size])} aria-hidden="true">
          Rp
        </span>
      )}
      <span aria-hidden="true">
        {sign}
        {digits}
      </span>
    </span>
  )
}
```

Note the `aria-label`: screen readers mangle `Rp 266.350` (it reads the dots). The label gives them the plain number plus the word "rupiah", and the visual content is hidden from the accessibility tree.

**✅ COMMIT** — `git commit -m "feat(ui): Button, Card, Money primitives"`

---

### Task 9 — Primitives, batch 2: `Field`, `Input`, `TextArea`, `MoneyInput`

`Field` owns the label/error/id wiring; the inputs read it from context. This is the mechanism that guarantees no feature can ship a 14px input.

```tsx
// components/ui/Field.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/cn"

interface FieldContextValue {
  inputId: string
  describedBy: string | undefined
  invalid: boolean
}
const FieldContext = React.createContext<FieldContextValue | null>(null)

/** For a custom control that needs the wiring but is not Input/TextArea. */
export function useFieldContext(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

export interface FieldProps {
  label: string
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  hint?: string
  /** Present = the field is in an error state; the string is shown below. */
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

export function Field({
  label, hideLabel = false, hint, error, required = false, className, children,
}: FieldProps) {
  const base = React.useId()
  const inputId = `${base}-input`
  const hintId = hint ? `${base}-hint` : undefined
  const errorId = error ? `${base}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <FieldContext.Provider value={{ inputId, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={inputId}
          className={cn("text-label font-medium text-text-muted", hideLabel && "sr-only")}
        >
          {label}
          {required && <span className="text-danger" aria-hidden="true"> *</span>}
        </label>

        {children}

        {hint && !error && (
          <p id={hintId} className="text-meta text-text-muted">{hint}</p>
        )}
        {error && (
          <p id={errorId} className="text-meta text-danger">{error}</p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

/* ---- shared control chrome ------------------------------------------- */

export const CONTROL_CLASS =
  "w-full min-h-touch rounded-md border bg-surface-sunken px-3.5 py-2.5 " +
  "text-body text-text placeholder:text-text-muted " +
  "border-border focus:border-border-strong " +
  "aria-[invalid=true]:border-danger"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export function Input({ className, id, ...rest }: InputProps) {
  const f = useFieldContext()
  return (
    <input
      id={id ?? f?.inputId}
      aria-describedby={rest["aria-describedby"] ?? f?.describedBy}
      aria-invalid={rest["aria-invalid"] ?? (f?.invalid || undefined)}
      className={cn(CONTROL_CLASS, className)}
      {...rest}
    />
  )
}

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, id, rows = 5, ...rest }: TextAreaProps) {
  const f = useFieldContext()
  return (
    <textarea
      id={id ?? f?.inputId}
      rows={rows}
      aria-describedby={rest["aria-describedby"] ?? f?.describedBy}
      aria-invalid={rest["aria-invalid"] ?? (f?.invalid || undefined)}
      className={cn(CONTROL_CLASS, "resize-none leading-6", className)}
      {...rest}
    />
  )
}
```

```tsx
// components/ui/MoneyInput.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/cn"
import { formatIdrDigits, parseIdrLoose } from "@/lib/format"
import { CONTROL_CLASS, useFieldContext } from "./Field"

export interface MoneyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "type"
  > {
  /** Whole rupiah, or null when empty. */
  value: number | null
  /** Fires on blur (parse succeeded) and when the field is cleared. */
  onValueChange: (value: number | null) => void
  /** Called on blur when the text could not be parsed. */
  onParseError?: (rawText: string) => void
  className?: string
}

/**
 * Accepts loose Indonesian input — 45k, 45rb, 1,5jt, Rp 38.500, 38500 — and
 * settles to "38.500" on blur. While focused it shows plain digits, because
 * editing a string with thousands separators on a phone keyboard is miserable.
 *
 * type="text" + inputMode="decimal", never type="number": number inputs reject
 * the "k"/"jt" suffixes outright, expose spinners, and lose leading formatting.
 */
export function MoneyInput({
  value, onValueChange, onParseError, className, id, onFocus, onBlur, ...rest
}: MoneyInputProps) {
  const f = useFieldContext()
  const [text, setText] = React.useState(() => (value === null ? "" : formatIdrDigits(value)))
  const [focused, setFocused] = React.useState(false)
  const [bad, setBad] = React.useState(false)

  // Re-sync when the parent changes the value from outside (optimistic UI).
  React.useEffect(() => {
    if (focused) return
    setText(value === null ? "" : formatIdrDigits(value))
    setBad(false)
  }, [value, focused])

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label font-medium text-text-muted"
        aria-hidden="true"
      >
        Rp
      </span>
      <input
        id={id ?? f?.inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        value={text}
        aria-describedby={rest["aria-describedby"] ?? f?.describedBy}
        aria-invalid={bad || f?.invalid || undefined}
        className={cn(CONTROL_CLASS, "tabular pl-10 text-right font-medium", className)}
        onChange={(e) => { setText(e.target.value); setBad(false) }}
        onFocus={(e) => {
          setFocused(true)
          // plain digits while editing
          setText(value === null ? "" : String(value))
          requestAnimationFrame(() => e.target.select())
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          const raw = e.target.value.trim()
          if (raw === "") { setText(""); setBad(false); onValueChange(null); onBlur?.(e); return }
          const parsed = parseIdrLoose(raw)
          if (parsed === null) { setBad(true); onParseError?.(raw); onBlur?.(e); return }
          setBad(false)
          setText(formatIdrDigits(parsed))
          onValueChange(parsed)
          onBlur?.(e)
        }}
        {...rest}
      />
    </div>
  )
}
```

Manual check once the dev server is up: type `45k` → blur → shows `45.000`; focus again → shows `45000`; type `1,5jt` → blur → `1.500.000`; type `abc` → blur → red border, `onParseError` fires, text preserved so nothing is lost.

**✅ COMMIT** — `git commit -m "feat(ui): Field, Input, TextArea, MoneyInput"`

---

### Task 10 — `Sheet` — the primitive to get right

Built on native `<dialog>` + `showModal()`. That buys focus trapping, Escape handling, top-layer stacking and background inertness from the platform instead of 200 lines of custom trap logic — which is both simpler and more correct. The CSS in Task 5 supplies the motion.

```tsx
// components/ui/Sheet.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/cn"

/* Body scroll lock, reference-counted so nested sheets do not unlock early. */
let lockCount = 0
function lockBody() {
  if (lockCount++ === 0) document.body.style.overflow = "hidden"
}
function unlockBody() {
  if (--lockCount <= 0) { lockCount = 0; document.body.style.overflow = "" }
}

export interface SheetProps {
  open: boolean
  /** Fires for Escape, backdrop tap, and the close button. Parent owns state. */
  onClose: () => void
  /** Required — it is the accessible name. Use hideTitle to hide it visually. */
  title: string
  hideTitle?: boolean
  /** Optional one-line explanation under the title. */
  description?: string
  /** Sticky footer inside the panel, below the scrolling body. */
  footer?: React.ReactNode
  /** Hide the ✕ button when the sheet is purely a picker. */
  showCloseButton?: boolean
  className?: string
  children: React.ReactNode
}

export function Sheet({
  open, onClose, title, hideTitle = false, description,
  footer, showCloseButton = true, className, children,
}: SheetProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  React.useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      if (!d.open) d.showModal()
      lockBody()
      // Land focus on the panel, not on whatever control happens to be first.
      panelRef.current?.focus()
      return () => unlockBody()
    }
    if (d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape: prevent the UA's immediate close so React state stays the
      // single source of truth (and the exit animation gets to run).
      onCancel={(e) => { e.preventDefault(); onClose() }}
      // Closed by any other means → tell the parent.
      onClose={() => { if (open) onClose() }}
      // Backdrop tap: on a modal <dialog> the ::backdrop's event target is the
      // dialog element itself, so this test is exact.
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn("sheet-panel focus:outline-none", className)}
      >
        {/* grab handle — visual affordance only, drag-to-dismiss is out of scope */}
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
          <div className="h-1 w-9 rounded-full bg-border-strong" />
        </div>

        <div className="flex items-start gap-3 px-gutter pt-2 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={cn("text-lead font-semibold text-text", hideTitle && "sr-only")}>
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-meta text-text-muted">{description}</p>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="press -mr-1 grid size-touch shrink-0 place-items-center rounded-full text-text-muted"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Scrolls independently; overscroll is contained so the page behind
            never rubber-bands. */}
        <div className="scroll-pane min-h-0 flex-1 px-gutter pb-2">{children}</div>

        <div
          className={cn(
            "px-gutter pt-2",
            footer && "border-t border-border bg-surface-raised",
          )}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {footer}
        </div>
      </div>
    </dialog>
  )
}
```

Points that are load-bearing and easy to break:

- **`open` is a prop, never internal state.** Every consumer already has the state (which item is being edited, which chip was tapped). Two sources of truth here caused every sheet bug I have seen.
- **`onCancel` must `preventDefault()`.** Otherwise Escape closes the dialog underneath React, `open` stays `true`, and the sheet can never be reopened.
- **The safe-area padding is on the footer, not the panel.** The home indicator sits under the bottom 34px; a button flush to the panel edge is physically unreachable.
- **`scroll-pane` on the body, not the panel.** The panel is a flex column with a fixed header and footer; only the middle scrolls.
- Known limitation: iOS Safari's background-scroll suppression for modal dialogs plus `overflow: hidden` on `body` is good but not perfect — a very long page can still shift a few pixels. The `position: fixed` body-lock alternative causes a scroll-position jump that is worse. Accept the imperfection.

**✅ COMMIT** — `git commit -m "feat(ui): Sheet bottom-sheet primitive on native dialog"`

---

### Task 11 — Primitives, batch 3: `Chip`, `CategoryPicker`, `EmptyState`, `Toast`

```tsx
// components/ui/Chip.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/cn"
import { CATEGORY_META, categoryStyle, type Category } from "@/lib/categories"

export interface ChipProps {
  category: Category
  /** sm = inline in a dense list row · md = standalone control */
  size?: "sm" | "md"
  /** Provide to make it a button (opens the CategoryPicker). Omit for a label. */
  onClick?: () => void
  /** Draws the selected ring — used inside CategoryPicker. */
  selected?: boolean
  /** Hide the text and keep only the emoji. Colour is never the sole signal. */
  labelHidden?: boolean
  className?: string
}

/**
 * Colour arrives through inline --c / --ci custom properties so there is one
 * CSS rule (.chip-surface) instead of eight. Never colour-only: the emoji and
 * the label always ride along.
 */
export function Chip({
  category, size = "sm", onClick, selected = false, labelHidden = false, className,
}: ChipProps) {
  const meta = CATEGORY_META[category]
  const content = (
    <>
      <span aria-hidden="true" className={size === "sm" ? "text-[0.95em]" : "text-[1.05em]"}>
        {meta.emoji}
      </span>
      <span className={cn(labelHidden && "sr-only")}>{meta.label}</span>
    </>
  )

  const classes = cn(
    "chip-surface inline-flex items-center gap-1.5 rounded-sm font-medium",
    size === "sm" ? "px-2 py-1 text-meta" : "px-3 py-2 text-label",
    className,
  )

  if (!onClick) {
    return (
      <span className={classes} style={categoryStyle(category)} data-selected={selected}>
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      aria-label={`Kategori: ${meta.label}. Ketuk untuk mengganti.`}
      style={categoryStyle(category)}
      className={cn(classes, "press touch-target")}
    >
      {content}
    </button>
  )
}

/** 10px colour dot for chart legends and dense rows where a chip is too heavy. */
export function CategoryDot({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={categoryStyle(category)}
      className={cn("chip-dot inline-block size-2.5 shrink-0 rounded-full", className)}
    />
  )
}
```

```tsx
// components/ui/CategoryPicker.tsx
"use client"

import * as React from "react"
import { Sheet } from "./Sheet"
import { CATEGORY_META, CATEGORY_ORDER, categoryStyle, type Category } from "@/lib/categories"
import { cn } from "@/lib/cn"

export interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  /** Currently assigned category, if any. */
  value?: Category | null
  /** Fires with the chosen category. The picker closes itself afterwards. */
  onSelect: (category: Category) => void
  title?: string
}

/**
 * 2 columns × 4 rows. Not 4×2: "Tempat Tinggal" and "Belanja Harian" do not
 * fit an 84px cell at 414px without truncating, and truncated labels defeat
 * the point of having labels. Two columns give ~167px per cell and the whole
 * grid still fits on screen without scrolling.
 */
export function CategoryPicker({
  open, onClose, value = null, onSelect, title = "Pilih kategori",
}: CategoryPickerProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} showCloseButton>
      <div role="listbox" aria-label={title} className="grid grid-cols-2 gap-2 pb-2">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key]
          const selected = value === key
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              data-selected={selected}
              style={categoryStyle(key)}
              onClick={() => { onSelect(key); onClose() }}
              className={cn(
                "chip-surface press flex min-h-[4.5rem] flex-col items-start justify-center",
                "gap-1 rounded-md px-3 py-3 text-left",
              )}
            >
              <span aria-hidden="true" className="text-title leading-none">{meta.emoji}</span>
              <span className="text-label font-medium leading-tight">{meta.label}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
```

```tsx
// components/ui/EmptyState.tsx
import * as React from "react"
import { cn } from "@/lib/cn"

export interface EmptyStateProps {
  /** Usually an emoji in a <span> or a 32px inline SVG. Optional. */
  icon?: React.ReactNode
  /** What is not here yet. Sentence case, no full stop. */
  title: string
  /** One line telling the reader what to do next. */
  description?: string
  /** A Button or ButtonLink. An empty screen is an invitation, not a shrug. */
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-gutter py-14 text-center", className)}>
      {icon && <div className="mb-3 text-title opacity-70" aria-hidden="true">{icon}</div>}
      <p className="text-lead font-semibold text-text">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[28ch] text-label text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
```

```tsx
// components/ui/Toast.tsx
"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/cn"

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastOptions {
  action?: ToastAction
  /** ms; default 5000. F07's undo needs the full window. */
  duration?: number
  tone?: "neutral" | "danger"
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
  dismiss: () => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}

interface ToastState extends ToastOptions {
  id: number
  message: string
}

/**
 * One toast at a time. A queue would be a lie on a 414px screen — the second
 * message would be invisible anyway. A new toast replaces the current one.
 * Mounted once in the root layout.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState | null>(null)
  const [mounted, setMounted] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => { setMounted(true) }, [])

  const dismiss = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = React.useCallback<ToastApi["show"]>((message, options) => {
    if (timer.current) clearTimeout(timer.current)
    const id = Date.now()
    setToast({ id, message, ...options })
    timer.current = setTimeout(() => setToast(null), options?.duration ?? 5000)
  }, [])

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const api = React.useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-gutter"
            style={{ bottom: "var(--toast-bottom)" }}
          >
            {toast && (
              <div
                key={toast.id}
                className={cn(
                  "pointer-events-auto flex w-full max-w-app items-center gap-3",
                  "rounded-md border border-border bg-surface-raised px-4 py-3 shadow-raise",
                  "motion-safe:animate-[toast-in_220ms_var(--ease-out-soft)]",
                )}
              >
                <p
                  className={cn(
                    "min-w-0 flex-1 text-label",
                    toast.tone === "danger" ? "text-danger" : "text-text",
                  )}
                >
                  {toast.message}
                </p>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => { toast.action?.onAction(); dismiss() }}
                    className="press -my-2 shrink-0 rounded-sm px-2 py-2 text-label font-semibold text-accent"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
```

Add the keyframes to `globals.css` inside the `@layer components` block:

```css
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px) }
    to   { opacity: 1; transform: translateY(0) }
  }
```

Barrel file:

```ts
// components/ui/index.ts
export { Button, ButtonLink, Spinner, buttonClasses } from "./Button"
export type { ButtonProps, ButtonLinkProps, ButtonVariant, ButtonSize } from "./Button"
export { Card } from "./Card"
export type { CardProps } from "./Card"
export { Money } from "./Money"
export type { MoneyProps, MoneySize, MoneyTone } from "./Money"
export { Field, Input, TextArea, useFieldContext, CONTROL_CLASS } from "./Field"
export type { FieldProps, InputProps, TextAreaProps } from "./Field"
export { MoneyInput } from "./MoneyInput"
export type { MoneyInputProps } from "./MoneyInput"
export { Sheet } from "./Sheet"
export type { SheetProps } from "./Sheet"
export { Chip, CategoryDot } from "./Chip"
export type { ChipProps } from "./Chip"
export { CategoryPicker } from "./CategoryPicker"
export type { CategoryPickerProps } from "./CategoryPicker"
export { EmptyState } from "./EmptyState"
export type { EmptyStateProps } from "./EmptyState"
export { TabBar } from "./TabBar"
export type { TabBarProps } from "./TabBar"
export { ToastProvider, useToast } from "./Toast"
export type { ToastApi, ToastOptions, ToastAction } from "./Toast"
```

**✅ COMMIT** — `git commit -m "feat(ui): Chip, CategoryPicker, EmptyState, Toast"`

---

### Task 12 — Fonts: the decision

**Decision: the system stack. No web font. Zero font bytes over the network.**

Reasoning, in the order it mattered:

1. **The target device is an iPhone.** `system-ui` resolves to SF Pro, which is already on the device, already in the render cache, and is the face iOS itself uses. For an app whose whole PWA pitch is "this should feel like a real app, not a website", matching the platform face is not a compromise, it is the point. A self-hosted Inter would make it look *more* like a website, not less.
2. **SF Pro has genuine tabular figures.** `font-variant-numeric: tabular-nums` activates `tnum` on SF, on Roboto (Android), and on Segoe UI (Windows). The money-rail requirement is met with zero downloads. Verify this on-device during QA rather than trusting it — it is the one assumption the whole signature rests on.
3. **Indonesian mobile networks.** A variable web font, latin-subset, self-hosted, is 30–45 KB and blocks or flashes on first paint. On a 3G-ish connection that is a visible half-second of FOUT or invisible text on the single screen the user opens twenty times a day. Zero is better than 40 KB, and it is *reliably* zero.
4. **The brief.** "I am a simple guy, I love simple things." A build step, a font-loading strategy, a `size-adjust` fallback metric and a FOUT mitigation, in service of a typeface nobody asked for, fails that sentence.
5. **Personality is not spent on the family.** It is spent on the treatment: the 40px hero total with `-0.032em` tracking against a 20px muted `Rp`, everything on a shared tabular rail. That reads as designed. A different sans-serif would not.

The stack is already in `@theme` (Task 3). Nothing further to implement.

**Escape hatch, if the integrator overrules this.** Self-host, never Google's CDN (extra DNS + TLS + no cache sharing since browser partitioning):

```bash
npm i @fontsource-variable/inter   # or drop the .woff2 into app/fonts/
```

```ts
// app/fonts.ts
import localFont from "next/font/local"

export const sans = localFont({
  src: [{ path: "./fonts/InterVariable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  // Trims the reflow when swapping from the fallback.
  adjustFontFallback: "Arial",
})
```

```tsx
<html lang="id" className={sans.variable}>
```

```css
@theme inline { --font-sans: var(--font-inter), system-ui, sans-serif; }
```

Note the `@theme inline` — `next/font` emits `--font-inter` on a class, so the non-inline form would resolve it at `:root` where it does not exist. This is the exact case the v4 docs give for `inline`.

---

### Task 13 — App shell, route groups, and the tab bar

```tsx
// components/ui/TabBar.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/cn"

export interface TabBarProps {
  /** e.g. "/m/2026-08". Computed on the server so the client never guesses the timezone. */
  monthHref: string
}

function IconMonth() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
function IconStats() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
      <path d="M5 19V11M12 19V5M19 19v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Three tabs, safe-area aware, centre raised. Fixed to the viewport but with
 * its contents constrained to the same max-w-app column as the page, so it
 * lines up on a wide viewport without needing a containing block.
 *
 * data-tabbar is read by the :has() rule in globals.css that lifts the Toast
 * above the bar. Do not remove it.
 */
export function TabBar({ monthHref }: TabBarProps) {
  const pathname = usePathname()
  // /e/[id] is reached from the month list, so it belongs to the Bulan Ini tab.
  const onMonth = pathname.startsWith("/m") || pathname.startsWith("/e/")
  const onStats = pathname.startsWith("/stats")
  const onNew = pathname.startsWith("/new")

  return (
    <nav
      data-tabbar
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-tab max-w-app items-stretch">
        <Link
          href={monthHref}
          aria-current={onMonth ? "page" : undefined}
          className={cn(
            "press flex flex-1 flex-col items-center justify-center gap-0.5",
            onMonth ? "text-text" : "text-text-muted",
          )}
        >
          <IconMonth />
          <span className="text-micro tracking-normal normal-case">Bulan Ini</span>
        </Link>

        <div className="relative flex w-20 shrink-0 justify-center">
          <Link
            href="/new"
            aria-label="Tambah pengeluaran"
            aria-current={onNew ? "page" : undefined}
            className={cn(
              "press absolute -top-4 grid size-14 place-items-center rounded-full",
              "bg-accent text-accent-fg shadow-raise ring-4 ring-surface-raised",
            )}
          >
            <IconPlus />
          </Link>
          <span
            className={cn(
              "mt-auto pb-1.5 text-micro tracking-normal normal-case",
              onNew ? "text-text" : "text-text-muted",
            )}
          >
            Tambah
          </span>
        </div>

        <Link
          href="/stats"
          aria-current={onStats ? "page" : undefined}
          className={cn(
            "press flex flex-1 flex-col items-center justify-center gap-0.5",
            onStats ? "text-text" : "text-text-muted",
          )}
        >
          <IconStats />
          <span className="text-micro tracking-normal normal-case">Statistik</span>
        </Link>
      </div>
    </nav>
  )
}
```

The raised button's `ring-4 ring-surface-raised` punches it visually out of the bar — the ring paints the bar's own colour, so the circle reads as sitting in front rather than glued on. `shadow-raise` is the only shadow on the whole screen, which is what makes the raised state read at all.

**Route groups** — how `/s/[token]` opts out of the tab bar. Route groups do not affect URLs:

```
app/
  layout.tsx                  ← <html>, tokens, ToastProvider. No chrome.
  (chrome)/
    layout.tsx                ← renders <TabBar>. Everything with the tab bar.
    m/[month]/page.tsx        → /m/2026-08
    e/[id]/page.tsx           → /e/abc123
    new/page.tsx              → /new
    stats/page.tsx            → /stats
  (bare)/
    layout.tsx                ← same column, no TabBar.
    page.tsx                  → /          (landing / sign-in)
    s/[token]/page.tsx        → /s/xyz789  (public share)
```

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next"
import { ToastProvider } from "@/components/ui"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://expensetracking.online"),
  title: { default: "Expense Tracking", template: "%s · Expense Tracking" },
  description: "Catat pengeluaran dengan menempelkan teks. Sisanya otomatis.",
  applicationName: "Expense Tracking",
  manifest: "/manifest.webmanifest",
  // Chrome-less from the home screen. `title` is what appears under the icon.
  appleWebApp: {
    capable: true,
    title: "Expenses",
    // black-translucent = content runs under the status bar. This is only
    // safe because every fixed header pads by env(safe-area-inset-top).
    statusBarStyle: "black-translucent",
  },
  // Stop iOS auto-linking "38.500" as a phone number and dates as calendar
  // events — it recolours our money and breaks the rail.
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page paint into the notch + home-indicator area. Without it,
  // env(safe-area-inset-*) all report 0 and the safe-area padding does nothing.
  viewportFit: "cover",
  // DELIBERATELY ABSENT: maximumScale and userScalable. Pinch-zoom stays on.
  // If text is too small, fix the type scale, not the viewport.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F4F7" },
    { media: "(prefers-color-scheme: dark)",  color: "#0C0E13" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-surface text-text antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
```

```tsx
// components/AppShell.tsx
import { cn } from "@/lib/cn"

/**
 * The mobile column. On a phone it is the full width. On a wide viewport it
 * centres at 480px against a sunken page, with hairlines down both sides so it
 * reads as a deliberate column rather than a stranded phone layout.
 * Desktop is not designed — it is only not broken.
 */
export function AppShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh bg-surface-sunken sm:bg-surface-sunken">
      <div
        className={cn(
          "mx-auto min-h-dvh w-full max-w-app bg-surface",
          "sm:border-x sm:border-border",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
```

```tsx
// app/(chrome)/layout.tsx
import { AppShell } from "@/components/AppShell"
import { TabBar } from "@/components/ui"

// Replace with monthKey(new Date()) from lib/format.ts once F03 lands.
function currentJakartaMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(new Date())
    .slice(0, 7)
}

export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* pb-tabbar clears the 56px bar + the home indicator */}
      <div className="pb-tabbar">{children}</div>
      <TabBar monthHref={`/m/${currentJakartaMonth()}`} />
    </AppShell>
  )
}
```

```tsx
// app/(bare)/layout.tsx
import { AppShell } from "@/components/AppShell"

export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="pb-safe">{children}</div>
    </AppShell>
  )
}
```

> Only one route group may own `/`. If F02's sign-in page and this landing page collide, Next will fail the build with a duplicate-route error — resolve it by keeping `/` in `(bare)` and having F02 render into it.

**✅ COMMIT** — `git commit -m "feat(shell): root layout, viewport-fit=cover, route groups, TabBar"`

---

### Task 14 — PWA: this is what makes it feel like an app

Without this, "Add to Home Screen" gives a bookmark that opens in Safari with the URL bar, the tab strip and the share bar eating 140px of a 896px screen. With it, the app opens full-screen with its own icon and no browser chrome — the entire difference between "a website I saved" and "an app I installed", for about twenty lines of metadata.

**14a — the mark.** One 1024×1024 SVG master. The mark is the money rail: three right-aligned bars of decreasing length on ink — a column of numbers, which is what the app is.

```svg
<!-- public/brand/mark.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#212E4C"/>
  <g fill="#FBFCFD">
    <rect x="256" y="360" width="512" height="72" rx="36"/>
    <rect x="400" y="476" width="368" height="72" rx="36"/>
    <rect x="512" y="592" width="256" height="72" rx="36"/>
  </g>
</svg>
```

The bars sit inside the central 62% of the canvas, which clears the 80% maskable safe zone with room to spare, so the same art works for both the plain and the maskable icon.

**14b — generate the rasters.** Exact sizes needed, and why each one:

| File | Size | Purpose |
|---|---|---|
| `app/apple-icon.png` | 180×180 | iOS home screen (`apple-touch-icon`). **The one that matters most.** iOS ignores the manifest icons for the home screen. |
| `public/icons/icon-192.png` | 192×192 | Android/Chrome install prompt minimum |
| `public/icons/icon-512.png` | 512×512 | Chrome install dialog, splash generation |
| `public/icons/icon-maskable-512.png` | 512×512 | `purpose: "maskable"` — Android adaptive-icon shape masking |
| `app/icon.png` | 32×32 | browser tab favicon (Next emits the link tag automatically) |

```bash
npm i -D sharp
mkdir -p public/icons
node -e '
const sharp = require("sharp");
const src = "public/brand/mark.svg";
const jobs = [
  ["app/apple-icon.png", 180],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512],
  ["app/icon.png", 32],
];
Promise.all(jobs.map(([out, size]) =>
  sharp(src, { density: 600 }).resize(size, size).png().toFile(out)
)).then(() => console.log("icons written"));
'
ls -la app/apple-icon.png app/icon.png public/icons/
```

Expected: `icons written`, then five files. `apple-icon.png` should be roughly 3–6 KB.

> iOS does **not** honour transparency or rounded corners on `apple-touch-icon` — it applies its own squircle mask to a fully opaque square. The `<rect>` background above is required; a transparent PNG renders black.

**14c — the manifest.** `app/manifest.ts` is the Next 16 file convention; it is served at `/manifest.webmanifest`, which is the path `metadata.manifest` already points at.

```ts
// app/manifest.ts
import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Expense Tracking",
    short_name: "Expenses",          // ≤12 chars or iOS truncates under the icon
    description: "Catat pengeluaran dengan menempelkan teks. Sisanya otomatis.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "id",
    dir: "ltr",
    background_color: "#F3F4F7",     // splash background, light value
    theme_color: "#F3F4F7",
    icons: [
      { src: "/icons/icon-192.png",          sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png",          sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
```

> The manifest takes a single `theme_color`; only the `<meta name="theme-color" media="...">` pair from `viewport.themeColor` can vary by scheme, and it is what Safari actually reads for the status-bar tint. Keep the manifest on the light value.

**14d — verify.**

```bash
npm run build && npm run start &
sleep 4
curl -s localhost:3000/manifest.webmanifest | head -20
curl -s localhost:3000/ | grep -oE '<meta name="theme-color"[^>]*>|<link rel="apple-touch-icon"[^>]*>|<meta name="apple-mobile-web-app-[^>]*>|viewport-fit=cover'
```

Expected, all present:

```
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F3F4F7">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0C0E13">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png?...">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Expenses">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
viewport-fit=cover
```

If `viewport-fit=cover` is missing, `viewportFit` was not set on the `Viewport` export and **every safe-area rule in this plan silently does nothing** — `env(safe-area-inset-*)` returns 0 without it. This is the single highest-consequence line in the file.

**✅ COMMIT** — `git commit -m "feat(pwa): manifest, apple-touch-icon, theme-color, standalone metadata"`

---

### Task 15 — Kitchen-sink page for QA

Not shippable UI — a scaffold to run the checklists against, deleted or gated before v0.1.0 ships.

Create `app/(chrome)/dev/ui/page.tsx` rendering, in order: all four Button variants × both sizes × loading × fullWidth; a Card containing three `rail` rows with `Money size="sm"`; a `Money size="hero"` total; all eight Chips; a `Field`+`Input` in normal and error state; a `Field`+`MoneyInput`; a button that opens a `CategoryPicker`; a button that opens a `Sheet` with 40 paragraphs of filler (to test inner scroll and overscroll containment); an `EmptyState`; and a button that fires a `Toast` with an "Urungkan" action.

Include this alignment test verbatim — it is the one thing that proves the whole money-rail thesis:

```tsx
<Card>
  <div className="rail"><span>Alignment test</span><Money value={1111111} /></div>
  <div className="rail"><span>Alignment test</span><Money value={8888888} /></div>
  <div className="rail"><span>Alignment test</span><Money value={266350} /></div>
</Card>
```

Guard it so it cannot reach production:

```tsx
import { notFound } from "next/navigation"
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound()
  // ...
}
```

```bash
npm run dev
# open http://localhost:3000/dev/ui
```

**✅ COMMIT** — `git commit -m "chore(ui): dev-only kitchen-sink page for design QA"`

---

### Task 16 — Run both checklists, fix, ship

Work the Visual QA and Accessibility checklists below. Fix everything they surface, then:

```bash
npm run lint && npx tsc --noEmit && npm run build
git add -A && git commit -m "fix(design): QA and accessibility pass at 414x896, light and dark"
git push
```

Expected: clean lint, zero TS errors, successful build. Then deploy and open the Vercel preview on the real iPhone for the on-device section.

---

## Visual QA checklist

Run **every line twice** — once in light, once in dark. Toggling: Safari DevTools ▸ ⋯ ▸ *Force dark appearance*; Chrome DevTools ▸ Rendering ▸ *Emulate prefers-color-scheme*. On the device: Settings ▸ Display & Brightness.

**Set up the viewport:** Safari ▸ Develop ▸ Enter Responsive Design Mode ▸ iPhone XS Max, or Chrome DevTools ▸ device toolbar ▸ 414 × 896, DPR 3.

### Layout at 414 × 896

- [ ] No horizontal scrollbar anywhere. Check with `document.documentElement.scrollWidth === 414` in the console on every screen.
- [ ] `--spacing-gutter` (20px) is the horizontal inset on every screen — nothing touches the edge except deliberately full-bleed images.
- [ ] Long category labels ("Tempat Tinggal", "Belanja Harian") do not wrap or truncate in the picker.
- [ ] A long expense title (60 chars) truncates with an ellipsis and does **not** push the amount off the rail.
- [ ] The month hero total at `Rp 12.345.678` (8 digits) fits on one line at `text-hero`.
- [ ] Sheet at max height stops at 88dvh — the page behind is still visible at the top.

### The money rail

- [ ] In the alignment test card, the digit columns of `1.111.111`, `8.888.888` and `266.350` line up on their right edge **and** each digit position aligns vertically. If the `1`s are narrower than the `8`s, `tabular-nums` did not take — check that `Money` carries the `tabular` class and that the generated CSS contains `font-variant-numeric: tabular-nums`.
- [ ] The `Rp` prefix is optically smaller and muted, baseline-aligned with the digits, not floating.
- [ ] Every amount on every screen is right-aligned in the same column as the others on that screen.

### iOS behaviours (device or simulator — the emulator cannot prove these)

- [ ] Focus every single input: **the page does not zoom.** Any zoom means a font-size below 16px slipped through. Find it and fix the size; do not touch the viewport meta.
- [ ] Scroll the month list to the bottom, keep dragging: the page does not rubber-band past the tab bar.
- [ ] Open a sheet with long content, scroll to its bottom, keep dragging: **the page behind does not move.**
- [ ] Tap a button and hold: no grey rectangle flash; the button scales down slightly and comes back.
- [ ] Scroll down so Safari collapses the URL bar: no layout jump, no gap at the bottom (this is the `100dvh` check).
- [ ] Rotate to landscape: content stays in the column, nothing is under the notch on the left edge (`px-safe`).
- [ ] Pinch-zoom works. If it does not, `user-scalable=no` got in somehow — remove it.
- [ ] Add to Home Screen, open from the icon: no URL bar, no tab strip, correct icon, correct name ("Expenses"), status bar legible against the header in both themes.

### Sheet

- [ ] Opens sliding up from the bottom edge, ~280ms, decelerating.
- [ ] Escape closes it. Backdrop tap closes it. The ✕ closes it.
- [ ] A tap inside the panel does **not** close it.
- [ ] Tab cycles only inside the sheet and never reaches the page behind.
- [ ] The footer button clears the home indicator — measure: there should be ≥34px between the button's bottom edge and the screen bottom on the device.
- [ ] Open → close → open again works (this is the `onCancel`/`preventDefault` regression test).
- [ ] With Reduce Motion on (Settings ▸ Accessibility ▸ Motion), the sheet appears without sliding and still functions.

### TabBar

- [ ] Sits above the home indicator, its background extends behind it (no white strip under the bar).
- [ ] The raised Tambah circle overlaps the bar's top edge with a visible ring in the bar's own colour.
- [ ] Active tab is `text-text`, inactive is `text-text-muted`, and the difference is obvious at arm's length in both themes.
- [ ] On `/e/abc123`, the **Bulan Ini** tab is the active one.
- [ ] Content on a long page scrolls fully clear of the bar (`pb-tabbar`).

### Dark mode specifically

- [ ] No pure black and no pure white surfaces — `#0C0E13` / `#F3F4F7`, not `#000` / `#FFF`.
- [ ] Card borders are visible against the page background (the borders, not shadows, are what separates them).
- [ ] All eight chips are legible and still tell each other apart.
- [ ] The Toast is readable and does not glow.
- [ ] `color-scheme: light dark` is doing its job: native form controls, scrollbars and the `<dialog>` backdrop all follow the theme.

### Wide viewport sanity check (1440 × 900, light only)

- [ ] The app is a 480px column centred horizontally.
- [ ] The area either side is `--app-surface-sunken`, with a hairline down both edges of the column.
- [ ] The tab bar is also 480px wide and centred — not stretched across 1440px.
- [ ] The Toast is centred over the column, not the window.
- [ ] Nothing overlaps, nothing is stranded in the top-left corner. It should look intentionally narrow, not broken.

---

## Accessibility pass

### Contrast — measured, not estimated

> **STALE.** Every figure in the tables below was computed from the OKLCH palette in Task 2, which
> the design pull replaced. They are kept only as a record of the standard that was applied. The
> live numbers come from `python3 scripts/palette-check.py`, which is committed, covers every pair
> the components actually paint, and holds a category colour to 4.5:1 rather than 3:1 because the
> two-letter code renders it as text. Two failures it found in the design's own palette were fixed
> rather than waived — see R-48 and R-49.
>
> The parts of this section that are NOT stale, and still binding: the focus-visibility rules, the
> 44×44 touch-target table, and the "Other" list at the end.

Every value below was computed from the oklch definitions in Task 2, converted to sRGB (all in gamut, no browser gamut-mapping) and run through the WCAG 2.1 contrast formula. Text targets **4.5:1**; non-text graphical objects (chart fills, chips-as-swatches, borders that carry meaning) target **3:1**.

**Accent and semantics — light theme, against `--app-surface-raised` (#FFFFFF):**

| Pair | Ratio | Target | |
|---|---|---|---|
| `text` on raised | **16.46** | 4.5 | ✅ |
| `text-muted` on raised | **5.06** | 4.5 | ✅ |
| `text-muted` on page surface | **4.61** | 4.5 | ✅ |
| `accent` on raised | **13.47** | 4.5 | ✅ |
| `accent-fg` on `accent` (primary button) | **13.09** | 4.5 | ✅ |
| `danger` on raised | **5.86** | 4.5 | ✅ |
| `accent-fg` on `danger` (destructive button) | **5.69** | 4.5 | ✅ |
| `success` on raised | **5.52** | 4.5 | ✅ |
| `danger` on `danger-soft` | **5.11** | 4.5 | ✅ |
| `text` on `accent-soft` (selected row) | **14.01** | 4.5 | ✅ |

**Accent and semantics — dark theme, against `--app-surface-raised` (#17191F):**

| Pair | Ratio | Target | |
|---|---|---|---|
| `text` on raised | **15.83** | 4.5 | ✅ |
| `text-muted` on raised | **6.81** | 4.5 | ✅ |
| `accent` on raised | **14.47** | 4.5 | ✅ |
| `accent-fg` on `accent` | **14.80** | 4.5 | ✅ |
| `danger` on raised | **6.08** | 4.5 | ✅ |
| `accent-fg` on `danger` | **6.22** | 4.5 | ✅ |
| `success` on raised | **8.62** | 4.5 | ✅ |
| `danger` on `danger-soft` | **4.85** | 4.5 | ✅ |
| `text` on `accent-soft` | **12.99** | 4.5 | ✅ |

**The 8 categories — light theme:**

| Category | fill hex | fill vs raised | fill vs page | ink hex | ink vs raised (text) |
|---|---|---|---|---|---|
| food 🍜 | `#B7830C` | **3.35** ✅ | 3.05 ✅ | `#765408` | **6.91** ✅ |
| groceries 🛒 | `#2F913E` | **4.02** ✅ | 3.67 ✅ | `#0A6620` | **7.18** ✅ |
| transport 🛵 | `#0C6BDA` | **5.07** ✅ | 4.62 ✅ | `#0852A8` | **7.58** ✅ |
| bills 🧾 | `#D2393A` | **4.81** ✅ | 4.38 ✅ | `#A30D1C` | **8.00** ✅ |
| housing 🏠 | `#9B63DC` | **4.02** ✅ | 3.66 ✅ | `#6C31A6` | **7.99** ✅ |
| entertainment 🎬 | `#D664A3` | **3.38** ✅ | 3.08 ✅ | `#932467` | **7.81** ✅ |
| health 💊 | `#0C999F` | **3.45** ✅ | 3.14 ✅ | `#096367` | **7.02** ✅ |
| other 🧩 | `#7B808A` | **3.95** ✅ | 3.60 ✅ | `#51555E` | **7.44** ✅ |

**The 8 categories — dark theme:**

| Category | fill hex | fill vs raised | ink hex | ink vs raised (text) |
|---|---|---|---|---|
| food 🍜 | `#ECAE30` | **8.92** ✅ | `#F9C76F` | **11.16** ✅ |
| groceries 🛒 | `#6AC072` | **7.87** ✅ | `#9CE0A0` | **11.34** ✅ |
| transport 🛵 | `#5C9FFC` | **6.52** ✅ | `#A0C7FD` | **10.05** ✅ |
| bills 🧾 | `#FC746D` | **6.56** ✅ | `#FDB3AC` | **10.21** ✅ |
| housing 🏠 | `#BE8EFB` | **7.04** ✅ | `#D7BCFD` | **10.43** ✅ |
| entertainment 🎬 | `#F68FC5` | **8.07** ✅ | `#FDB4D9` | **10.64** ✅ |
| health 💊 | `#64D1D7` | **9.74** ✅ | `#91E3E7` | **11.98** ✅ |
| other 🧩 | `#9A9EA8` | **6.56** ✅ | `#C3C7CF` | **10.37** ✅ |

Chips paint their background as `color-mix(in oklab, fill 14%, raised)`, which moves luminance by under 8%, so every ink-on-chip pair stays above 6:1 in light and above 9:1 in dark. Comfortable margin; no chip needs a special case.

**Distinguishability between categories** (this is what F08's donut depends on). Minimum pairwise ΔE in oklab: **0.107 light** (`health`/`other`), **0.115 dark** (`bills`/`entertainment`). Both clear the ~0.10 floor for categorical series. Mitigations that make it moot in practice:

- `CATEGORY_ORDER` is fixed, so the two closest pairs are never adjacent segments.
- Every chart segment gets a 1.5px stroke in `--app-surface-raised` (F08's job, noted here so it does not get dropped).
- Colour is never the only channel: every legend entry, chip and tooltip carries the emoji and the Indonesian label.

**Re-running these numbers.** If any colour changes — including anything arriving from Claude Design — recompute rather than eyeball. The generator is in the appendix at the bottom of this file. Save it as `scripts/palette-check.py`, edit the two dicts, run `python3 scripts/palette-check.py`, and paste the output into the tables above. It reports hex, sRGB gamut status, contrast against both surfaces, and pairwise ΔE for all eight categories.

### Focus visibility

- Ring is `2px solid var(--app-accent)` at `2px` offset. Because the accent is ink, it is the darkest thing on a light page and the lightest thing on a dark one — it is never lost against any surface in either theme. `accent` vs `surface-raised` is 13.47:1 light and 14.47:1 dark, far past the 3:1 required of a focus indicator.
- `:focus-visible` only, so a finger tap never leaves a ring behind. Verify by tabbing through the kitchen-sink page with a Bluetooth keyboard attached to the phone, and separately by tapping the same controls.
- The Sheet's panel takes `tabIndex={-1}` and `focus:outline-none`: it receives focus on open so screen readers announce the sheet, but it is a container, not a control, so it draws no ring.

### Touch targets — minimum 44 × 44 pt

| Component | Painted size | Hit area | How |
|---|---|---|---|
| `Button size="md"` | 44px tall | 44 × ≥64 | `min-h-touch` |
| `Button size="lg"` | 52px tall | 52 × full | `min-h-13` |
| `TabBar` side tabs | — | 56 × ~167 | `h-tab` × `flex-1` |
| `TabBar` Tambah | 56px circle | 56 × 56 | `size-14` |
| `Sheet` close ✕ | 20px glyph | 44 × 44 | `size-touch` grid cell |
| `Chip` (interactive) | ~28px tall | 44 × ≥44 | `touch-target` pseudo-element |
| `CategoryPicker` cell | 72px tall | 72 × ~167 | `min-h-[4.5rem]` |
| `Toast` action | ~20px text | 44 × ≥56 | `-my-2` + `py-2` |

Verify in Chrome DevTools ▸ Rendering ▸ **Highlight ad frames / Emulate touch** — or simply switch on iOS's *Accessibility ▸ Touch Accommodations* and try to mis-tap. Anything narrower than a fingertip is a bug, not a style choice.

### Other

- `lang="id"` on `<html>` so screen readers use Indonesian pronunciation for "Makan & Jajan".
- `Money` exposes `aria-label` with a plain number plus "rupiah"; the dotted visual form is `aria-hidden`.
- `Chip` as a button announces "Kategori: Makan & Jajan. Ketuk untuk mengganti."
- `Toast` is `role="status"` / `aria-live="polite"` — it announces without stealing focus, which is what an undo affordance needs.
- Every icon-only control has an `aria-label`; every decorative SVG has `aria-hidden="true"`.
- `prefers-reduced-motion` zeroes all transitions globally in the base layer and specifically for the sheet.

---

## Claude Design integration

The visual design is being produced in a Claude Design design-system project (`docs/design-brief.md` holds the prompt) and pulled in through the `DesignSync` tool. This section is the reconciliation procedure.

### Procedure

```
DesignSync.list_projects()            → find the project named "Expense Tracking"
DesignSync.list_files(project_id)     → expect a token file plus one file per component/screen
DesignSync.get_file(project_id, path) → read; do not write it into the repo verbatim
```

Nothing from Claude Design is copied into the repo as a file. It is *translated*, one artefact at a time, into the structures this plan already defines.

### File mapping

| Design output | Lands in | Rule |
|---|---|---|
| Colour tokens (any format) | `app/globals.css` §1 raw palette only | Values only. **Our token names win.** `--app-surface`, `--app-accent`, `--cat-<key>`. If the design calls it `--brand-primary`, it still becomes `--app-accent` here. Every value must be supplied for **both** themes or it is not accepted. |
| Type scale | `app/globals.css` §2 `@theme` `--text-*` | Sizes and tracking may be adopted. **No step may fall below 17px if any input uses it.** |
| Spacing / radii / shadows | `app/globals.css` §2 `@theme` | Adopt. If the design ships more than 4 radii or more than 2 shadows, collapse to the nearest of ours and say which. |
| Component visuals (Button, Card, Chip, …) | the `className` strings inside the existing `components/ui/*.tsx` | **Structure, props and behaviour are ours; appearance is theirs.** Change class strings, never prop names, never the DOM shape, never the `<dialog>` mechanism. Five features are typed against these props. |
| Screen compositions | F05 / F07 / F08 / F09 plans | F10 does not build screens. Forward them. |
| Chart styling | F08's plan | F08 also owns the `dataviz` skill pass. F10 only guarantees the eight `--cat-*` values. |
| Icons / illustrations | `public/brand/` | Only if they beat the current mark. Regenerate all five raster sizes if the mark changes. |

### Conflict resolution — the constraints win, always

When the design output contradicts something in this plan, this is the order of precedence:

1. **iOS constraints** (this section's list) — non-negotiable, no exceptions, no "just this once".
2. **Contract §4** of the roadmap — 8 categories, 3 tabs, 6 routes, IDR formatting.
3. **Accessibility floors** — 4.5:1 text, 3:1 graphical, 44pt targets.
4. **The design's aesthetic choices** — everything else. Follow it exactly.

Concretely, when the incoming design says:

| Design says | Do this |
|---|---|
| an input at 14px or 15px | **Reject.** Ship 17px. If the design's proportions depend on the smaller input, scale the surrounding type up instead of the input down. |
| `100vh` on a full-height container | **Reject.** `100dvh`. Non-negotiable — `100vh` is wrong by ~80px on iOS until the URL bar collapses. |
| a fixed header or bar with plain padding | **Amend.** Add `env(safe-area-inset-*)`. A bar that ignores the home indicator is unusable, however good it looks in a mockup. |
| a 32px or 36px tap target | **Amend.** Keep the painted size, add `touch-target` for a 44pt hit area. Visual fidelity preserved, ergonomics fixed. |
| `user-scalable=no` or `maximum-scale=1` | **Reject outright.** No discussion. Fix sizing instead. |
| a category identified by colour alone | **Amend.** Add the emoji and the Indonesian label. |
| four or five shadow steps | **Collapse to two.** Map "elevated card" → border, "floating" → `shadow-raise`, "overlay" → `shadow-sheet`. |
| a category colour that fails 3:1 on a surface | **Amend.** Keep the hue, adjust the oklch lightness until it passes, re-run `scripts/palette-check.py`, record the new number in the contrast table. |
| a saturated accent that collides with a category hue | **Discuss before adopting.** The ink accent exists specifically so chrome and data never occupy the same visual register. Changing it is a design-direction decision, not a token swap. |
| a drag-to-dismiss sheet, a hover state, a parallax header | **Defer to v0.2.** Out of scope, and hover does not exist on the target device. |

### After any sync

1. Re-run `scripts/palette-check.py` and update the contrast tables above with the real numbers.
2. Re-run the full Visual QA checklist in both themes. A token change touches every screen.
3. Commit with `design(sync): <what changed> from Claude Design` so the provenance is in the history.
4. If a token was renamed or removed, say so in this file under Contract deltas and tell the owners of F05/F07/F08/F09 — they import these names.

---

## Interfaces I publish

Everything below is imported by F05, F06, F07, F08 and F09. Treat it as the contract.

> **REWRITTEN AFTER IMPLEMENTATION.** This section describes what actually shipped, not what the
> task list above proposed. F10 executed after the Claude Design pull, so the palette, both font
> families, the type scale and several component defaults changed. Every change is recorded, with
> its reason, in the *Addendum — rulings from F10* in `docs/RECONCILIATION_v0.1.0.md` (R-47…R-53);
> R-52 is the table of contract deltas specifically. **The task list above is now a historical
> record — read this section for the contract and `app/globals.css` for the tokens.**

### Token reference

Reconciliation R-24 still holds and is the thing most likely to bite: **stock Tailwind colour and
font-size utilities do not exist in this build.** No `bg-red-500`, no `text-gray-700`, no `text-sm`,
no `text-2xl`. Verified against a real build. These are the only ones.

**Colours** — usable as `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `stroke-*`, `divide-*`,
and with opacity modifiers (`bg-ink/10`):

```
paper  paper-2  card                  three surfaces: page · well · raised
ink  ink-2  ink-3                     three text weights: primary · secondary · label
rule  rule-2  rule-strong             container hairline · row separator · CONTROL border
accent  accent-soft                   the only green; the active-tab dot, the current bar
red  red-soft                         destructive and errors
photo-void                            true black, both schemes, lightbox only
cat-food  cat-groceries  cat-transport  cat-bills
cat-housing  cat-entertainment  cat-health  cat-other
white  black  transparent  current
```

`rule` vs `rule-strong` is not a style choice. `rule` is decorative — a card edge, a row separator.
`rule-strong` is the border that *identifies a control*, and WCAG 1.4.11 requires it (R-49). Inputs,
secondary buttons and picker cells use `rule-strong`; containers use `rule`.

Raw custom properties, for `style={{}}` and for Recharts `fill`/`stroke`:
`--paper`, `--paper-2`, `--card`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-2`,
`--rule-strong`, `--accent`, `--accent-soft`, `--red`, `--red-soft`, `--scrim`, `--photo-void`,
`--ease-out-soft`, and `--color-cat-<key>` (the name `CategoryMeta.color` publishes — prefer
`categoryFill(c)` over spelling it out).

**Type** — the name says whether a size is language or bookkeeping. Line-height and tracking come
with each; do not add `leading-*` unless you mean to override.

| Utility | px | Family | For |
|---|---|---|---|
| `text-label` | 10 | mono, 0.2em | section heads, field labels, sheet titles — or just use `eyebrow` |
| `text-meta` | 11 | mono, 0.08em | dates, counts, "6 catatan · 18 item" |
| `text-action` | 11 | mono, 0.14em | small button, tab label, toast action |
| `text-btn` | 12 | mono, 0.16em | full-width button |
| `text-money-sm` | 14 | mono | line-item amount |
| `text-chip` | 14 | serif | chip label |
| `text-body` | 15 | serif | prose, picker cell label |
| `text-item` | 16 | serif | item name, empty-state description |
| `text-input` | 17 | — | **every input.** Never go below it |
| `text-money-md` | 17 | mono 500 | per-expense total |
| `text-row` | 18 | serif | group row title |
| `text-money-lg` | 22 | mono 500 | draft running total |
| `text-title` | 27 | serif | screen title |
| `text-money-xl` | 40 | mono | the month total |
| `text-hero` | 40 | serif | the sign-in wordmark |

Families: `font-serif` (Source Serif 4) and `font-mono` (IBM Plex Mono). Body defaults to serif.
**Money is always mono**, and `Money` applies it for you. There is no `font-sans`.

**Spacing** — the default 4px numeric scale (`p-4` = 16px) plus, usable anywhere spacing is
(`px-gutter`, `min-h-touch`, `size-touch`, `h-control`, `h-btn`, `h-tab`, `min-h-row`):

`gutter` 22 · `touch` 44 · `control` 48 · `btn` 52 · `tab` 54 · `row` 52 · `row-lg` 56

**Container** — `max-w-app` = 416px (the design canvas is 414).

**Radii** — `rounded-chip` (2) · `rounded-field` (6) · `rounded-card` (10) · `rounded-full`. The
stock `rounded-sm`…`rounded-3xl` still exist because that namespace is not reset, but do not use
them.

**Shadows** — none. There are no shadow tokens (R-36). Elevation is `card` on `paper` plus a
hairline; the sheet earns its layer from the scrim, the toast from inverting to ink.

**Easing** — `ease-out-soft`.

**Utilities** — `tabular` · `rail` · `eyebrow` · `press` · `touch-target` · `pt-safe` · `pb-safe` ·
`px-safe` · `pt-safe-header` · `pb-tabbar` · `scroll-pane`.

`eyebrow` is the mono label in one class: family, 10px, 0.2em, uppercase, `ink-3`. Its colour is a
default — a later `text-*` overrides it (the utility is emitted before the colour utilities).

**Component classes** — `.chip` / `.chip-code` / `.chip-label` · `.cell` / `.cell-code` /
`.cell-label` · `.sheet` / `.sheet-panel` · `.skeleton`. All are driven by the components below;
`.chip` and `.cell` additionally read an inline `--c` from `categoryStyle()`.

### `lib/categories.ts` (owned by F03a under R-7, one field changed by design R-34)

```ts
export const CATEGORIES: readonly ["food","groceries","transport","bills","housing","entertainment","health","other"]
export type Category = (typeof CATEGORIES)[number]
export const DEFAULT_CATEGORY: Category                 // 'other'

export interface CategoryMeta {
  id: Category
  label: string                                         // 'Makan & Jajan'
  code: string                                          // 'MJ' — two chars. WAS `emoji`.
  color: `--color-cat-${Category}`                      // a NAME, not a value
  hint: string                                          // 'warung, resto, kopi, snack'
}

export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>>
export const CATEGORY_LIST: readonly CategoryMeta[]     // grid order === CATEGORIES order
export function categoryMeta(value: string): CategoryMeta   // never throws, degrades to 'other'
export function toCategory(value: unknown): Category        // never throws
export function isCategory(v: unknown): v is Category

// added by F10, additive:
export function categoryStyle(c: Category): CSSProperties   // sets --c for .chip / .cell
export function categoryFill(c: Category): string           // 'var(--color-cat-food)'
```

There is no `CATEGORY_ORDER` and no `emoji`. `CATEGORY_LIST` is the ordered list; `CATEGORIES` is
the order.

### `lib/format.ts` (owned by F03a under R-8 — F10 imports, never redefines)

```ts
export function formatIdrDigits(n: number): string   // 38500 → '38.500'
export function formatIdr(n: number): string         // 38500 → 'Rp 38.500'
export function formatIdrCompact(n: number): string  // 266350 → 'Rp 266rb'
export function parseIdrLoose(s: string): number | null
// …plus the full date half: TZ, todayJakartaISO, monthKey, currentMonthKey, monthRange,
//    addMonths, isAfterCurrentMonth, monthLabel, monthLabelShort, dateLabel, dayLabel,
//    formatJakartaLong, MONTH_NAMES_ID, isValidDateISO, isValidMonthKey.
```

### `lib/cn.ts`

```ts
export type ClassValue = string | false | null | undefined
export function cn(...parts: ClassValue[]): string
```

### `components/ui` — every prop type

```ts
/* ---- Button ---------------------------------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'md' | 'lg'          // md = 44px small variant, lg = 52px normal

interface ButtonBaseProps {
  variant?: ButtonVariant              // default 'primary'
  size?: ButtonSize                    // default 'lg'   <-- CHANGED (R-52a)
  fullWidth?: boolean                  // default false
  leadingIcon?: React.ReactNode
}
interface ButtonProps extends ButtonBaseProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  loading?: boolean                    // default false; disables, keeps width, dots for label
}
function Button(props: ButtonProps): JSX.Element
// `type` defaults to 'button'. Pass type="submit" explicitly inside a <form>.

interface ButtonLinkProps extends ButtonBaseProps, Omit<React.ComponentProps<typeof Link>, 'className'> {
  className?: string
}
function ButtonLink(props: ButtonLinkProps): JSX.Element

function buttonClasses(o?: ButtonBaseProps): string
function LoadingDots(p: { className?: string }): JSX.Element
const Spinner = LoadingDots            // alias, kept for the old name (R-52b)

/* ---- Card ------------------------------------------------------------ */
interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'ul' | 'li'   // default 'div'
  padded?: boolean | 'rows'                          // default true (16px); 'rows' = list inset
}
function Card(props: CardProps): JSX.Element
// Rows inside a card separate with `divide-y divide-rule-2` — no border after the last child.

/* ---- Money ----------------------------------------------------------- */
type MoneySize = 'hero' | 'lg' | 'md' | 'sm'   // 40 / 22 / 17 / 14 px, all mono
type MoneyTone = 'default' | 'muted' | 'danger' | 'success'

interface MoneyProps {
  value: number                        // whole rupiah; negative renders U+2212
  size?: MoneySize                     // default 'sm'
  tone?: MoneyTone                     // default 'default'
  showPrefix?: boolean                 // default true — 'Rp ' inline, same size
  signed?: boolean                     // default false; forces '+' on positives
  className?: string
}
function Money(props: MoneyProps): JSX.Element
// Carries `tabular` and a visually-hidden plain-integer twin for screen readers.

/* ---- Field / Input / TextArea ---------------------------------------- */
interface FieldProps {
  label: string
  hideLabel?: boolean                  // default false (sr-only)
  hint?: string
  error?: string                       // presence = error state; supersedes hint
  required?: boolean                   // default false
  className?: string
  children: React.ReactNode
}
function Field(props: FieldProps): JSX.Element

type InputProps = React.InputHTMLAttributes<HTMLInputElement>
function Input(props: InputProps): JSX.Element        // auto-wires id/aria from Field

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>
function TextArea(props: TextAreaProps): JSX.Element  // rows defaults to 6; card radius, padded

function useFieldContext(): { inputId: string; describedBy?: string; invalid: boolean } | null
const CONTROL_CLASS: string           // borrow the input chrome for a custom control

// Inside a sheet or a card, where the surface is already `card`, pass className="bg-paper".

/* ---- MoneyInput ------------------------------------------------------ */
interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type'> {
  value: number | null
  onValueChange: (value: number | null) => void   // EVERY accepted change (R-52e)
  onParseError?: (rawText: string) => void        // on blur, when even parseIdrLoose failed
  className?: string
}
function MoneyInput(props: MoneyInputProps): JSX.Element
// FULLY CONTROLLED: the text is derived from `value`, so ignoring onValueChange freezes the
// field. inputMode="numeric"; dots inserted as you type; Rp is a static span outside the value.
// Typed digits are reformatted; a paste of 45k / 1,5jt / Rp 38.500 goes through parseIdrLoose.

/* ---- Sheet ----------------------------------------------------------- */
interface SheetProps {
  open: boolean                        // parent owns the state; no internal toggle
  onClose: () => void                  // Escape, scrim tap, and the ✕ if shown
  title: string                        // required: it is the accessible name
  hideTitle?: boolean                  // default false
  description?: string
  footer?: React.ReactNode             // pinned, safe-area padded
  showCloseButton?: boolean            // default FALSE (R-52d)
  className?: string                   // applied to .sheet-panel
  children: React.ReactNode            // rendered in the scrolling body
}
function Sheet(props: SheetProps): JSX.Element

/* ---- Chip / CategoryCode --------------------------------------------- */
interface ChipProps {
  category: Category
  size?: 'sm' | 'md'                   // default 'sm' (32px) · md = 44px
  onClick?: () => void                 // present ⇒ renders a <button> with touch-target
  selected?: boolean                   // default false; fills with the category colour
  labelHidden?: boolean                // default false (code only, label sr-only)
  className?: string
}
function Chip(props: ChipProps): JSX.Element
function CategoryCode(p: { category: Category; className?: string }): JSX.Element
function CategoryDot(p: { category: Category; className?: string }): JSX.Element
// Prefer CategoryCode in dense rows: same colour, plus the identity (R-52g).

/* ---- CategoryPicker -------------------------------------------------- */
interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  value?: Category | null              // default null
  onSelect: (category: Category) => void  // picker closes itself after this
  title?: string                       // default 'Pilih kategori'
}
function CategoryPicker(props: CategoryPickerProps): JSX.Element

/* ---- EmptyState ------------------------------------------------------ */
interface EmptyStateProps {
  icon?: React.ReactNode               // the design ships none; the dashed outline is the art
  title: string                        // renders as the mono eyebrow
  description?: string
  action?: React.ReactNode
  className?: string
}
function EmptyState(props: EmptyStateProps): JSX.Element

/* ---- TabBar ---------------------------------------------------------- */
interface TabBarProps {
  monthHref: string                    // '/m/2026-08', computed server-side from currentMonthKey()
}
function TabBar(props: TabBarProps): JSX.Element
// Rendered by app/(shell)/layout.tsx only. Features never mount it themselves.

/* ---- Toast ----------------------------------------------------------- */
interface ToastAction { label: string; onAction: () => void }
interface ToastOptions {
  action?: ToastAction
  duration?: number                    // ms, default 5000
  tone?: 'neutral' | 'danger'          // default 'neutral'
}
interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
  dismiss: () => void
}
function ToastProvider(p: { children: React.ReactNode }): JSX.Element  // root layout only
function useToast(): ToastApi
// F07's undo:  show('Item dihapus', { action: { label: 'Urungkan', onAction: restore } })
// One at a time: a new toast replaces the current one.
```

### `components/AppShell.tsx`

```ts
function AppShell(p: { children: React.ReactNode; className?: string }): JSX.Element
```

Rendered by the two route-group layouts only. Full width on a phone; a 416px column centred on
`paper-2` with hairlines down both edges on a wide viewport.

### Layout contract for feature authors

- `app/(shell)/` — `/m/[month]` and `/stats`. Gets the TabBar and `pb-tabbar` automatically; do not
  add bottom padding for the bar yourself.
- `app/(bare)/` — `/`, `/new`, `/e/[id]`, `/s/[token]`. Gets the column and nothing else, so the
  screen **must supply its own way back**: the design's header of back chevron · mono label ·
  optional action (R-51).
- Sticky headers: `sticky top-0 z-30 bg-paper/95 backdrop-blur-md pt-safe-header px-gutter`.
- Page horizontal inset is `px-gutter` (22px), or `px-safe` if the content must survive landscape.
- Any independently scrolling region gets `scroll-pane`.
- Any tappable element gets `press`; if it paints smaller than 44px, add `touch-target`.
- Lists of rows: `<Card padded="rows">` with `divide-y divide-rule-2` on the inner list.
- **Never write a raw `<input>`.** Use `Input` / `TextArea` / `MoneyInput`, which carry the 17px
  floor that stops Safari zooming the page on focus.
- **Never typeset an amount by hand.** Use `Money`, which carries the mono tabular rail.
- Every label, meta line and section head is `eyebrow` or `text-meta` in `font-mono`. Prose and
  names are serif. If you are unsure which, ask whether the text is language or bookkeeping.

### Verifying a token change

`scripts/palette-check.py` is the gate (R-28). Edit the two dicts to match `app/globals.css`, run
`python3 scripts/palette-check.py`, and read the waiver it prints. Never hand-edit a contrast
figure. `/dev/ui` renders every primitive for the visual pass and 404s in production.


## Open questions for the integrator

1. **Does F03 accept D-1 and D-2?** F10 authoring `lib/categories.ts` and the money half of `lib/format.ts` is what unblocks wave 1. If F03's author would rather own both, F10 needs stub versions and a merge task in wave 2 — resolve before F03 starts, not after.

2. **Is the namespace reset (D-4) acceptable to the other four feature authors?** `text-sm`, `bg-gray-100`, `rounded-2xl` and friends stop existing. It is the mechanism that keeps five parallel plans on one system, but it is also the single most likely source of "why won't this class work" during waves 3–5. If the answer is no, the fallback is to keep the stock namespaces and rely on review discipline — weaker, but reversible by deleting two lines.

3. **`apple-mobile-web-app-status-bar-style`: `black-translucent` or `default`?** This plan chose translucent, which gives the full-bleed look and is why `pt-safe-header` exists on every header. `default` is more forgiving of a header that forgets its safe-area padding, at the cost of a solid strip at the top. Cheap to flip; decide once and stop revisiting.

4. **Is a single-slot Toast enough for F07?** Undo-delete is the only known consumer, and a second simultaneous toast would be invisible at 414px. If F07 ends up firing two in quick succession (delete item + delete group), the second replaces the first and the first undo is lost. Confirm with F07's author.

5. **Drag-to-dismiss on the Sheet — deferred, correctly?** The grab handle is drawn but inert. iOS users will try to drag it. Accepting the small dishonesty keeps ~120 lines of pointer-event handling out of v0.1.0. If it must ship, it belongs in v0.2 with its own plan.

6. **Which chart form does F08 want, and does it need a fixed series order?** `CATEGORY_ORDER` is published as the canonical order so a colour always means the same thing in the same position. If F08 sorts segments by amount instead, the two closest pairs (`health`/`other` light, `bills`/`entertainment` dark) can land adjacent — F08 must then add the 1.5px surface-coloured stroke between segments.

7. **Sign-off on the mark.** Three right-aligned bars on ink — the money rail as an icon. It is deliberately abstract and it will be the thing on the home screen. If Claude Design produces a mark, that one probably wins; if not, this one ships and all five raster sizes need regenerating on any change.

8. **Does `/` belong to F10's `(bare)` group or to F02's sign-in?** Only one route group can own `/`. This plan puts a landing page there; F02 also plans a sign-in screen. Whoever writes it second must render into the existing route, not create a second one, or the build fails with a duplicate-route error.

9. **Where does `scripts/palette-check.py` live long-term?** The contrast tables above are only trustworthy if the script that generated them stays with the repo. Recommend committing it alongside this plan so a future colour change can be verified rather than argued about.

---

## Appendix — `scripts/palette-check.py`

**The script now lives in the repo at `scripts/palette-check.py`**, which answers this plan's own
open question 9 (*"where does it live long-term?"*): beside the code, so a colour change can be
verified rather than argued about.

It is not the version that was drafted here. That one solved a palette defined in OKLCH and checked
sRGB gamut, which no longer applies — the shipped palette is hex from the design pull, always in
gamut by construction. The committed script instead:

- measures **every pairing the components actually paint**, named after the thing that paints it
  (`ink-3 on paper`, `paper on food fill`, `rule-strong on card`), rather than a generic grid;
- holds a category colour to **4.5:1**, because the two-letter code renders it as text — this is the
  check that R-28 was really asking for, and the design's ≥4.5:1 claim passes it;
- separates the hairline that identifies a control (3:1, enforced) from the decorative ones
  (reported, no threshold);
- prints the categorical-separation **waiver and its expiry condition** on every run, and keeps that
  figure out of the exit code so nobody "fixes" the hues without reading why they are close;
- exits non-zero on a contrast failure, so it works as a gate.

```bash
python3 scripts/palette-check.py     # → CONTRAST FAILURES: 0
```
