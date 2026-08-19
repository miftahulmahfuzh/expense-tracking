# F08 — Monthly Stats & Charts

> **Route:** `/stats` (+ optional `?m=YYYY-MM`)
> **Depends on:** F03 (queries), F07 (`/m/[month]`, `/e/[id]`), F10 (design tokens)
> **Stack:** `next@16.3.1`, `react@19.2.8`, `recharts@3.10.1`, `tailwindcss@4.3.3`
> **Target device:** iPhone XS Max — 414 × 896 CSS px, thumb-driven, no hover.
> **Core tenet:** simplicity. Recharts is used for **exactly one** chart on this page.

---

## 0. Executive summary of the decisions

| # | Decision | One-line reason |
|---|---|---|
| D-A | 12-month **column (vertical bar)** chart, one series, slot-1 blue | Twelve discrete, named, non-continuous periods → bars, not a line |
| D-B | Zero-spend months are **explicit rows with `totalIdr: 0`**, densified server-side | A missing month silently compresses the x-axis and the trend lies |
| D-C | Category breakdown is a **horizontal bar list**, not a donut | 8 classes, 414 px, and the all-pairs CVD gate **FAILS** at 8 — a donut makes colour load-bearing; a bar list makes text load-bearing |
| D-D | **No hover tooltip.** A tap **selects**; the value renders as a persistent readout + a direct label on the selected bar's cap | There is no hover on a phone; the skill's rule is "tooltips enhance, never gate" |
| D-E | **Two-stage tap**: 1st tap selects the month (updates `?m=`), 2nd tap on the already-selected bar navigates to `/m/[month]` | Satisfies both "tap a bar → see the value" and "tap a bar → go to the month", with a mis-tap guard |
| D-F | Month selector is a **query param `?m=YYYY-MM`**, not a route segment | Keeps §4.6's `/stats` exactly as written; the tab bar keeps a bare `/stats` href; `/m/[month]` stays F07's resource route |
| D-G | The current month is compared **month-to-date vs. same-day-of-month last month** | A half-finished month against a complete one is a lie, not a delta |
| D-H | `other` (Lainnya) wears the **de-emphasis grey**, not a categorical hue | The skill defines a first-class "de-emphasis / Other" colour role; it also removes the red↔`critical` collision with the delta tile |
| D-I | Recharts is **dynamically imported with `ssr: false`** from inside a client wrapper | It is ~100 KB gz; it must not enter the shared chunk or the RSC payload |
| D-J | The breakdown, delta and biggest-expense tiles are **plain server-rendered HTML/CSS**, zero JS | They read CSS custom properties directly via `var(--color-cat-*)`, so light/dark and colour-blind themes swap for free |

---

## 1. Chart-form justification (against the dataviz skill's heuristic)

The skill's procedure is: **form → colour job → validate → marks → interaction → a11y pass → look at it.** Colour comes last. Here is the reasoning for each of the four visual elements on this page, in that order.

### 1.1 Monthly growth — bar (column), not line

The skill's form table:

> | Job (what the reader must do) | Default form |
> | Compare magnitude, low → high | **bar / column** |
> | Trend over time | line |

Both rows are candidates, so the tie-break is what the x-values *are*:

- **A month is a discrete bucket, not a sample of a continuous process.** "Rp 2.4 jt in Agustus" is a completed sum over 31 days, not a reading taken at an instant. A line's slope between April and May asserts an intermediate value on 2026-04-15 that does not exist in the data — the interpolation is fiction.
- **The reader's actual question is comparative** ("was August worse than July?"), which is a magnitude comparison against a common baseline. That is literally the bar row.
- **The bar is also the hit target.** D-E requires each month to be tappable. A line has 12 pinpoint vertices; the skill explicitly flags "pinpoint hover targets — an 8 px dot you must land on dead-centre" as an anti-pattern. A 26 px-wide full-height column band is a comfortable thumb target with no extra machinery.
- **Zero months read correctly as bars.** A zero-height bar sitting on a drawn baseline with its tick label present says "Rp 0 in this month". A line dropping to zero and back up implies a continuous descent through the month, which is again fiction.

**Colour job:** one series → **not categorical**. The skill: "A single series needs no legend box — the title names it," and "One series → one color (slot 1) for every bar." So: every completed month is slot-1 blue, no legend. Colouring bars by their value (dark = bigger) is the skill's named anti-pattern *"a value-ramp on nominal categories"* — it would double-encode height as hue. We do not do it.

**The one exception, and why it is not a value-ramp:** the **in-progress current month** takes a lighter step of the *same* blue hue (light `#6da7ec`; dark `#256abf`). This encodes *data completeness*, not magnitude — it is a two-step ordinal cue on one hue, monotone in lightness, which is exactly what the skill's ordinal rule permits. It is backed by two non-colour channels: the x tick is suffixed with `•`, and the caption below the chart reads `• Bulan berjalan — belum penuh`. Colour never carries it alone.

**Selection emphasis** is done without inventing a hue: the selected month's tick label goes to primary ink + semibold with a 2 px accent underline, while unselected ticks stay muted. The bar fill is untouched — see the "recolor-on-filter" anti-pattern; the *entity's* colour never moves.

### 1.2 Category breakdown — horizontal bar list, not a donut

§4.6 of the roadmap says "donut", and F03's `getCategoryBreakdown` docstring says "Powers the F08 donut". **This plan overrides both** (see `## Contract deltas`). The reasoning:

1. **The skill deprioritises the donut outright.** `components.md`: *"part-to-whole rides on the stacked bar chart; **donut stays deprioritized**."* `anti-patterns.md`: *"❌ A donut/pie for comparing close values → ✅ a bar, or the numbers"* and *"Part-to-whole at a glance only, **≤ 6 segments**."* We have 8 categories. That is over the stated cap before we even open the colour question.

2. **The colour maths fails for a donut, and it is not close.** In a donut every slice is potentially adjacent to every other (the ring order rotates as amounts change, and non-touching slices are still compared across the ring), so the `--pairs all` gate applies. Run against the 8-slot palette:

   ```
   $ node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" \
       --mode light --pairs all
     [FAIL] CVD separation      worst all-pairs #008300↔#eb6834 ΔE 3.2 (protan) · tritan 5.1
     [FAIL] Normal-vision floor worst all-pairs #e34948↔#eb6834 ΔE 7.1 (normal) — below 15
     → FAILED

   $ node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" \
       --mode dark --surface "#1a1a19" --pairs all
     [FAIL] CVD separation      worst all-pairs #d55181↔#199e70 ΔE 1.6 (deutan) · tritan 2.9
     [FAIL] Normal-vision floor worst all-pairs #e66767↔#d95926 ΔE 7.1 (normal) — below 15
     → FAILED
   ```

   ΔE 1.6 under deuteranopia means two slices are *the same colour* for roughly 1 in 12 men. And the normal-vision floor FAIL (7.1, against a floor of 15) means **full-colour readers cannot reliably tell those slices apart either**. The skill is explicit that the all-pairs cap cannot be fixed by re-ordering or re-stepping: *"cut the series count, facet, or switch chart form."* We switch chart form.

3. **A bar list moves identity off colour entirely.** Every row carries `emoji · Indonesian label · Rp amount · %` as text, on a common left baseline. Colour becomes a redundant recognition cue (it matches the category chip the user taps in F05/F07), not the discriminating channel. Under that assignment the palette's *adjacent* gate is the relevant one, and it passes in both modes (§4.3).

4. **A donut wastes a 414 px screen.** A 350 px-wide donut is a ~120 px ring with eight leader lines fighting for room; small slices get no label at all. Eight stacked rows at ~44 px each is 350 px of *readable* height with every value present and every row a legitimate tap target.

5. **Aligned baselines beat angles for comparison.** "Is transport bigger than bills?" is a length comparison in a bar list and an arc-angle comparison in a donut. Length wins; that is the whole reason the skill's table sends magnitude comparison to bars.

**Why bar-per-row and not one stacked bar?** A single 100 %-wide stacked bar is the skill's canonical part-to-whole form, but at 350 px an 8-segment stack puts 1–3 % categories at 3–10 px between 2 px surface gaps — unreadable and unlabellable. Per-row bars scaled to *share of total* keep the part-to-whole reading (the reader still sees "Makan is about a third of the width") **and** give an aligned common baseline for comparison, with room for a label on every row. That is strictly better on this device.

### 1.3 Month-over-month delta — a stat tile, not a chart

The skill's *"Is it even a chart?"* table:

> | A single current value (+ maybe a trend) | **Stat tile** (value + delta + sparkline) | *Not* a one-bar bar chart |

The delta is one number with a direction. Rendering it as a 2-bar chart ("this month vs last month") would be the *"❌ a one-bar bar chart"* anti-pattern with an extra bar. It is a stat tile: `label` · `value` · `delta` (signed, vs a *named* period). We omit the sparkline slot — the 12-month chart directly above it already is the sparkline, at full size.

**Colour job = status, not categorical.** The skill's collision rule: *"when a series means good/bad it wears status tokens."* Spending more is bad, so up → `critical`, down → `good`. Because status colours must **always** ship with icon + label, the tile renders an arrow glyph **and** the Indonesian word (`Naik` / `Turun`), never colour alone. (Note: status `critical` `#d03b3b` sits ΔE 4.8 from the categorical red — which is one more reason `other` takes the grey (D-H) and no categorical red appears on this page at all.)

### 1.4 Biggest single expense — a callout tile, not a chart

One row of data. There is no chart here; it is a link tile with a stat-tile amount, the item name, the parent group's title and date. Included because it is the single most actionable fact on the page.

**Hero-figure discipline:** the skill allows *exactly one* hero figure per view. On `/stats` that is the **selected month's total** at the top of the page (≥ 44 px, system sans, proportional figures). The biggest-expense amount is a stat-tile value (22 px), not a second hero.

---

## 2. Page anatomy at 414 px

```
┌─ 414 px ────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────┐  │
│  │ Agustus 2026                    [‹]  [›]      │  │  ← MonthSwitcher (chevrons, F07-consistent)
│  │ Rp 2.418.350                                  │  │  ← HERO figure, 44px
│  │ ↑ Naik 12% dari Rp 2.159.000                  │  │  ← DeltaTile (status token + glyph + word)
│  │ vs 1–19 Jul 2026 (periode sama)               │  │  ← the basis, always stated
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ 12 bulan terakhir                             │  │
│  │ Agu 2026 · Rp 2.418.350 · Lihat bulan →       │  │  ← persistent readout (replaces hover tooltip)
│  │  2,4jt┤        ▁    █                         │  │
│  │  1,2jt┤  ▄  ▂  █ ▆  █  ▃                      │  │  ← Recharts column chart, 196px
│  │      0└──┴──┴──┴─┴──┴──┴──┴──┴──┴──┴──┴──     │  │
│  │       Sep Okt Nov Des Jan Feb … Agu•          │  │
│  │  • Bulan berjalan — belum penuh sebulan.      │  │
│  │  ▸ Lihat angka                                │  │  ← <details> table view (the a11y twin)
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Rincian kategori                              │  │
│  │ 🍜 Makan & Jajan        Rp 862.000    36%     │  │
│  │ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇                            │  │
│  │ 🛵 Transport            Rp 431.500    18%     │  │
│  │ ▇▇▇▇▇▇▇▇▇                                     │  │
│  │ …                                             │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Pengeluaran terbesar                          │  │
│  │ perumahan laddaland        Rp 490.000     →   │  │  ← links /e/[groupId]#item-[itemId]
│  │ bakar duit tuesday · 18 Agu 2026              │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [ Bulan Ini ]      ( + )      [ Statistik ]        │  ← F07's AppTabBar, safe-area
└─────────────────────────────────────────────────────┘
```

Horizontal budget (used to size the chart): `414 − 16×2 page padding = 382` → `− 14×2 card padding = 354` → `− 40 y-axis = 314 plot` → `314 / 12 = 26.2 px per band`. Bars are `barSize={14}`, leaving ~12 px of air per band (the skill: "cap it — never fill the slot"). The **hit target is the whole 26 px band, full height**, not the 14 px bar (§5, Task 6).

---

## 3. Server / client boundary — exact

F07 owns the authenticated shell, so `/stats` lives **inside the route group**:

```
app/(shell)/layout.tsx                    ← F07. Tab bar, ToastProvider, safe-area bottom padding.
app/(shell)/stats/page.tsx                ← SERVER (async RSC). Auth, all DB reads, all maths.
├── app/(shell)/stats/MonthSwitcher.tsx      ← SERVER. Two <Link>s. Zero JS.
├── app/(shell)/stats/DeltaTile.tsx          ← SERVER. Pure render. Zero JS.
├── app/(shell)/stats/MonthlyChart.tsx       ← 'use client'. Selection state + routing + table view.
│   └── app/(shell)/stats/MonthlyChartInner.tsx  ← 'use client'. THE ONLY FILE THAT IMPORTS recharts.
│                                                  loaded via next/dynamic({ ssr: false })
├── app/(shell)/stats/CategoryBreakdown.tsx  ← SERVER. CSS bars, var(--color-cat-*). Zero JS.
├── app/(shell)/stats/BiggestExpenseTile.tsx ← SERVER. One <Link>. Zero JS.
└── app/(shell)/stats/EmptyStates.tsx        ← SERVER.
```

> Route groups do not change URLs — `app/(shell)/stats/page.tsx` still serves `/stats`. Outside the group the page would render with no tab bar and no toast provider, which F07's plan calls out explicitly.

**What crosses the boundary:** only `MonthlyChart` receives props, and they are strictly JSON-serialisable primitives:

```ts
type MonthPoint = {
  month: string      // 'YYYY-MM'
  label: string      // 'Agu'  (pre-formatted on the server — no Intl in the client bundle)
  totalIdr: number   // whole rupiah, always present, 0 for empty months
  isPartial: boolean // true only for the in-progress current month
}
// props: { series: MonthPoint[]; selectedMonth: string }
```

No `Date` objects, no `bigint`, no class instances, no functions. Twelve objects ≈ 700 bytes in the RSC payload.

**Why `MonthlyChart` (the wrapper) is a client component and not the server page itself:** in Next 16 / React 19, `next/dynamic(..., { ssr: false })` is **not permitted inside a Server Component** — it throws at build. The `ssr: false` call must therefore live in a file that already has `'use client'`. `MonthlyChart.tsx` is that file; it is tiny (state + router + a `<details>` table) and holds the dynamic import.

**Bundle impact.** `recharts@3.10.1` pulls `d3-scale`, `d3-shape`, `d3-array`, `d3-interpolate`, `victory-vendor` — roughly **95–115 KB gzipped**. Mitigation, in order of effect:

1. **Dynamic import with `ssr: false`** keeps it out of the RSC render *and* out of the shared/app chunk. It lands in a route-level lazy chunk fetched only when `/stats` mounts. Users who never open the Statistik tab never download it.
2. **Named imports only** — `import { Bar, BarChart, … } from 'recharts'`. Recharts 3 ships ESM with `sideEffects: false`, so unused chart families (Pie, Radar, Sankey, Treemap, Scatter, Funnel) tree-shake out.
3. **One chart only.** The breakdown, delta, and callout are hand-rolled CSS. This is the biggest single win and it is a *simplicity* win too: no Recharts `<PieChart>`, `<Legend>`, `<Sector>`, or label-collision code enters the bundle.
4. **`isAnimationActive={false}`** on `<Bar>` and `<Tooltip>` — drops the animation path and removes a jank source on an A12 Safari.
5. A fixed-height skeleton (`min-height: 196px`) under the dynamic import so the lazy chunk arriving causes **zero layout shift**.

**Verification command (run it, do not assume):**

```bash
npm run build 2>&1 | tail -40
# Expect /stats First Load JS to be ~100 KB above /m/[month]'s,
# and the recharts chunk to appear ONLY in the /stats row.
```

**Round trips.** The page issues exactly **four** logical reads, all in one `Promise.all` (one `await` boundary, no waterfall, no N+1, no client fetching, zero client-side summing of raw rows). Every one is a SQL aggregate from F03. If F03 exposes the neon-http Drizzle instance, wrap them in `db.batch([...])` to collapse them into a **single HTTP round trip** to Neon — see `## Open questions for the integrator`, item 3.

---

## 4. Colour system — token-driven, validated

### 4.1 Nothing is hardcoded in a component

- The **category** tokens are F10's, and F03 already fixed their **names**: `CategoryMeta.color` is typed `` `--color-cat-${Category}` ``, i.e. `--color-cat-food` … `--color-cat-other`, leading dashes included. The breakdown component reads them as ``style={{ background: `var(${meta.color})` }}`` — a live CSS variable, so a `prefers-color-scheme` flip repaints with **no JS, no re-render, no flash**. F08 never writes a category hex.
- The **chart chrome** tokens (`--chart-*`) are declared once by F08 in `app/(shell)/stats/stats.css`. `MonthlyChartInner.tsx` contains no hex at all: it sets `className` on `<Cell>` and lets CSS paint the `fill`.

> **Why `className` and not `fill="var(--x)"`:** an SVG *presentation attribute* (`fill="…"`) does not resolve `var()` in Safari. But CSS declarations **beat presentation attributes** in the cascade. So even though Recharts writes `fill="…"` onto the `<path>`, a rule `.stats-bar--complete { fill: var(--chart-series-1); }` wins. This is the reliable way to get design tokens into a Recharts mark, and it is what makes the chart theme-reactive for free.

### 4.2 The category palette F10 must define

Assigned in the **fixed slot order** of `CATEGORIES` (§4.1) — never by rank, never cycled. `other` takes the skill's de-emphasis / "Other" role (D-H).

| # | Category | Slot / hue | Light | Contrast | Dark | Contrast | Token |
|---|---|---|---|---|---|---|---|
| 1 | `food` | 1 blue | `#2a78d6` | 4.30 ✅ | `#3987e5` | 4.79 ✅ | `--color-cat-food` |
| 2 | `groceries` | 2 orange | `#eb6834` | 3.12 ✅ | `#d95926` | 4.48 ✅ | `--color-cat-groceries` |
| 3 | `transport` | 3 aqua | `#1baf7a` | 2.74 ⚠︎ | `#199e70` | 5.11 ✅ | `--color-cat-transport` |
| 4 | `bills` | 4 yellow | `#eda100` | 2.11 ⚠︎ | `#c98500` | 5.67 ✅ | `--color-cat-bills` |
| 5 | `housing` | 5 magenta | `#e87ba4` | 2.62 ⚠︎ | `#d55181` | 4.41 ✅ | `--color-cat-housing` |
| 6 | `entertainment` | 6 green | `#008300` | 4.82 ✅ | `#008300` | 3.52 ✅ | `--color-cat-entertainment` |
| 7 | `health` | 7 violet | `#4a3aa7` | 8.33 ✅ | `#9085e9` | 5.57 ✅ | `--color-cat-health` |
| 8 | `other` | de-emphasis grey | `#898781` | 3.50 ✅ | `#898781` | 4.85 ✅ | `--color-cat-other` |

Surfaces validated against: light `#fcfcfb`, dark `#1a1a19`.

⚠︎ = below 3:1 on the **light** surface. The skill's **relief rule** applies and is satisfied twice over on this page: every bar carries a **visible direct label** (emoji + name + `Rp` amount + `%`) and the breakdown *is itself* the table view. Shipping the sub-3:1 fill with neither would be a fail; we do neither.

### 4.3 Validator output — run, not eyeballed

```bash
SKILL=/path/to/skills/dataviz   # the dataviz skill base directory

# categorical, ADJACENT pairlist (the correct list: bars on a common baseline,
# identity carried by text, colour redundant) — 7 hues, `other` grey excluded
node "$SKILL/scripts/validate_palette.js" \
  "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7" --mode light
node "$SKILL/scripts/validate_palette.js" \
  "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9" --mode dark --surface "#1a1a19"
```

Expected output — **both must exit 0**:

```
Palette (light, surface #fcfcfb, categorical): 7 slots
  [PASS] Lightness band         all 7 inside L 0.43–0.77
  [PASS] Chroma floor           all 7 >= 0.1
  [PASS] CVD separation         worst adjacent #eda100↔#1baf7a ΔE 9.1 (protan) · tritan 5.8
  [PASS] Normal-vision floor    worst adjacent #e87ba4↔#eda100 ΔE 19.6 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#1baf7a",2.74],["#eda100",2.11],["#e87ba4",2.62]]
  → ALL CHECKS PASS

Palette (dark, surface #1a1a19, categorical): 7 slots
  [PASS] Lightness band         all 7 inside L 0.48–0.67
  [PASS] Chroma floor           all 7 >= 0.1
  [PASS] CVD separation         worst adjacent #c98500↔#199e70 ΔE 8.4 (protan) · tritan 8.7
  [PASS] Normal-vision floor    worst adjacent #d55181↔#c98500 ΔE 19.3 (normal)
  [PASS] Contrast vs surface    all 7 >= 3:1
  → ALL CHECKS PASS
```

The `--pairs all` runs (§1.2) **FAIL by design at 8 series** and are the recorded justification for rejecting the donut. Do not "fix" them by re-stepping — the skill forbids it; the fix was the form change.

### 4.4 Chart chrome tokens owned by F08

All from the skill's reference chrome table; every value below was contrast-checked with the validator's exported `contrast()`.

| Token | Light | Dark | Role / measured contrast |
|---|---|---|---|
| `--chart-surface` | `#fcfcfb` | `#1a1a19` | card surface (validator surface) |
| `--chart-series-1` | `#2a78d6` | `#3987e5` | completed month bar — 4.30 / 4.79 ✅ |
| `--chart-series-1-soft` | `#6da7ec` | `#256abf` | in-progress month bar — 2.44 / 3.23 (ordinal light-end floor is 2.0 ✅; backed by `•` tick + caption) |
| `--chart-grid` | `#e1e0d9` | `#2c2c2a` | gridline, hairline **solid** |
| `--chart-baseline` | `#c3c2b7` | `#383835` | the zero rule the bars stand on |
| `--chart-track` | `#e1e0d9` | `#2c2c2a` | unfilled track behind breakdown bars |
| `--chart-ink` | `#0b0b0b` | `#ffffff` | primary ink |
| `--chart-ink-2` | `#52514e` | `#c3c2b7` | secondary ink — 7.73 / 9.72 ✅ |
| `--chart-muted` | `#898781` | `#898781` | axis ticks, captions — 3.50 / 4.85 ✅ |
| `--delta-up` | `#d03b3b` | `#d03b3b` | status `critical` (spend rose) — 4.68 / 3.62 ✅ |
| `--delta-down` | `#006300` | `#0ca30c` | status `good` (spend fell) — 7.35 / 5.19 ✅ |

> **Text never wears the data colour.** All labels, values, axis ticks and legends use `--chart-ink` / `--chart-ink-2` / `--chart-muted`. Identity comes from the coloured swatch *beside* the text. `--delta-up`/`--delta-down` are the one exception and they are status tokens, always paired with an arrow glyph + an Indonesian word.

---

## 5. Implementation tasks

### Task 1 — Branch and directories

```bash
cd /home/miftah/expense-tracking
git checkout -b f08-stats
mkdir -p "app/(shell)/stats" lib/stats lib/stats/__tests__
```

Expected: `git status` shows the new branch, no tracked changes yet.

**Task 0 sanity check — verify F03/F07 shipped what this plan compiles against:**

```bash
grep -n "export function getMonthlyTotals\|export function fillZeroMonths\|export function getCategoryBreakdown\|export function getBiggestExpense" lib/db/queries.ts
grep -n "MONTH_NAMES_ID_SHORT\|export function currentMonthKey\|export function addMonths\|export function monthLabel\|export function isValidMonthKey" lib/format.ts
grep -n "CATEGORY_META" lib/categories.ts
ls "app/(shell)/layout.tsx"
```

Every line must hit. If `getMonthlyTotals` takes two arguments rather than three, or `CategoryMeta.color` has no leading `--`, stop and reconcile — see `## Interfaces I consume`.

---

### Task 2 — `lib/stats/format.ts` (only what F03 does not already give us)

**F03 shipped a much larger `lib/format.ts` than roadmap §4.7 sketched.** It already exports `formatIdr`,
`formatIdrCompact`, `parseIdrLoose`, `isValidMonthKey`, `addMonths`, `monthRange`, `currentMonthKey`,
`todayJakartaISO`, `monthLabel`, `monthLabelShort`, `MONTH_NAMES_ID` and `MONTH_NAMES_ID_SHORT`.
**F08 re-implements none of them.** This module is the short list of things `/stats` needs that genuinely
do not exist yet.

Create `lib/stats/format.ts`:

```ts
/**
 * F08 — the small set of formatters F03's lib/format.ts does not already provide.
 *
 * DO NOT add anything here that lib/format.ts already exports. Already provided
 * and deliberately NOT duplicated:
 *   formatIdr · formatIdrCompact · parseIdrLoose · isValidMonthKey · isValidDateISO
 *   addMonths · monthRange · currentMonthKey · monthKey · todayJakartaISO
 *   monthLabel · monthLabelShort · MONTH_NAMES_ID · MONTH_NAMES_ID_SHORT · DAY_NAMES_ID
 */
import { MONTH_NAMES_ID_SHORT, type MonthKey } from '@/lib/format'

function monthIndexOf(month: MonthKey): number {
  return Number(month.slice(5, 7)) - 1
}

function yearOf(month: MonthKey): number {
  return Number(month.slice(0, 4))
}

/**
 * Bare three-letter month for the x-axis: '2026-08' -> 'Agu'.
 *
 * F03's monthLabelShort returns 'Agu 26' and F07's formatMonthShortId returns
 * 'Agu 2026'. Both are ~34–48 px at 10 px type and will not fit twelve ticks
 * across a 314 px plot (26.2 px per band). The year is carried by the caption
 * under the chart, the readout, and the table view instead.
 */
export function monthTickLabel(month: MonthKey): string {
  return MONTH_NAMES_ID_SHORT[monthIndexOf(month)] ?? month
}

/** '2026-08' -> 'Agu 2026' — the full-year short form, for the readout and the table. */
export function monthMedium(month: MonthKey): string {
  return `${monthTickLabel(month)} ${yearOf(month)}`
}

/** Signed month distance. monthsBetween('2026-06', '2026-08') === 2 */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  return yearOf(b) * 12 + monthIndexOf(b) - (yearOf(a) * 12 + monthIndexOf(a))
}

/**
 * Compact rupiah for the y-axis, WITHOUT the 'Rp ' prefix.
 * F03's formatIdrCompact keeps the prefix; a 40 px axis gutter has no room for
 * it and the card title already establishes the unit.
 *   0 -> '0'  45_000 -> '45rb'  1_240_000 -> '1,2jt'  2_000_000_000 -> '2,0m'
 */
export function formatIdrAxis(n: number): string {
  const v = Math.round(n)
  if (v === 0) return '0'
  if (v < 1_000) return String(v)
  if (v < 1_000_000) return `${Math.round(v / 1_000)}rb`
  if (v < 1_000_000_000) return `${trim1(v / 1_000_000)}jt`
  return `${trim1(v / 1_000_000_000)}m`
}

function trim1(x: number): string {
  return x.toFixed(1).replace('.', ',')
}

/**
 * '2026-08-18' -> '18 Agu 2026'.
 * F07's formatFullDateId gives 'Selasa, 18 Agustus 2026' — too long for the
 * biggest-expense tile's meta line, which already carries the group title.
 */
export function formatDayShort(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10))
  return `${day} ${monthTickLabel(isoDate.slice(0, 7))} ${isoDate.slice(0, 4)}`
}

/** '1–19 Jul 2026' — the honest month-to-date comparison window, spelled out. */
export function formatMtdRange(month: MonthKey, throughDay: number): string {
  return `1–${throughDay} ${monthTickLabel(month)} ${yearOf(month)}`
}
```

**Checkpoint**

```bash
npx tsc --noEmit
git add lib/stats/format.ts
git commit -m "F08: the formatters lib/format.ts does not already provide"
```

---

### Task 3 — `lib/stats/series.ts` (densify guard, delta, percentages)

This is where the "gaps must be explicit zeros" rule and the divide-by-zero / partial-month rules live. All of it is pure and unit-testable.

> **F03 already zero-fills.** `getMonthlyTotals` returns `months` rows, oldest → newest, gaps filled, and it
> exports the pure `fillZeroMonths` for reuse. F08's `buildMonthSeries` therefore is **not** the densifier —
> it *decorates* the dense series with the presentation fields the chart needs (`label`, `isPartial`) and
> re-runs `fillZeroMonths` as an idempotent guard, so a future change on either side cannot silently
> reintroduce a closed gap.

Create `lib/stats/series.ts`:

```ts
import type { Category } from '@/lib/categories'
import { fillZeroMonths, type MonthlyTotal } from '@/lib/db/queries'
import { type MonthKey } from '@/lib/format'
import { monthTickLabel, monthsBetween } from './format'

/* ────────────────────────────────────────────────────────────────────────── *
 * Boundary types — everything here is JSON-serialisable and crosses the
 * server→client boundary as-is. No Date, no bigint, no functions.
 * ────────────────────────────────────────────────────────────────────────── */

export type MonthPoint = {
  month: MonthKey     // 'YYYY-MM'
  label: string       // 'Agu' — pre-formatted server-side
  totalIdr: number    // whole rupiah; ALWAYS a number, 0 for months with no spend
  isPartial: boolean  // true only for the in-progress current month
}

export type BreakdownRow = {
  category: Category
  label: string       // 'Makan & Jajan'
  emoji: string       // '🍜'
  colorVar: string    // '--color-cat-food'  (F03's CategoryMeta.color, per §4.1)
  amountIdr: number
  pct: number         // integer 0..100, largest-remainder rounded so the column sums to 100
}

export type DeltaBasis =
  | { mode: 'full'; previousMonth: MonthKey }
  | { mode: 'mtd'; previousMonth: MonthKey; throughDay: number }

export type Delta =
  /** Nothing spent in either period — no comparison exists. */
  | { kind: 'none'; basis: DeltaBasis }
  /** Previous period was Rp 0 and this one is not. A percentage would be ÷0 = ∞. */
  | { kind: 'first'; currentIdr: number; basis: DeltaBasis }
  /** A real, finite comparison. */
  | {
      kind: 'pct'
      pct: number                         // signed, rounded; -100 when spend went to zero
      direction: 'up' | 'down' | 'flat'
      currentIdr: number
      previousIdr: number
      basis: DeltaBasis
    }

/* ────────────────────────────────────────────────────────────────────────── *
 * bigint safety
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * `amount_idr` is `bigint` (§4.2) and Postgres `SUM(bigint)` returns `numeric`,
 * which the Neon/pg driver hands back as a STRING unless it is mapped. F03's
 * aggregate queries do map theirs (`.mapWith(Number)` on getMonthlyTotals and
 * getCategoryBreakdown), but `getBiggestExpense.amountIdr` reads the raw bigint
 * column, whose JS type depends on the Drizzle `bigint` mode F03 chose.
 * Silently doing `a + b` across that boundary produces string concatenation
 * ("100" + "200" === "100200") — a real, ugly, plausible bug. So every total
 * entering this module goes through here and the ambiguity stops at the door.
 *
 * Safe by range: a single item caps at 1e9 (§4.3), so even a decade of maximal
 * spending stays ~6 orders of magnitude below Number.MAX_SAFE_INTEGER.
 */
export function toIdr(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 1. Densify — the "gaps must be explicit zeros" rule
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Decorate F03's dense monthly totals into chart points.
 *
 * WHY THE ZERO-FILL MATTERS AT ALL: a SQL `GROUP BY month` only emits months
 * that have rows. If April had zero spend, April is simply absent, and a chart
 * plotted from the raw rows silently closes the gap — March sits next to May
 * and the trend reads as smooth when the truth is "you spent nothing for a
 * month". That is the chart lying.
 *
 * F03's getMonthlyTotals already applies fillZeroMonths, so `rows` should
 * arrive dense. We re-run it here anyway: it is pure, O(n) over twelve items,
 * idempotent, and it means a future change to either side cannot quietly
 * reintroduce a closed gap. Belt and braces on the one invariant that would
 * make this chart dishonest.
 *
 * The two fields added here are presentation-only and are computed on the
 * SERVER so no locale data or date maths ships to the client.
 */
export function buildMonthSeries(
  rows: ReadonlyArray<{ month: string; totalIdr: unknown }>,
  endMonth: MonthKey,
  length: number,
  currentMonth: MonthKey,
): MonthPoint[] {
  const dense: MonthlyTotal[] = fillZeroMonths(
    rows.map((r) => ({ month: r.month, totalIdr: toIdr(r.totalIdr) })),
    endMonth,
    length,
  )

  return dense.map((r) => ({
    month: r.month,
    label: monthTickLabel(r.month),
    totalIdr: toIdr(r.totalIdr),        // 0 for months with no spend — never absent
    isPartial: r.month === currentMonth,
  }))
}

/**
 * How many columns the chart should show.
 *  - Never fewer than 3 (a 1- or 2-column "chart" reads as broken).
 *  - Never more than 12 (the roadmap's window, and the width budget).
 *  - Otherwise: exactly the span from the user's first-ever active month to now,
 *    so a 4-month-old account gets 4 columns, not 8 empty ones plus 4.
 */
export function chartWindowLength(firstActiveMonth: MonthKey | null, currentMonth: MonthKey): number {
  if (!firstActiveMonth) return 3
  const span = monthsBetween(firstActiveMonth, currentMonth) + 1
  return Math.min(12, Math.max(3, span))
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 2. Month-over-month delta — divide-by-zero and the partial month
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * `currentIdr` and `previousIdr` MUST already be measured over comparable
 * windows. The caller does that:
 *   - selected month is in the past  -> both are FULL month totals   (basis 'full')
 *   - selected month is in progress  -> both are 1..today            (basis 'mtd')
 *
 * Comparing a half-finished month against a complete one is the single most
 * common way a spending app misleads its user, so the basis is a required
 * argument and is always rendered next to the number.
 */
export function computeDelta(
  currentIdr: number,
  previousIdr: number,
  basis: DeltaBasis,
): Delta {
  if (previousIdr <= 0 && currentIdr <= 0) return { kind: 'none', basis }

  // Divide-by-zero: last period was Rp 0. The percentage is +∞, which is not a
  // number a human can act on. Say what actually happened instead.
  if (previousIdr <= 0) return { kind: 'first', currentIdr, basis }

  const raw = ((currentIdr - previousIdr) / previousIdr) * 100
  // 1 dp under 10%, 0 dp above — 0.4% precision on a Rp 2 jt number is noise.
  const pct = Math.abs(raw) < 10 ? Math.round(raw * 10) / 10 : Math.round(raw)
  const direction: 'up' | 'down' | 'flat' =
    Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down'

  return { kind: 'pct', pct, direction, currentIdr, previousIdr, basis }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 3. Percentages that sum to 100
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Largest-remainder (Hamilton) apportionment. Naive per-row rounding makes a
 * column of eight percentages add up to 99 or 101, which readers notice and
 * distrust. This always sums to exactly 100 when there is any spend at all.
 */
export function largestRemainderPct(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)

  const exact = values.map((v) => (v / total) * 100)
  const out = exact.map((v) => Math.floor(v))
  let remaining = 100 - out.reduce((a, b) => a + b, 0)

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
    out[order[k].i] += 1
  }
  return out
}
```

**Checkpoint**

```bash
npx tsc --noEmit
git add lib/stats/series.ts
git commit -m "F08: month-series decoration, MoM delta, largest-remainder percentages"
```

---

### Task 4 — Unit tests for the maths

Create `lib/stats/__tests__/series.test.ts`.

```ts
// Written for vitest. If F01 chose `node --test`, swap this import and the
// expect() forms for node:assert — the module under test is framework-free.
import { describe, it, expect } from 'vitest'
import {
  buildMonthSeries,
  chartWindowLength,
  computeDelta,
  largestRemainderPct,
  toIdr,
} from '../series'

describe('toIdr', () => {
  it('survives the numeric-as-string driver behaviour', () => {
    expect(toIdr('266350')).toBe(266350)
    expect(toIdr(266350)).toBe(266350)
    expect(toIdr(266350n)).toBe(266350)
    expect(toIdr(null)).toBe(0)
    expect(toIdr(undefined)).toBe(0)
  })
})

describe('buildMonthSeries', () => {
  // Guards the invariant end-to-end: sparse in, dense out. F03 normally hands
  // us dense rows already, so this also proves the decoration is idempotent.
  it('inserts an explicit zero for a month with no rows', () => {
    const s = buildMonthSeries(
      [{ month: '2026-06', totalIdr: '100000' }, { month: '2026-08', totalIdr: 300000 }],
      '2026-08',
      3,
      '2026-08',
    )
    expect(s.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(s.map((p) => p.totalIdr)).toEqual([100000, 0, 300000])
  })

  it('crosses a year boundary correctly', () => {
    const s = buildMonthSeries([], '2026-01', 3, '2026-01')
    expect(s.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(s.map((p) => p.label)).toEqual(['Nov', 'Des', 'Jan'])
  })

  it('flags only the current month as partial', () => {
    const s = buildMonthSeries([], '2026-08', 3, '2026-08')
    expect(s.map((p) => p.isPartial)).toEqual([false, false, true])
  })
})

describe('chartWindowLength', () => {
  it('floors at 3 and caps at 12', () => {
    expect(chartWindowLength(null, '2026-08')).toBe(3)
    expect(chartWindowLength('2026-08', '2026-08')).toBe(3)   // 1 month of span -> 3
    expect(chartWindowLength('2026-06', '2026-08')).toBe(3)   // 3 months of span -> 3
    expect(chartWindowLength('2026-03', '2026-08')).toBe(6)
    expect(chartWindowLength('2020-01', '2026-08')).toBe(12)
  })
})

describe('computeDelta', () => {
  const full = { mode: 'full', previousMonth: '2026-07' } as const

  it('does not divide by zero when last month was empty', () => {
    expect(computeDelta(500000, 0, full).kind).toBe('first')
  })

  it('reports nothing when both periods are empty', () => {
    expect(computeDelta(0, 0, full).kind).toBe('none')
  })

  it('reports -100% when spend went to zero', () => {
    expect(computeDelta(0, 400000, full)).toMatchObject({ kind: 'pct', pct: -100, direction: 'down' })
  })

  it('rounds to 1dp under 10% and 0dp above', () => {
    expect(computeDelta(1_012_000, 1_000_000, full)).toMatchObject({ pct: 1.2, direction: 'up' })
    expect(computeDelta(1_250_000, 1_000_000, full)).toMatchObject({ pct: 25, direction: 'up' })
  })

  it('calls a sub-0.5% move flat', () => {
    expect(computeDelta(1_002_000, 1_000_000, full)).toMatchObject({ direction: 'flat' })
  })
})

describe('largestRemainderPct', () => {
  it('always sums to exactly 100', () => {
    for (const set of [[1, 1, 1], [333, 333, 334], [862000, 431500, 200, 1, 1, 1, 1, 1]]) {
      expect(largestRemainderPct(set).reduce((a, b) => a + b, 0)).toBe(100)
    }
  })
  it('returns all zeros for an empty month', () => {
    expect(largestRemainderPct([0, 0])).toEqual([0, 0])
  })
})
```

```bash
npx vitest run lib/stats            # expected: 13 passed
npx tsc --noEmit
git add lib/stats/__tests__
git commit -m "F08: unit tests for densification, delta and percentage apportionment"
```

---
### Task 5 — `app/(shell)/stats/stats.css` (tokens + all chart chrome)

Create `app/(shell)/stats/stats.css`. Imported once from `app/(shell)/stats/page.tsx`.

```css
/* ==========================================================================
   F08 — /stats chart chrome.
   Category hues (--color-cat-*) are F10's, named by F03's CategoryMeta.color
   (per roadmap §4.1). Everything here is F08-owned chart furniture. Every
   value validated with the dataviz skill's validate_palette.js against
   surfaces #fcfcfb (light) / #1a1a19 (dark).
   ========================================================================== */

.stats-root {
  color-scheme: light;

  --chart-surface:        #fcfcfb;
  --chart-series-1:       #2a78d6;   /* 4.30:1 */
  --chart-series-1-soft:  #6da7ec;   /* 2.44:1 — ordinal light-end floor is 2.0 */
  --chart-grid:           #e1e0d9;
  --chart-baseline:       #c3c2b7;
  --chart-track:          #e1e0d9;
  --chart-ink:            #0b0b0b;
  --chart-ink-2:          #52514e;   /* 7.73:1 */
  --chart-muted:          #898781;   /* 3.50:1 */
  --delta-up:             #d03b3b;   /* status critical, 4.68:1 */
  --delta-down:           #006300;   /* status good,     7.35:1 */
  --chart-hairline:       rgba(11, 11, 11, 0.10);
}

/* The OS setting. :where() keeps this below the explicit-theme scope below. */
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) .stats-root {
    color-scheme: dark;
    --chart-surface:       #1a1a19;
    --chart-series-1:      #3987e5;  /* 4.79:1 */
    --chart-series-1-soft: #256abf;  /* 3.23:1 */
    --chart-grid:          #2c2c2a;
    --chart-baseline:      #383835;
    --chart-track:         #2c2c2a;
    --chart-ink:           #ffffff;
    --chart-ink-2:         #c3c2b7;  /* 9.72:1 */
    --chart-muted:         #898781;  /* 4.85:1 */
    --delta-up:            #d03b3b;  /* 3.62:1 */
    --delta-down:          #0ca30c;  /* 5.19:1 */
    --chart-hairline:      rgba(255, 255, 255, 0.10);
  }
}

/* If F10 ever ships an explicit toggle, it must win in BOTH directions. */
:root[data-theme='dark'] .stats-root {
  color-scheme: dark;
  --chart-surface:       #1a1a19;
  --chart-series-1:      #3987e5;
  --chart-series-1-soft: #256abf;
  --chart-grid:          #2c2c2a;
  --chart-baseline:      #383835;
  --chart-track:         #2c2c2a;
  --chart-ink:           #ffffff;
  --chart-ink-2:         #c3c2b7;
  --chart-muted:         #898781;
  --delta-up:            #d03b3b;
  --delta-down:          #0ca30c;
  --chart-hairline:      rgba(255, 255, 255, 0.10);
}

/* ── page shell ─────────────────────────────────────────────────────────── */

/* NOTE: app/(shell)/layout.tsx already applies
   pb-[calc(4.5rem+env(safe-area-inset-bottom))] for the tab bar and the home
   indicator. Repeating it here would double the gap, so this only owns the
   page's own gutters. */
.stats-root {
  padding: 12px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-card {
  background: var(--chart-surface);
  border: 1px solid var(--chart-hairline);
  border-radius: 16px;
  padding: 14px;
}

.stats-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--chart-ink-2);
  margin: 0 0 10px;
}

/* ── hero + month switcher ──────────────────────────────────────────────── */

.stats-hero__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stats-hero__month {
  font-size: 15px;
  font-weight: 600;
  color: var(--chart-ink);
}

/* Proportional figures, never tabular — tabular-nums makes a big number look
   loose (dataviz: marks-and-anatomy). */
.stats-hero__value {
  font-size: 44px;
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--chart-ink);
  margin: 6px 0 0;
  font-variant-numeric: proportional-nums;
}

.stats-nav { display: flex; gap: 4px; }

.stats-nav__btn {
  display: grid;
  place-items: center;
  width: 44px;                 /* iOS minimum tap target */
  height: 44px;
  border-radius: 12px;
  color: var(--chart-ink-2);
  -webkit-tap-highlight-color: transparent;
}

.stats-nav__btn[aria-disabled='true'] {
  color: var(--chart-muted);
  opacity: 0.4;
  pointer-events: none;
}

/* ── delta tile ─────────────────────────────────────────────────────────── */

.stats-delta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin-top: 8px;
  font-size: 14px;
}

.stats-delta__value { font-weight: 600; }
.stats-delta--up    .stats-delta__value { color: var(--delta-up); }
.stats-delta--down  .stats-delta__value { color: var(--delta-down); }
.stats-delta--flat  .stats-delta__value,
.stats-delta--none  .stats-delta__value,
.stats-delta--first .stats-delta__value { color: var(--chart-ink-2); }

.stats-delta__basis {
  color: var(--chart-muted);
  font-size: 12px;
  flex-basis: 100%;
}

/* ── monthly chart ──────────────────────────────────────────────────────── */

.stats-chart__readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-height: 20px;                 /* reserved — never reflows on selection */
  font-size: 13px;
  color: var(--chart-ink-2);
  margin-bottom: 6px;
}

.stats-chart__readout strong { color: var(--chart-ink); font-weight: 600; }
.stats-chart__readout a      { color: var(--chart-ink-2); text-decoration: underline; }

.stats-chart__frame {
  min-height: 196px;                /* == ResponsiveContainer height: zero CLS */
  transition: opacity 120ms ease-out;
}

/* dataviz interaction.md: "refetch keeps the frame" — hold the previous render
   at reduced opacity. No skeleton flash, no layout jump. */
.stats-chart__frame[data-pending='true'] { opacity: 0.55; }

.stats-chart__skeleton {
  min-height: 196px;
  border-radius: 8px;
  background: var(--chart-track);
  opacity: 0.35;
}

/* --- The token bridge -----------------------------------------------------
   Recharts writes fill as an SVG PRESENTATION ATTRIBUTE. var() does not
   resolve inside a presentation attribute in Safari — but a CSS declaration
   outranks a presentation attribute in the cascade, so these rules win and the
   chart becomes theme-reactive with zero JS. This is why <Cell> gets a
   className and never a hex `fill` prop.                                    */

.stats-bar--complete { fill: var(--chart-series-1); }
.stats-bar--partial  { fill: var(--chart-series-1-soft); }

.stats-grid line {
  stroke: var(--chart-grid);
  stroke-dasharray: none;           /* dataviz: gridlines are SOLID hairlines */
  stroke-width: 1;
}

.stats-axis .recharts-cartesian-axis-line { stroke: var(--chart-baseline); stroke-width: 1; }
.stats-axis .recharts-cartesian-axis-tick-value { fill: var(--chart-muted); }

.stats-tick        { fill: var(--chart-muted); font-size: 10px; }
.stats-tick--sel   { fill: var(--chart-ink); font-weight: 600; }
.stats-tick__rule  { stroke: var(--chart-series-1); stroke-width: 2; stroke-linecap: round; }
.stats-caplabel    { fill: var(--chart-ink); font-size: 11px; font-weight: 600; }

.stats-chart__caption {
  margin-top: 6px;
  font-size: 11px;
  color: var(--chart-muted);
}

/* ── the table view (every chart's accessible twin) ─────────────────────── */

.stats-table > summary {
  font-size: 12px;
  color: var(--chart-ink-2);
  padding: 10px 2px;                /* keeps the disclosure a comfortable target */
  cursor: pointer;
  list-style: none;
}
.stats-table > summary::-webkit-details-marker { display: none; }
.stats-table > summary::before { content: '▸ '; }
.stats-table[open] > summary::before { content: '▾ '; }

.stats-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;   /* columns DO align — tabular is right here */
}
.stats-table th,
.stats-table td { padding: 7px 0; text-align: left; color: var(--chart-ink-2); font-weight: 400; }
.stats-table td:last-child,
.stats-table th:last-child { text-align: right; }
.stats-table tbody tr { border-top: 1px solid var(--chart-grid); }
.stats-table a { color: var(--chart-ink); text-decoration: underline; }

/* ── category breakdown (pure CSS bars — no Recharts) ───────────────────── */

.stats-cat        { display: flex; flex-direction: column; gap: 14px; }
.stats-cat__row   { display: flex; flex-direction: column; gap: 6px; }

.stats-cat__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  color: var(--chart-ink);
}
.stats-cat__emoji  { font-size: 15px; line-height: 1; }
.stats-cat__label  { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats-cat__amount { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stats-cat__pct    { color: var(--chart-muted); font-size: 12px; min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; }

.stats-cat__track {
  height: 8px;                       /* thin mark — dataviz caps bars at 24px */
  border-radius: 4px;
  background: var(--chart-track);
  overflow: visible;                 /* never clip; nothing is drawn outside */
}

/* Square at the baseline (left), 4px rounded data-end (right). */
.stats-cat__fill {
  height: 100%;
  min-width: 3px;                    /* a 0.4% category must not vanish entirely */
  border-radius: 0 4px 4px 0;
  background: var(--chart-muted);    /* overridden inline with var(--color-cat-<id>) */
}

/* ── biggest-expense callout ────────────────────────────────────────────── */

.stats-big {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  -webkit-tap-highlight-color: transparent;
}
.stats-big__body   { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.stats-big__name   { font-size: 15px; color: var(--chart-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats-big__meta   { font-size: 12px; color: var(--chart-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats-big__amount { font-size: 22px; font-weight: 600; color: var(--chart-ink); white-space: nowrap; }
.stats-big__chev   { color: var(--chart-muted); }

/* ── empty / thin states ────────────────────────────────────────────────── */

.stats-empty        { text-align: center; padding: 28px 12px; }
.stats-empty__title { font-size: 15px; font-weight: 600; color: var(--chart-ink); }
.stats-empty__body  { font-size: 13px; color: var(--chart-muted); margin-top: 6px; }
.stats-empty__cta   { display: inline-block; margin-top: 14px; font-size: 15px; color: var(--chart-series-1); font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .stats-chart__frame { transition: none; }
}
```

```bash
git add "app/(shell)/stats/stats.css"
git commit -m "F08: validated chart tokens and chart chrome CSS for /stats"
```

---

### Task 6 — `app/(shell)/stats/MonthlyChartInner.tsx` (the only Recharts file)

```tsx
'use client'

/**
 * F08 — the 12-month column chart. THE ONLY FILE IN THE APP THAT IMPORTS RECHARTS.
 * Loaded exclusively through next/dynamic({ ssr: false }) from MonthlyChart.tsx.
 *
 * Named imports only: recharts@3 is ESM with sideEffects:false, so Pie, Radar,
 * Sankey, Treemap, Scatter and Funnel tree-shake out of the route chunk.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatIdrAxis } from '@/lib/stats/format'
import type { MonthPoint } from '@/lib/stats/series'

type Props = {
  series: MonthPoint[]
  selectedMonth: string
  onPick: (month: string) => void
}

export default function MonthlyChartInner({ series, selectedMonth, onPick }: Props) {
  const selectedIndex = series.findIndex((p) => p.month === selectedMonth)

  /**
   * The band, not the bar, is the hit target.
   *
   * A 14px bar is far under the ~24px minimum the dataviz interaction rules
   * demand, and on a phone a 14px column is a genuine mis-tap generator.
   * BarChart's own onClick reports the ACTIVE CATEGORY for wherever inside the
   * plot area the pointer landed, which turns each 26px-wide × full-height band
   * into the target — roughly 26 × 196 px per month. No overlay bars needed.
   */
  const handleClick = (state: unknown) => {
    const s = state as
      | { activeLabel?: string; activePayload?: Array<{ payload?: MonthPoint }> }
      | undefined
    const month = s?.activeLabel ?? s?.activePayload?.[0]?.payload?.month
    if (typeof month === 'string' && month.length === 7) onPick(month)
  }

  return (
    <ResponsiveContainer width="100%" height={196}>
      <BarChart
        data={series}
        margin={{ top: 20, right: 2, bottom: 0, left: 0 }}
        onClick={handleClick}
        /* recharts@3 keyboard layer: arrow keys walk the bands, Enter activates.
           Gives the chart a non-pointer path to the same information. */
        accessibilityLayer
      >
        <CartesianGrid vertical={false} className="stats-grid" />

        <YAxis
          width={40}
          tickCount={3}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatIdrAxis}
          tick={{ fontSize: 10 }}
          className="stats-axis"
        />

        <XAxis
          dataKey="month"
          interval={0}
          tickLine={false}
          height={26}
          className="stats-axis"
          tick={(props) => <MonthTick {...props} series={series} selectedIndex={selectedIndex} />}
        />

        {/*
          Present ONLY to keep Recharts' active-index machinery running so
          onClick can report activeLabel. It renders nothing: on a touch device
          a hover tooltip is unreachable, and per the dataviz rules a tooltip
          may never be the only way to read a value. The persistent readout
          above the chart and the <details> table below it carry every number.
        */}
        <Tooltip content={() => null} cursor={false} isAnimationActive={false} />

        <Bar
          dataKey="totalIdr"
          barSize={14}
          radius={[4, 4, 0, 0]}   /* 4px rounded data-end, square at the baseline */
          minPointSize={0}        /* a zero month is drawn as zero. No sympathy sliver. */
          isAnimationActive={false}
        >
          {series.map((p) => (
            <Cell
              key={p.month}
              className={p.isPartial ? 'stats-bar--partial' : 'stats-bar--complete'}
            />
          ))}
          {/* Direct-label the SELECTED bar only. dataviz: never a number on
              every point — label the one the story is about. */}
          <LabelList
            dataKey="totalIdr"
            content={(props) => <SelectedCap {...(props as CapProps)} selectedIndex={selectedIndex} />}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── custom x tick: emphasis without inventing a hue ─────────────────────── */

type TickProps = {
  x?: number
  y?: number
  payload?: { value?: string }
  series: MonthPoint[]
  selectedIndex: number
}

function MonthTick({ x = 0, y = 0, payload, series, selectedIndex }: TickProps) {
  const idx = series.findIndex((p) => p.month === payload?.value)
  const point = series[idx]
  if (!point) return null

  const isSelected = idx === selectedIndex

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={12}
        textAnchor="middle"
        className={isSelected ? 'stats-tick stats-tick--sel' : 'stats-tick'}
      >
        {point.label}
        {point.isPartial ? ' •' : ''}
      </text>
      {isSelected ? <line x1={-9} x2={9} y1={17} y2={17} className="stats-tick__rule" /> : null}
    </g>
  )
}

/* ── selected-bar cap label ──────────────────────────────────────────────── */

type CapProps = {
  x?: number
  y?: number
  width?: number
  value?: number
  index?: number
  selectedIndex: number
}

function SelectedCap({ x = 0, y = 0, width = 0, value = 0, index, selectedIndex }: CapProps) {
  if (index !== selectedIndex || !value) return null
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" className="stats-caplabel">
      {formatIdrAxis(value)}
    </text>
  )
}
```

```bash
npx tsc --noEmit
git add "app/(shell)/stats/MonthlyChartInner.tsx"
git commit -m "F08: recharts 12-month column chart, token-driven fills, band-sized hit targets"
```

---

### Task 7 — `app/(shell)/stats/MonthlyChart.tsx` (client wrapper: dynamic import, selection, table view)

```tsx
'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { formatIdr } from '@/lib/format'
import { monthMedium } from '@/lib/stats/format'
import type { MonthPoint } from '@/lib/stats/series'

/**
 * ssr:false is illegal inside a Server Component in Next 16 / React 19, so the
 * dynamic() call lives here, in a file that already carries 'use client'.
 * Effect: recharts + its d3 dependencies (~100 KB gz) land in a lazy chunk
 * fetched only when /stats mounts — never in the shared app chunk, never in
 * the RSC payload, never downloaded by a user who only ever opens /m/[month].
 */
const MonthlyChartInner = dynamic(() => import('./MonthlyChartInner'), {
  ssr: false,
  // Same min-height as the chart => the lazy chunk arriving causes zero CLS.
  loading: () => <div className="stats-chart__skeleton" aria-hidden="true" />,
})

type Props = {
  series: MonthPoint[]
  selectedMonth: string
}

export default function MonthlyChart({ series, selectedMonth }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Optimistic selection: the readout and the cap label move on the very first
  // frame after the tap, while the server re-renders the cards below.
  const [picked, setPicked] = useState(selectedMonth)
  useEffect(() => setPicked(selectedMonth), [selectedMonth])

  const point = series.find((p) => p.month === picked) ?? series[series.length - 1]

  /**
   * TWO-STAGE TAP (D-E). There is no hover on a phone, so a single gesture has
   * to do the work hover normally does.
   *   tap 1 on a month  -> select it: show its value, and re-scope the cards
   *                        below via ?m=  (router.replace, no history spam)
   *   tap 2 on the same -> navigate to /m/[month]
   * The second stage is also reachable in one tap from the readout link, so no
   * one is forced to discover the gesture.
   */
  const onPick = (month: string) => {
    if (month === picked) {
      router.push(`/m/${month}`)
      return
    }
    setPicked(month)
    startTransition(() => {
      router.replace(`/stats?m=${month}`, { scroll: false })
    })
  }

  const hasPartial = series.some((p) => p.isPartial)

  return (
    <section className="stats-card" aria-labelledby="stats-chart-title">
      <h2 className="stats-card__title" id="stats-chart-title">
        {series.length} bulan terakhir
      </h2>

      {/* The persistent readout replaces the hover tooltip. Value leads, label
          follows — the reader already knows which month they tapped. */}
      <p className="stats-chart__readout" aria-live="polite">
        <span>{monthMedium(point.month)}</span>
        <span aria-hidden="true">·</span>
        <strong>{formatIdr(point.totalIdr)}</strong>
        <span aria-hidden="true">·</span>
        <Link href={`/m/${point.month}`} prefetch={false}>
          Lihat bulan →
        </Link>
      </p>

      <div className="stats-chart__frame" data-pending={pending ? 'true' : 'false'}>
        <MonthlyChartInner series={series} selectedMonth={picked} onPick={onPick} />
      </div>

      {hasPartial ? (
        <p className="stats-chart__caption">• Bulan berjalan — belum penuh sebulan.</p>
      ) : null}

      {/* The table view. dataviz: every chart has a WCAG-clean twin, and no
          value may be reachable only through an interaction. */}
      <details className="stats-table">
        <summary>Lihat angka</summary>
        <table>
          <caption className="sr-only">Total pengeluaran per bulan</caption>
          <thead>
            <tr>
              <th scope="col">Bulan</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.month}>
                <th scope="row">
                  <Link href={`/m/${p.month}`} prefetch={false}>
                    {monthMedium(p.month)}
                  </Link>
                  {p.isPartial ? ' (berjalan)' : ''}
                </th>
                <td>{formatIdr(p.totalIdr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
```

```bash
npx tsc --noEmit
git add "app/(shell)/stats/MonthlyChart.tsx"
git commit -m "F08: chart wrapper — lazy recharts, two-stage tap selection, table view twin"
```

---
### Task 8 — `DeltaTile.tsx` + `MonthSwitcher.tsx` (server, zero JS)

`app/(shell)/stats/DeltaTile.tsx`:

```tsx
import { formatIdr, monthLabel } from '@/lib/format'   // monthLabel: '2026-07' -> 'Juli 2026'
import { formatMtdRange, monthTickLabel } from '@/lib/stats/format'
import type { Delta } from '@/lib/stats/series'

/**
 * A stat tile, not a chart — one number and a direction (dataviz: "Is it even
 * a chart?"). Colour is a STATUS token (spending up = bad), and status colour
 * is never allowed to travel alone, so every state ships an arrow glyph AND an
 * Indonesian word AND the comparison basis in words.
 */
export default function DeltaTile({ delta }: { delta: Delta }) {
  const basisLabel =
    delta.basis.mode === 'mtd'
      ? `vs ${formatMtdRange(delta.basis.previousMonth, delta.basis.throughDay)} (periode sama)`
      : `vs ${monthLabel(delta.basis.previousMonth)} penuh`

  if (delta.kind === 'none') {
    return (
      <p className="stats-delta stats-delta--none">
        <span className="stats-delta__value">Belum ada pengeluaran</span>
        <span className="stats-delta__basis">{basisLabel}</span>
      </p>
    )
  }

  if (delta.kind === 'first') {
    // previousIdr was 0 — a percentage here would be a division by zero.
    // Say the true thing instead of printing "+∞%" or a fake "+100%".
    return (
      <p className="stats-delta stats-delta--first">
        <span className="stats-delta__value">Bulan pertama dengan pengeluaran</span>
        <span className="stats-delta__basis">
          {monthTickLabel(delta.basis.previousMonth)} kosong — tidak ada pembanding
        </span>
      </p>
    )
  }

  const glyph = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'
  const word = delta.direction === 'up' ? 'Naik' : delta.direction === 'down' ? 'Turun' : 'Setara'
  const magnitude =
    delta.direction === 'flat'
      ? 'dengan'
      : `${Math.abs(delta.pct).toLocaleString('id-ID')}% dari`

  return (
    <p className={`stats-delta stats-delta--${delta.direction}`}>
      <span className="stats-delta__value">
        <span aria-hidden="true">{glyph} </span>
        {word} {magnitude} {formatIdr(delta.previousIdr)}
      </span>
      <span className="stats-delta__basis">{basisLabel}</span>
    </p>
  )
}
```

`app/(shell)/stats/MonthSwitcher.tsx`:

```tsx
import Link from 'next/link'
import { addMonths, monthLabel } from '@/lib/format'   // both already exist in F03's lib/format.ts

/**
 * The month selector, mechanism = QUERY PARAM (?m=YYYY-MM).
 *
 * Why not /stats/[month]: roadmap §4.6 pins /stats as a single route and F07's
 * AppTabBar links to a bare /stats. A month here is a VIEW FILTER over one
 * page, not a resource — the resource route for a month is F07's /m/[month],
 * and duplicating that surface under /stats would give two canonical URLs for
 * the same month. The chevrons below mirror F07's MonthHeader chevrons, so the
 * gesture is identical on both screens.
 */
export default function MonthSwitcher({
  selectedMonth,
  currentMonth,
  earliestMonth,
}: {
  selectedMonth: string
  currentMonth: string
  earliestMonth: string
}) {
  const prev = addMonths(selectedMonth, -1)
  const next = addMonths(selectedMonth, 1)
  const prevDisabled = prev < earliestMonth
  const nextDisabled = next > currentMonth

  return (
    <div className="stats-hero__row">
      <span className="stats-hero__month">{monthLabel(selectedMonth)}</span>
      <nav className="stats-nav" aria-label="Ganti bulan">
        <Link
          href={`/stats?m=${prev}`}
          scroll={false}
          prefetch={false}
          className="stats-nav__btn"
          aria-label={`Bulan sebelumnya, ${monthLabel(prev)}`}
          aria-disabled={prevDisabled || undefined}
          tabIndex={prevDisabled ? -1 : undefined}
        >
          <Chevron dir="left" />
        </Link>
        <Link
          href={`/stats?m=${next}`}
          scroll={false}
          prefetch={false}
          className="stats-nav__btn"
          aria-label={`Bulan berikutnya, ${monthLabel(next)}`}
          aria-disabled={nextDisabled || undefined}
          tabIndex={nextDisabled ? -1 : undefined}
        >
          <Chevron dir="right" />
        </Link>
      </nav>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

```bash
npx tsc --noEmit
git add "app/(shell)/stats/DeltaTile.tsx" "app/(shell)/stats/MonthSwitcher.tsx"
git commit -m "F08: MoM delta stat tile (status tokens + words) and ?m= month switcher"
```

---

### Task 9 — `CategoryBreakdown.tsx` + `BiggestExpenseTile.tsx` (server, zero JS)

`app/(shell)/stats/CategoryBreakdown.tsx`:

```tsx
import { formatIdr } from '@/lib/format'
import type { BreakdownRow } from '@/lib/stats/series'

/**
 * HORIZONTAL BAR LIST — deliberately not a donut. See §1.2 of the plan:
 * the 8-category palette FAILS the dataviz all-pairs CVD gate (ΔE 1.6 deutan
 * in dark, normal-vision floor 7.1 vs a required 15), so colour cannot be the
 * identity channel for eight classes. Here every row states its own identity
 * in text — emoji + Indonesian label + rupiah + percent — and colour is a
 * redundant recognition cue that matches the category chip elsewhere in the app.
 * That also discharges the light-mode sub-3:1 contrast WARN on aqua / yellow /
 * magenta: the relief rule asks for visible labels or a table view; this list
 * is both.
 *
 * No Recharts here at all — plain flex divs. That keeps ~100 KB out of the
 * bundle, makes the whole card zero-JS server HTML, and lets the fills read
 * F10's --color-cat-* tokens directly so a light/dark flip repaints with no
 * re-render.
 */
export default function CategoryBreakdown({
  rows,
  totalIdr,
}: {
  rows: BreakdownRow[]
  totalIdr: number
}) {
  if (rows.length === 0) {
    return (
      <section className="stats-card">
        <h2 className="stats-card__title">Rincian kategori</h2>
        <p className="stats-empty__body">Belum ada pengeluaran di bulan ini.</p>
      </section>
    )
  }

  return (
    <section className="stats-card" aria-labelledby="stats-cat-title">
      <h2 className="stats-card__title" id="stats-cat-title">
        Rincian kategori
      </h2>

      <div className="stats-cat">
        {rows.map((r) => (
          <div className="stats-cat__row" key={r.category}>
            <div className="stats-cat__head">
              <span className="stats-cat__emoji" aria-hidden="true">
                {r.emoji}
              </span>
              <span className="stats-cat__label">{r.label}</span>
              <span className="stats-cat__amount">{formatIdr(r.amountIdr)}</span>
              <span className="stats-cat__pct">{r.pct}%</span>
            </div>

            {/*
              Width is share of TOTAL, not share of the max, so the row lengths
              genuinely read as part-to-whole while still sharing one aligned
              baseline for comparison. Colour comes from the F10 token by NAME —
              no hex is ever written into this component.
            */}
            <div
              className="stats-cat__track"
              role="img"
              aria-label={`${r.label}: ${formatIdr(r.amountIdr)}, ${r.pct} persen`}
            >
              <div
                className="stats-cat__fill"
                style={{
                  width: `${(r.amountIdr / Math.max(totalIdr, 1)) * 100}%`,
                  background: `var(${r.colorVar})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

`app/(shell)/stats/BiggestExpenseTile.tsx`:

```tsx
import Link from 'next/link'
import { formatIdr } from '@/lib/format'
import { formatDayShort } from '@/lib/stats/format'
import { toIdr } from '@/lib/stats/series'
import type { BiggestExpense } from '@/lib/db/queries'   // F03 owns this type

export default function BiggestExpenseTile({ item }: { item: BiggestExpense | null }) {
  if (!item) return null

  return (
    <section className="stats-card" aria-labelledby="stats-big-title">
      <h2 className="stats-card__title" id="stats-big-title">
        Pengeluaran terbesar
      </h2>
      <Link
        href={`/e/${item.groupId}#item-${item.itemId}`}
        prefetch={false}
        className="stats-big"
      >
        <span className="stats-big__body">
          <span className="stats-big__name">{item.name}</span>
          <span className="stats-big__meta">
            {item.groupTitle} · {formatDayShort(item.occurredOn)}
          </span>
        </span>
        <span className="stats-big__amount">{formatIdr(toIdr(item.amountIdr))}</span>
        <span className="stats-big__chev" aria-hidden="true">
          →
        </span>
      </Link>
    </section>
  )
}
```

```bash
npx tsc --noEmit
git add "app/(shell)/stats/CategoryBreakdown.tsx" "app/(shell)/stats/BiggestExpenseTile.tsx"
git commit -m "F08: zero-JS category bar list and biggest-expense callout"
```

---

### Task 10 — `EmptyStates.tsx` (0-month and 1-month cases)

`app/(shell)/stats/EmptyStates.tsx`:

```tsx
import Link from 'next/link'
import { formatIdr, monthLabel } from '@/lib/format'

/** 0 active months — brand-new account, nothing saved yet. No chart at all. */
export function NoDataState() {
  return (
    <section className="stats-card">
      <div className="stats-empty">
        <p className="stats-empty__title">Belum ada data</p>
        <p className="stats-empty__body">
          Simpan pengeluaran pertamamu, statistik langsung muncul di sini.
        </p>
        <Link href="/new" className="stats-empty__cta">
          + Tambah pengeluaran
        </Link>
      </div>
    </section>
  )
}

/**
 * Exactly 1 active month — the brand-new user with one group and three items.
 *
 * A 12-column chart with 11 zero bars, or a 3-column chart with 2 zero bars,
 * both LOOK BROKEN — and the dataviz form heuristic is explicit that a single
 * value is a stat tile, never a one-bar bar chart. So: no chart. The number is
 * the chart. The 12-month view appears the moment a second month has spend,
 * and the copy says so, so it never reads as a bug.
 */
export function SingleMonthState({
  month,
  totalIdr,
}: {
  month: string
  totalIdr: number
}) {
  return (
    <section className="stats-card">
      <h2 className="stats-card__title">Tren bulanan</h2>
      <p className="stats-hero__value">{formatIdr(totalIdr)}</p>
      <p className="stats-empty__body" style={{ textAlign: 'left', marginTop: 4 }}>
        Total {monthLabel(month)}. Grafik perbandingan muncul begitu ada bulan kedua.
      </p>
    </section>
  )
}
```

```bash
npx tsc --noEmit
git add "app/(shell)/stats/EmptyStates.tsx"
git commit -m "F08: 0-month and 1-month states — stat tile instead of a broken chart"
```

---

### Task 11 — `app/(shell)/stats/page.tsx` (the server component; all data, all maths)

```tsx
import type { Metadata } from 'next'

import { requireUserId } from '@/lib/auth/requireUserId'
import { CATEGORY_META } from '@/lib/categories'
import {
  getBiggestExpense,
  getCategoryBreakdown,
  getMonthlyTotals,
  getMonthToDatePair,
} from '@/lib/db/queries'
import {
  addMonths,
  currentMonthKey,
  formatIdr,
  isValidMonthKey,
  todayJakartaISO,
  type MonthKey,
} from '@/lib/format'
import {
  buildMonthSeries,
  chartWindowLength,
  computeDelta,
  largestRemainderPct,
  toIdr,
  type BreakdownRow,
  type DeltaBasis,
} from '@/lib/stats/series'

import BiggestExpenseTile from './BiggestExpenseTile'
import CategoryBreakdown from './CategoryBreakdown'
import DeltaTile from './DeltaTile'
import { NoDataState, SingleMonthState } from './EmptyStates'
import MonthSwitcher from './MonthSwitcher'
import MonthlyChart from './MonthlyChart'
import './stats.css'

export const metadata: Metadata = { title: 'Statistik' }

// Session-scoped and month-relative: never statically rendered, never cached.
export const dynamic = 'force-dynamic'

const MONTHS = 12

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const userId = await requireUserId()

  const todayISO = todayJakartaISO()                  // 'YYYY-MM-DD', Asia/Jakarta (D9)
  const currentMonth: MonthKey = currentMonthKey()    // F03 helper, same clock
  const throughDay = Number(todayISO.slice(8, 10))

  const sp = await searchParams                       // Next 16: searchParams is a Promise
  const requested = sp?.m
  const windowStart = addMonths(currentMonth, -(MONTHS - 1))
  // Clamp: never in the future, never outside the chart window (otherwise the
  // selected month would have no bar to highlight). isValidMonthKey rejects
  // shape errors; the string comparison is safe because 'YYYY-MM' sorts
  // lexicographically the same way it sorts chronologically.
  const selectedMonth: MonthKey =
    isValidMonthKey(requested) && requested <= currentMonth && requested >= windowStart
      ? requested
      : currentMonth

  const previousMonth = addMonths(selectedMonth, -1)
  const isPartialMonth = selectedMonth === currentMonth

  /* ──────────────────────────────────────────────────────────────────────
     ONE await boundary. Four SQL aggregates, no waterfall, no N+1, and not a
     single raw expense row is summed in JS. If F03 exposes the neon-http
     Drizzle instance, swap Promise.all for db.batch([...]) to collapse these
     into ONE HTTP round trip to Neon (see "Open questions", item 3).
     ────────────────────────────────────────────────────────────────────── */
  const [totalsRaw, breakdownRaw, biggest, mtdPair] = await Promise.all([
    getMonthlyTotals(userId, MONTHS, currentMonth),   // F03: (userId, months, anchorMonth) — already zero-filled
    getCategoryBreakdown(userId, selectedMonth),
    getBiggestExpense(userId, selectedMonth),
    isPartialMonth
      ? getMonthToDatePair(userId, selectedMonth, throughDay)
      : Promise.resolve(null),
  ])

  /* ── monthly series ─────────────────────────────────────────────────── */

  const totals = totalsRaw.map((r) => ({ month: r.month, totalIdr: toIdr(r.totalIdr) }))
  const active = totals
    .filter((r) => r.totalIdr > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
  const firstActive = active[0]?.month ?? null
  const activeCount = active.length

  const series = buildMonthSeries(
    totals,
    currentMonth,
    chartWindowLength(firstActive, currentMonth),
    currentMonth,
  )

  const selectedTotal = totals.find((t) => t.month === selectedMonth)?.totalIdr ?? 0
  const previousTotal = totals.find((t) => t.month === previousMonth)?.totalIdr ?? 0

  /* ── month-over-month delta, honest about the partial month ─────────────
     If the selected month is still running, comparing its 19 days against a
     complete 31-day July would report a fake drop every single time before the
     28th. So for the in-progress month we compare 1..today against 1..today of
     last month, and we SAY SO in the tile.                                 */

  const basis: DeltaBasis = isPartialMonth
    ? { mode: 'mtd', previousMonth, throughDay }
    : { mode: 'full', previousMonth }

  const delta =
    isPartialMonth && mtdPair
      ? computeDelta(toIdr(mtdPair.currentIdr), toIdr(mtdPair.previousIdr), basis)
      : computeDelta(selectedTotal, previousTotal, { mode: 'full', previousMonth })

  /* ── category breakdown ─────────────────────────────────────────────── */

  // F03 already orders these by total desc and omits zero-spend categories;
  // the filter + sort are cheap idempotent guards over at most 8 rows.
  const catTotals = breakdownRaw
    .map((r) => ({ category: r.category, amountIdr: toIdr(r.totalIdr) }))
    .filter((r) => r.amountIdr > 0)
    .sort((a, b) => b.amountIdr - a.amountIdr)

  const pcts = largestRemainderPct(catTotals.map((r) => r.amountIdr))
  const breakdownTotal = catTotals.reduce((a, r) => a + r.amountIdr, 0)

  const rows: BreakdownRow[] = catTotals.map((r, i) => {
    const meta = CATEGORY_META[r.category]
    return {
      category: r.category,
      label: meta.label,
      emoji: meta.emoji,
      colorVar: meta.color,     // '--color-cat-food' — a TOKEN NAME, never a hex
      amountIdr: r.amountIdr,
      pct: pcts[i],
    }
  })

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <main className="stats-root">
      <h1 className="sr-only">Statistik</h1>

      {/* Exactly one hero figure per view (dataviz). This is it. */}
      <section className="stats-card">
        <MonthSwitcher
          selectedMonth={selectedMonth}
          currentMonth={currentMonth}
          earliestMonth={windowStart}
        />
        <p className="stats-hero__value">{formatIdr(selectedTotal)}</p>
        <DeltaTile delta={delta} />
      </section>

      {activeCount === 0 ? (
        <NoDataState />
      ) : activeCount === 1 ? (
        <SingleMonthState month={active[0].month} totalIdr={active[0].totalIdr} />
      ) : (
        <MonthlyChart series={series} selectedMonth={selectedMonth} />
      )}

      <CategoryBreakdown rows={rows} totalIdr={breakdownTotal} />
      <BiggestExpenseTile item={biggest} />
    </main>
  )
}
```

And `app/(shell)/stats/loading.tsx`:

```tsx
import './stats.css'

export default function StatsLoading() {
  return (
    <main className="stats-root" aria-busy="true">
      <section className="stats-card">
        <div className="stats-chart__skeleton" style={{ minHeight: 96 }} />
      </section>
      <section className="stats-card">
        <div className="stats-chart__skeleton" />
      </section>
    </main>
  )
}
```

```bash
npx tsc --noEmit
npm run build
git add "app/(shell)/stats/page.tsx" "app/(shell)/stats/loading.tsx"
git commit -m "F08: /stats server page — one await boundary, all aggregation in SQL"
```

**Expected build output (record the real numbers in the PR):**

```
Route (app)                    Size     First Load JS
├ ƒ /m/[month]                 ~2 kB    ~11x kB
├ ƒ /stats                     ~3 kB    ~21x kB      ← ~100 kB above /m, all of it the lazy recharts chunk
```

If `/stats` First Load JS is *not* ~100 kB above the other routes, the dynamic import is being defeated — check that nothing else in the tree imports `recharts` statically.

---

### Task 12 — Tab-bar wiring and the single-import guard

```bash
# F07's AppTabBar "Statistik" tab must link to a BARE /stats — the ?m= param is
# a view filter, so the tab always returns the user to the current month.
grep -n "stats" components/nav/AppTabBar.tsx

# HARD GATE: recharts must be imported in exactly ONE file.
grep -rn "from 'recharts'" app/ lib/ components/
# Expected, exactly one line:
#   app/(shell)/stats/MonthlyChartInner.tsx:} from 'recharts'

# And the page must be inside the shell route group, or it renders with no tab bar.
ls "app/(shell)/stats/page.tsx"
```

```bash
git add -A && git commit -m "F08: tab bar wiring + recharts single-import guard"
```

---

## 6. Empty and thin states — exact behaviour

`activeCount` = number of months in the 12-month window with `totalIdr > 0`.

| Data | Hero card | Chart slot | Breakdown card | Biggest card |
|---|---|---|---|---|
| **0 months** (brand-new account) | `Rp 0`, delta = `Belum ada pengeluaran` | `NoDataState`: "Belum ada data" + `+ Tambah pengeluaran` → `/new`. **Recharts never loads.** | "Belum ada pengeluaran di bulan ini." | not rendered (`item === null`) |
| **1 month, 3 items** (the stated new-user case) | real total, delta = `Bulan pertama dengan pengeluaran` + `Jul kosong — tidak ada pembanding` | `SingleMonthState`: the month total as a value + "Grafik perbandingan muncul begitu ada bulan kedua." **Recharts never loads.** | 1–3 rows with real bars | the biggest of the 3 items |
| **2 months** | real total, real % delta | column chart, window = `clamp(span, 3, 12)` → 3 columns; the month before first activity renders as an explicit **Rp 0** bar | real rows | real |
| **3 months** (e.g. Jun 300k, Jul 0, Agu 500k) | real | 3 columns: `Jun 300k` · **`Jul` a zero-height bar on the drawn baseline with its tick label present** · `Agu•` lighter (partial). The gap is *visible*, which is the entire point of D-B. | real | real |
| **4–11 months** | real | window = span; e.g. 6 months of history → 6 columns | real | real |
| **≥ 12 months** | real | 12 columns | real | real |
| **A past month with no spend selected** (`?m=2026-04`) | `Rp 0`, delta vs March | chart unchanged; April's tick is emphasised and its bar is zero-height | "Belum ada pengeluaran di bulan ini." | not rendered |

Two rules make this hold:

1. **`chartWindowLength` never returns 1 or 2.** A 1- or 2-column "chart" reads as a rendering bug; the floor of 3 plus the `activeCount === 1` short-circuit means the chart is only ever drawn when it has something to say.
2. **Zero months are drawn, never dropped.** `minPointSize={0}` means a zero bar has zero height — no sympathy sliver misstating the value. What makes it legible as *data* rather than *absence* is that the x tick is still printed, the baseline is a drawn rule, and the table view lists `Rp 0`.

---
## 7. Manual QA script — 414 × 896, light **and** dark

### 7.1 Set up the viewport

```bash
npm run dev
```

Chrome DevTools → device toolbar → **Add custom device**: `iPhone XS Max`, **414 × 896**, DPR 3, UA "Mobile · iOS". Then, per pass, set the emulated theme:

DevTools → ⋮ → More tools → **Rendering** → *Emulate CSS media feature `prefers-color-scheme`* → `light` / `dark`.

### 7.2 Seed the fixtures

```bash
psql "$DATABASE_URL" -f docs/plans/fixtures/f08-seed.sql
```

Three users to create (replace `<UID>` with real `users.id` values):

- **U-EMPTY** — signed in, zero groups.
- **U-THIN** — one group in the current month, 3 items (`roti buaya 38500` food, `ayam sambal hitam 45000` food, `perumahan laddaland 49000` housing).
- **U-FULL** — groups spread over 14 months, with **at least one deliberately empty month in the middle** (this is the case D-B exists for) and **at least one month using all 8 categories**.

### 7.3 The pass — run every row in BOTH `light` and `dark`

| # | Step | Expected |
|---|---|---|
| 1 | U-FULL → `/stats` | Page fits 414 px. **No horizontal scrollbar anywhere.** Bottom card clears F07's tab bar + the home indicator, with no doubled gap. |
| 2 | Read the hero | `Rp …` at ~44 px, primary ink, proportional figures (not tabular — `121` must not look gappy). Exactly **one** figure this large on the page. |
| 3 | Read the delta line | Arrow glyph **and** the word `Naik`/`Turun`/`Setara` are both present. Basis line reads `vs 1–<today> <Mon> <Year> (periode sama)`. |
| 4 | Grayscale test | Rendering → *Emulate vision deficiencies* → **Achromatopsia**. The delta is still unambiguous (glyph + word), and every breakdown row is still identifiable (emoji + label + value). |
| 5 | CVD test | Emulate **Deuteranopia**, then **Protanopia**. No two adjacent breakdown bars become confusable *in a way that costs information* — each row's text is authoritative. |
| 6 | Count the columns | 12 for U-FULL. All 12 tick labels legible at 10 px with no overlap and no clipping at the card edges. |
| 7 | Find the empty month | Its bar has **zero height**, sits on the drawn baseline, and **its tick label is present**. The x-axis spacing is even — the gap has not been closed. |
| 8 | Current month | Its bar is the lighter (light mode) / darker (dark mode) blue step; its tick reads `Agu•`; the caption `• Bulan berjalan — belum penuh sebulan.` is visible. |
| 9 | Gridlines | Exactly 2–3 horizontal hairlines, **solid** (not dashed), one shade off the surface, clearly recessive vs. the bars. |
| 10 | Bar geometry | Bars ≈ 14 px wide with visible air between bands. Top corners rounded ~4 px, bottom corners square on the baseline. |
| 11 | **Tap #1** on a non-selected month (thumb, not cursor) | Readout updates immediately; the cap label appears above that bar; its tick goes bold with the 2 px underline; URL becomes `/stats?m=YYYY-MM`; the page does **not** scroll. |
| 12 | While it loads | The chart holds its previous render at reduced opacity. **No skeleton flash, no layout jump.** |
| 13 | Cards below | Breakdown + biggest-expense now show the newly selected month. |
| 14 | **Tap #2** on the same bar | Navigates to `/m/YYYY-MM`. Back button returns to `/stats?m=…` with the same month still selected. |
| 15 | Tap the readout link | One tap → `/m/…`, no double-tap needed. |
| 16 | Tap `‹` / `›` | Month moves one step; `›` is visibly disabled on the current month; `‹` is disabled at the window start. Both are ≥ 44 × 44. |
| 17 | Deep-link garbage | `/stats?m=banana`, `/stats?m=2099-01`, `/stats?m=2020-13`, `/stats?m=` → each falls back to the current month, **no crash, no empty render**. |
| 18 | Open `▸ Lihat angka` | A 2-column table listing every month incl. `Rp 0` rows, right-aligned tabular figures, each month a working link. |
| 19 | Keyboard (desktop, 414 px width) | Tab into the chart, arrow keys walk the bands (`accessibilityLayer`), Enter selects. Every value is reachable without a pointer. |
| 20 | Breakdown percentages | Sum to **exactly 100**. Amounts sum to the month total shown in the hero. |
| 21 | Breakdown widths | The largest row's bar is the longest; a tiny category (< 1 %) still shows a visible ≥ 3 px stub rather than disappearing. |
| 22 | Long label test | Force a `Tempat Tinggal` row with a 7-digit amount — the label ellipsises, the amount and `%` stay right-aligned and are **never** pushed off-card or wrapped mid-number. |
| 23 | Biggest-expense tile | Amount matches the largest single item that month. Tap → `/e/<groupId>`, and the target item is scrolled into view via the `#item-<id>` anchor (see Open question 4). |
| 24 | U-THIN → `/stats` | **No chart.** `SingleMonthState` with the month total. Delta reads `Bulan pertama dengan pengeluaran`. Breakdown shows exactly 2 rows (food, housing). Nothing looks broken or half-drawn. |
| 25 | U-THIN network tab | Filter by `.js`. **No recharts chunk is downloaded.** |
| 26 | U-EMPTY → `/stats` | `NoDataState` with a working `/new` CTA. Hero `Rp 0`. No chart, **no recharts chunk**. |
| 27 | Rotate to landscape (896 × 414) | Cards reflow, chart stays responsive, no overflow. |
| 28 | Text size ×2 (iOS Settings / DevTools font-size override) | Cards grow; nothing clips; the breakdown head row wraps gracefully. |
| 29 | Reduced motion | Rendering → *Emulate `prefers-reduced-motion: reduce`*. No opacity transition on refetch; bars still do not animate. |
| 30 | Look at it | Screenshot both modes at 414 × 896. Compare against `anti-patterns.md`: no dual axis, no dashed grid, no number on every bar, no borders around marks, no clipped labels, no nested vertical scroll in the chart card. |

### 7.4 The two colour gates (must be re-run if any hex changes)

```bash
SKILL=/path/to/skills/dataviz
node "$SKILL/scripts/validate_palette.js" \
  "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7" --mode light ; echo "exit=$?"
node "$SKILL/scripts/validate_palette.js" \
  "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9" --mode dark --surface "#1a1a19" ; echo "exit=$?"
# Both must print exit=0 and "ALL CHECKS PASS".
```

If F10's card surfaces are not `#fcfcfb` / `#1a1a19`, re-run with `--surface <hex>` for each mode — see Open question 6.

---

## 8. Anti-pattern self-audit

| Anti-pattern | Status |
|---|---|
| Dual-axis chart | ✅ Never — one y-axis, one measure (rupiah). |
| Recolor-on-filter | ✅ Colour follows the category *entity* via its token; filtering out zero categories never repaints the survivors. |
| Cycling/generating hues past 8 | ✅ 7 hues + the de-emphasis grey. No 9th hue exists. |
| Eyeballing colourblind-safety | ✅ Validator run, output pasted in §4.3, both modes, plus the failing all-pairs runs that justified rejecting the donut. |
| Value-ramp on nominal categories | ✅ The monthly bars are one hue; the two blue steps encode *completeness*, not magnitude. |
| Status colour for a non-status series | ✅ `critical`/`good` appear only in the delta tile; no categorical red is on the page (D-H). |
| 8 hues when the story is one number | ✅ The delta and the biggest expense are stat tiles. |
| One-bar bar chart / 2-slice pie | ✅ `activeCount === 1` renders a stat tile, not a chart. |
| Donut for close values / > 6 segments | ✅ Rejected; horizontal bars instead (§1.2). |
| Thick blocks, heavy grid | ✅ 14 px bars, 8 px breakdown tracks, hairline grid. |
| Dashed gridlines | ✅ `stroke-dasharray: none` set explicitly (Recharts examples default to `"3 3"`). |
| A number on every point | ✅ Only the selected bar gets a cap label. |
| Border around marks to separate them | ✅ Separation is band air and the surface gap; no strokes on bars. |
| Clipped / overflowing label | ✅ Cap label sits *above* the bar, never inside; breakdown labels ellipsise on the text, never on a number. |
| Fixed height excluding the x-axis band | ✅ `height={196}` covers plot + the 26 px axis band; the card has no fixed height and no nested scroll. |
| Display/serif hero figure | ✅ System sans throughout. |
| `tabular-nums` on a big standalone number | ✅ Hero uses proportional; tabular only in the table view and the breakdown columns. |
| Texture by default | ✅ No texture shipped. |
| Tooltip as the only way to read a value | ✅ Persistent readout + cap label + `<details>` table + `aria-label` on every breakdown bar. |
| Pinpoint hover targets | ✅ The 26 px band, full height, is the target — not the 14 px bar. |
| Per-chart filters | ✅ One month selector at the top scoping every card below it. |
| Skeleton flash on refetch | ✅ Previous render held at 0.55 opacity. |
| No table view / colour-only encoding | ✅ Table view on the chart; the breakdown list *is* the table for the categories. |

---

## Contract deltas

Verified against the plans F03 and F07 actually shipped, not against assumptions. **Three** deltas remain; two
things I expected to be deltas turned out to be already provided.

**Already provided — no delta needed:**

- `getBiggestExpense(userId, month)` **exists in F03** (`lib/db/queries.ts`), returning the largest *item* with
  `{ itemId, name, amountIdr, category, groupId, groupTitle, occurredOn }` and deterministic tie-breaking. Exactly
  the shape this plan needs. (It is absent from roadmap §5's F03 paragraph; F03's own plan added it for F08.)
- `getMonthlyTotals` **already zero-fills** via the exported pure `fillZeroMonths`, so D-B is satisfied inside
  F03 and F08's `buildMonthSeries` is a decorator plus an idempotent guard rather than the densifier.
- `CATEGORY_META` **exists in F03** under exactly that name, and `CategoryMeta.color` is typed
  ``` `--color-cat-${Category}` ``` — leading dashes included. Two of my open questions were resolved by reading it.

### Delta 1 — §4.6: `/stats` renders a category **bar list**, not a donut

§4.6 reads "12-month growth bar chart + current-month category **donut**"; F03's `getCategoryBreakdown` docstring
likewise says "Powers the F08 donut". The donut is replaced by a horizontal bar list. **The query is unchanged** —
only the mark is. F03's comment should be corrected to "Powers the F08 category bar list".

*Reason:* the 8-category palette **FAILS** the dataviz all-pairs CVD gate in both modes (worst pair ΔE 1.6 under
deuteranopia in dark; normal-vision floor 7.1 against a required 15). In a donut, colour is the only identity
channel, so those failures are user-visible information loss — and the normal-vision failure means full-colour
readers are affected too, not just colour-blind ones. The skill also caps part-to-whole at ≤ 6 segments and
explicitly deprioritises the donut. Full reasoning and validator transcripts in §1.2.

*Knock-on:* F07's published note "**F08** may use `CategoryChip` in the donut legend" still holds — the bar list's
row heads are a legend, and `CategoryChip` is a legitimate drop-in for the emoji+label pair (see Open question 5).

### Delta 2 — §4.6: `/stats` accepts an optional `?m=YYYY-MM` query parameter

The route is unchanged and bare `/stats` still means "current month", which is what F07's `AppTabBar` links to.
Invalid, future, or out-of-window values fall back silently to the current month. No new route segment, so F07's
`/m/[month]` remains the single canonical resource URL for a month.

### Delta 3 — F03 `lib/db/queries.ts`: add `getMonthToDatePair(userId, month, throughDay)`

Required to compare a *partial* current month honestly (D-G). Without it the only options are a
knowingly-misleading half-month-vs-full-month percentage, or no delta at all on the current month — which is
precisely when the user opens the page.

```ts
export async function getMonthToDatePair(
  userId: string,
  month: MonthKey,
  throughDay: number,
): Promise<{ currentIdr: number; previousIdr: number }>
```

```sql
-- $1 userId · $2 first day of `month` · $3 throughDay (days elapsed, inclusive)
SELECT
  COALESCE(SUM(i.amount_idr) FILTER (
    WHERE g.occurred_on >= $2::date
      AND g.occurred_on <  $2::date + ($3::int)
  ), 0)::bigint AS current_idr,
  COALESCE(SUM(i.amount_idr) FILTER (
    WHERE g.occurred_on >= ($2::date - INTERVAL '1 month')
      AND g.occurred_on <  ($2::date - INTERVAL '1 month') + ($3::int)
  ), 0)::bigint AS previous_idr
FROM expense_groups g
JOIN expense_items i ON i.group_id = g.id
WHERE g.user_id = $1;            -- the §4.4 userId invariant, same as every other query
```

Both windows are `[day 1 .. throughDay]` of their respective months, so February-vs-January needs no day-count
special-casing. It should be `.mapWith(Number)`'d like F03's other aggregates, and should follow F03's existing
`monthRange()` convention rather than open-coding date arithmetic.

### Not a delta, but flagged

- **§4.1 — `other` (`Lainnya`) is assigned the de-emphasis grey** rather than a categorical hue. §4.1 only mandates
  that each category *has* a colour token, so this is a clarification; it is called out because it departs from the
  obvious "8 categories → 8 categorical slots" reading. The skill defines "de-emphasis / Other" as a first-class
  colour role, and using it also removes the collision between a categorical red and the `critical` status token in
  the delta tile (they measure ΔE 4.8 apart).
- **`lib/format.ts` (§4.7) is untouched.** Every new formatter lives in the F08-owned `lib/stats/format.ts`, and
  each one carries a comment saying which existing helper it is *not* duplicating.

---

## Interfaces I publish

F08 is a leaf — nothing in v0.1.0 imports from it. Listed so a future feature reuses the maths rather than
re-deriving it.

**`lib/stats/format.ts`** — only what `lib/format.ts` does not already provide:

```ts
export function monthTickLabel(month: MonthKey): string   // '2026-08' -> 'Agu'     (bare; axis-width constrained)
export function monthMedium(month: MonthKey): string      // '2026-08' -> 'Agu 2026'
export function monthsBetween(a: MonthKey, b: MonthKey): number
export function formatIdrAxis(n: number): string          // 1_240_000 -> '1,2jt'   (no 'Rp' prefix)
export function formatDayShort(isoDate: string): string   // '2026-08-18' -> '18 Agu 2026'
export function formatMtdRange(month: MonthKey, throughDay: number): string  // '1–19 Jul 2026'
```

**`lib/stats/series.ts`**

```ts
export type MonthPoint    = { month: MonthKey; label: string; totalIdr: number; isPartial: boolean }
export type BreakdownRow  = { category: Category; label: string; emoji: string; colorVar: string
                              amountIdr: number; pct: number }
export type DeltaBasis    = { mode: 'full'; previousMonth: MonthKey }
                          | { mode: 'mtd';  previousMonth: MonthKey; throughDay: number }
export type Delta         = { kind: 'none';  basis: DeltaBasis }
                          | { kind: 'first'; currentIdr: number; basis: DeltaBasis }
                          | { kind: 'pct';   pct: number; direction: 'up'|'down'|'flat'
                              currentIdr: number; previousIdr: number; basis: DeltaBasis }

export function toIdr(v: unknown): number
export function buildMonthSeries(
  rows: ReadonlyArray<{ month: string; totalIdr: unknown }>,
  endMonth: MonthKey, length: number, currentMonth: MonthKey,
): MonthPoint[]
export function chartWindowLength(firstActiveMonth: MonthKey | null, currentMonth: MonthKey): number
export function computeDelta(currentIdr: number, previousIdr: number, basis: DeltaBasis): Delta
export function largestRemainderPct(values: readonly number[]): number[]
```

**Design tokens F08 owns** — declared in `app/(shell)/stats/stats.css`, scoped to `.stats-root`:
`--chart-surface`, `--chart-series-1`, `--chart-series-1-soft`, `--chart-grid`, `--chart-baseline`,
`--chart-track`, `--chart-ink`, `--chart-ink-2`, `--chart-muted`, `--delta-up`, `--delta-down`,
`--chart-hairline`. Values and measured contrast in §4.4. F08 does **not** own any `--color-cat-*` token.

**Route:** `GET /stats` and `GET /stats?m=YYYY-MM`, served from `app/(shell)/stats/page.tsx`.

---

## Interfaces I consume

Every symbol, with the signature F08 compiles against. **Verify each before starting Task 1** — a mismatch here is
the likeliest reason this plan fails to build.

### From F03 — `lib/db/queries.ts`

All are `userId`-scoped per §4.4; F08 never filters by user itself.

```ts
export type MonthlyTotal   = { month: MonthKey; totalIdr: number }
export type CategoryTotal  = { category: Category; totalIdr: number; itemCount: number }
export type BiggestExpense = {
  itemId: string; name: string; amountIdr: number; category: Category
  groupId: string; groupTitle: string; occurredOn: DateISO
}

// SHIPPED. NOTE THE THIRD ARGUMENT — F08 passes currentMonthKey() explicitly.
// Returns exactly `months` rows, oldest -> newest, gaps already zero-filled.
export function getMonthlyTotals(userId: string, months: number, anchorMonth: MonthKey): Promise<MonthlyTotal[]>

// SHIPPED. Pure, exported for reuse. F08 re-runs it as an idempotent guard.
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; totalIdr: number }>, anchorMonth: MonthKey, months: number,
): MonthlyTotal[]

// SHIPPED. Already ordered by total DESC; zero-spend categories omitted.
export function getCategoryBreakdown(userId: string, month: MonthKey): Promise<CategoryTotal[]>

// SHIPPED. Largest single ITEM in the month; null for an empty month;
// deterministic tie-break so the callout does not flicker between renders.
export function getBiggestExpense(userId: string, month: MonthKey): Promise<BiggestExpense | null>

// ── CONTRACT DELTA 3 — does NOT exist yet. F03 must add it. ──
export function getMonthToDatePair(
  userId: string, month: MonthKey, throughDay: number,
): Promise<{ currentIdr: number; previousIdr: number }>
```

> **bigint note.** `getMonthlyTotals` and `getCategoryBreakdown` are `.mapWith(Number)`'d, so their totals arrive
> as numbers. `getBiggestExpense.amountIdr` reads the raw `bigint` column, whose JS type depends on the Drizzle
> `bigint` mode F03 chose. F08 routes **every** total through `toIdr()`, so it is correct either way — but nothing
> upstream may `+` two of those before F08 sees them.

### From F03 — `lib/categories.ts`

```ts
export const CATEGORIES: readonly ['food','groceries','transport','bills','housing','entertainment','health','other']
export type Category = (typeof CATEGORIES)[number]
export interface CategoryMeta {
  id: Category
  label: string                          // 'Makan & Jajan'
  emoji: string                          // '🍜'
  color: `--color-cat-${Category}`       // '--color-cat-food'  ← leading dashes INCLUDED
  hint: string
}
export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>>
```

F08 uses `CATEGORY_META[row.category].{label, emoji, color}` and writes no category hex, ever.

### From F03 — `lib/format.ts`

```ts
export type MonthKey = string                                  // 'YYYY-MM'
export type DateISO  = string                                  // 'YYYY-MM-DD'
export function formatIdr(n: number): string                   // 38500 -> 'Rp 38.500'
export function isValidMonthKey(v: unknown): v is MonthKey     // ?m= validation
export function todayJakartaISO(now?: Date): DateISO           // for throughDay
export function currentMonthKey(now?: Date): MonthKey
export function addMonths(month: MonthKey, delta: number): MonthKey     // throws RangeError
export function monthLabel(month: MonthKey): string            // '2026-08' -> 'Agustus 2026'
export const MONTH_NAMES_ID_SHORT: readonly string[]           // 'Jan' … 'Des'
```

Not used by F08 but present, so **do not re-implement**: `formatIdrCompact`, `parseIdrLoose`, `monthRange`,
`monthKey`, `monthLabelShort`, `MONTH_NAMES_ID`, `DAY_NAMES_ID`.

### From F07 — the shell and the routes

```
app/(shell)/layout.tsx            F08's page MUST live at app/(shell)/stats/page.tsx.
                                  Outside the group it renders with no tab bar and no ToastProvider.
                                  The layout already applies pb-[calc(4.5rem+env(safe-area-inset-bottom))],
                                  so stats.css must NOT repeat the tab-bar padding.
components/nav/AppTabBar.tsx      The "Statistik" tab links to a bare /stats.
/m/[month]                        2nd-stage tap target, the readout link, every table-view row.
/e/[id]                           Biggest-expense tile -> /e/<groupId>#item-<itemId>.
```

```tsx
// components/category/ — server-safe; an optional drop-in for the breakdown row head.
export function CategoryChip(props: { category: Category; size?: 'sm' | 'md' }): JSX.Element
```

```ts
// components/ui/Toast.tsx — mounted by the shell layout. F08 does not currently need it
// (the page has no mutations), but it is available to any client component under /stats.
export function useToast(): { show(spec: ToastSpec): void; dismiss(): void }
```

**`lib/month.ts` (F07) overlaps `lib/format.ts` (F03).** Both export `addMonths` and Indonesian month labels.
F08 imports from **`lib/format.ts`**, because §4.7 names it and F03 owns it. See Open question 1.

### From F02

```ts
export function requireUserId(): Promise<string>   // throws when unauthenticated
```

`middleware.ts` must already protect `/stats` (§5 F02).

### From F10 — design tokens

The eight `--color-cat-*` custom properties, declared on `:root`/`html` with **both** a light and a dark value,
using the validated hexes in §4.2. Plus a `.sr-only` visually-hidden utility; if F10 does not ship one, add the
four-line rule to `stats.css`.

---

## Open questions for the integrator

1. **`lib/format.ts` (F03) vs `lib/month.ts` (F07) is a real duplication.** Both export `addMonths` and Indonesian
   month formatting; F03's plan tells F08 to use `lib/format.ts`, F07's plan tells F08 to use
   `lib/month.ts`/`formatMonthShortId`. F08 imports from `lib/format.ts` (§4.7 names it; F03 owns it). **This needs
   deciding at integration time regardless of F08** — two month-arithmetic implementations in one codebase is a
   drift bug waiting to happen. If `lib/month.ts` wins, F08 changes four import lines and nothing else.

2. **Will F03 accept Delta 3 (`getMonthToDatePair`)?** If not, F08 falls back to comparing the partial current
   month against the *full* previous month with the basis line changed to
   `vs Juli penuh — Agustus baru berjalan <n> hari`. Honest, but it reports a fake drop for most of every month,
   so the query is strongly preferred. Everything else in the tile is unchanged.

3. **`db.batch()` for one true round trip.** The page makes four aggregate calls in one `Promise.all`, which is
   four HTTP round trips on the Neon **HTTP** driver (the pooled/WebSocket driver pipelines them). If F03 exposes
   the neon-http Drizzle instance, `db.batch([...])` collapses them into one request. Should F03 instead publish a
   `getStatsBundle(userId, month, throughDay)`? **My recommendation:** keep the four queries as published
   (composable, individually testable) and let F08 batch them; revisit only if measured latency justifies it.

4. **Does F07's `/e/[id]` render `id="item-<itemId>"` on its item rows?** The `#item-` fragment in the
   biggest-expense link is inert without it. One attribute on F07's side; if F07 declines, drop the fragment — the
   link still lands on the right group.

5. **Use F07's `CategoryChip` in the breakdown row head?** It would guarantee the chip visual matches
   `/e/[id]` exactly. F08 currently renders `emoji + label` inline because the row also needs a right-aligned
   amount and percent on the same 414 px line, and a full chip's padding costs ~24 px of that budget. Worth a look
   once `CategoryChip` exists — if `size="sm"` fits, prefer it for consistency.

6. **Which surfaces does F10 actually use for cards?** Every contrast number in §4.2 and §4.4 is measured against
   `#fcfcfb` (light) and `#1a1a19` (dark). F09 references `--color-surface-2`, so a second surface exists. If F10's
   card surface differs by more than a hair, **re-run the validator with `--surface <hex>` in both modes** and
   re-check the three light-mode ⚠︎ slots — a darker light surface pushes more of them below 3:1, and a lighter
   dark surface could break the currently-clean dark column. **This is the one open question that can invalidate a
   shipped colour decision, so resolve it before F08 starts.**

7. **Does F10 ship a `[data-theme]` toggle?** Roadmap §5 says no dark-mode toggle (follow system), so `stats.css`
   implements `prefers-color-scheme` as the live path. The `:root[data-theme='dark']` block is included
   pre-emptively and is inert today; delete it if F10 confirms the toggle will never exist.

8. **Should the 12-month window be *rolling 12* or *the last 12 with data*?** F08 implements
   rolling-12-ending-at-the-current-month, so an inactive user sees their inactivity. **My recommendation:** keep
   rolling — hiding a dry spell is the same category of lie as dropping a zero month.

9. **Should the delta ever compare against a 3-month average instead of last month?** Month-to-month spending is
   noisy; one Lebaran month poisons the next comparison. Out of scope for v0.1.0, but if it lands, the
   `DeltaBasis` union already has room for a third variant and `DeltaTile` just switches on it.

10. **Test runner.** F01 pins no framework. Task 4's tests are written for `vitest`; if F01 chose `node --test`,
    swap the import and the `expect` forms for `node:assert` — the module under test is framework-free either way.
    (F03's plan references `tests/categories.test.ts`, so whatever F03 used is the answer.)
