# F13 — the amount field on `/new`'s review table clips its own value

**Card:** [#3](https://github.com/miftahulmahfuzh/expense-tracking/issues/3) · **Round 1** · 2026-08-22
**Branch:** `task/3-the-amount-field-on-new-s-review-table` off `1ae3b2b`

## 1. What is wrong

On `/new`'s review table every amount past four glyphs loses its tail. `38.500` shows
`38.50`; `4.500.000` shows `4.500.`. The running **Total** in the sticky bar is correct, so
the data was never wrong — only the per-row field is, and in the worse direction: the row
reads as a smaller number than it is, and the total then looks like it disagrees with the
rows it is the sum of.

Measured in Chromium at 414×896, `deviceScaleFactor: 2`, against `ddec1a7`:

| value | `clientWidth` | `scrollWidth` | clipped |
|---|---|---|---|
| `38.500` | 44 | 56 | yes |
| `58.850` | 44 | 56 | yes |
| `4.500.000` | 44 | 82 | yes |

## 2. The width budget, which is the whole bug

At a 414 px viewport, what reaches the row:

| | px |
|---|---|
| viewport | 414 |
| − `px-safe` (`--spacing-gutter` 22, twice) | 370 |
| − `Card padded="rows"` (`pl-4` 16 + `pr-1.5` 6) | 348 |
| − the row's `gap-2` | **340, for chip + amount** |

`ItemRow.tsx` gives the amount a fixed `ml-auto w-[9.5rem]` — 152 px — so the chip has 188.
Inside those 152 px, `MoneyInput` lays out:

| part | px |
|---|---|
| `pl-3.5` + `pr-1.5` | 20 |
| `border` (transparent, but 1 px each side) | 2 |
| static `Rp` span | ~20 |
| two `gap-2.5` | 20 |
| `IDR` badge, `px-3` at `text-action`, `shrink-0` | ~48 |
| **chrome total** | **~110** |
| → `flex-1 min-w-0` input | **~42** |

Which lands on the measured 43–44 `clientWidth`, and that agreement is what makes the budget
a diagnosis rather than a story. `4.500.000` needs 81. The field is ~38 px short.

**Mind the border.** The padding alone says the chrome is 108 and the input 44; the field also
carries `border border-transparent`, and those 2 px are the easiest line here to leave out. The
numbers below are measured, and the arithmetic is only how they are explained.

The same component is fine in `app/(bare)/e/[id]/ItemSheet.tsx`, where it is full-bleed in
the sheet and the input measures 274 px. So the defect is the 152 px column, not the
component — and that is also why it shipped: the detail screen shows correct amounts, and
only the paste flow, the screen the product exists for, is wrong.

Introduced by the v0.2.0 design pull, which added the `IDR` badge (canvas `01 Components`,
R-34) to a column whose `9.5rem` was measured before that badge existed.

## 3. Why the other two candidates lose

The card offered three fixes and declined to pick. The budget above picks for us.

- **Widen the column.** To give the input 81 px with the badge intact the column needs
  **190 px**, leaving the chip 150. The chips were measured too, at the same viewport:
  `Tempat Tinggal` is **171 px** and `Belanja Harian` **162** — so both overflow by 21 and 12.
  That trades a clipped amount for a clipped category, which is not a fix. (Today's 152 px
  column leaves the chip 188, so the widest fits with 17 px to spare — the row is not roomy,
  it is exactly roomy enough.)
- **Size the column to content.** An `<input>`'s intrinsic width is its `size` default —
  about 20 characters, ~170 px — so content-sizing produces a column *wider* than widening
  does, with the same chip collision and less predictability.
- **Drop the badge.** Chrome falls ~110 → ~52, the input becomes **100 px**, and nothing else
  on the row moves.

## 4. The change

### 4a. `components/ui/MoneyInput.tsx` — delete the `IDR` span

Chrome ~110 → ~52. The input goes 43 → **100 px** on the `/new` row, measured; the item
sheet's gains the same ~58 px the badge and its gap were spending. 100 clears `4.500.000`
(81) with 19 px spare and just clears `999.999.999` (~100 px), which is the realistic ceiling
for an expense.

The badge's stated job in the docstring is to make the currency "legible at a glance in a
column of otherwise identical white slabs". The static `Rp` prefix already does that, and
the two together state the currency **twice on one control**. So the badge is not being
sacrificed to buy width — it was redundant, and the width is what made the redundancy
expensive.

**This deviates from a shipped artboard.** R-34 put the badge there. Recorded in the
docstring where the badge's rationale currently lives, so the reversal sits with the ruling
it reverses rather than only in a changelog. The canvas's `05 Shipped State` disagrees until
pushed.

### 4b. Same file — `min-w-0` → `min-w-[6rem]`

`min-w-0` is why nobody saw this for a release. It lets a flex child shrink below its
content, so the input absorbed the entire 38 px shortfall silently: a clipped `<input>`
throws no error, logs nothing, and looks like a smaller number.

An explicit `min-width` overrides the automatic minimum the same way `0` does, so the
intrinsic ~170 px never becomes the floor. At 96 px it sits 4 px under the 100 the column
affords, so it constrains nothing today — and any future container that cannot afford it
**overflows the rounded field visibly** instead of truncating a number.

Note what this does and does not buy: it does not make the field hold more digits. Past nine
digits the text overflows rather than clipping. Overflowing is the point.

### 4c. `scripts/f05-audit.sh` — one check

That `min-w-0` has not returned to `MoneyInput.tsx`, with §2's arithmetic in the comment
above it so the next reader gets the budget and not just the conclusion.

Stated plainly: **the `f0X-audit.sh` scripts are not in CI.** The gate is `lint · typecheck ·
test · db:check · build · format:check`. So 4c is a written rule and 4b is the enforcement.
A grep cannot measure a rendered width; the CSS floor can, everywhere, for free.

## 5. What is deliberately not touched

`w-[9.5rem]` stays, so the chip keeps its full label at every category and the row's
geometry is unchanged. No prop and no branch on `MoneyInput` — one component, one
appearance. `ItemRow.tsx` and `ItemSheet.tsx` are not edited. No test asserts the badge
exists, so none breaks.

## 6. Verification

### 6a. The repo's own gate — passed

`.github/workflows/ci.yml`, in order. `npm run db:check` and `npm run build` need the
environment, and a fresh worktree has no `.env.local`, so both were run with CI's own dummy
values from the workflow's `env:` block rather than with real credentials.

| step | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 907 passed, 17 skipped · 50 files passed, 2 skipped |
| `npm run db:check` | `Everything's fine` |
| `npm run build` | exit 0, all 17 routes listed, `/new` still `ƒ` |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `bash scripts/f05-audit.sh` | 7/7 PASS |

The audit check was also watched to FAIL: `min-w-[6rem]` was temporarily reverted to
`min-w-0` in the `className`, the check reported the offending line, and `min-w-[6rem]` was
restored. A guard nobody has seen fail is not a guard.

### 6b. The card's own measurement, re-run — the one that matters

The gate cannot see this bug. It passed on the broken commit and would pass on it again:
`vitest` runs on `environment: 'node'`, and nothing in this repo measures a rendered width.

The card measured production at 414×896, dSF 2. That exact path is closed — the fix is not
deployed, and `/new` needs a real login — so the measurement was reproduced against the
**app's own compiled CSS** (`.next/static/chunks/*.css`) and its **own self-hosted Archivo**,
served over http so the `@font-face` relative urls resolve, with the container chain built
out in full: `AppShell` → `px-safe` → `Card padded="rows"` → `li` → the row's
`flex items-start gap-2` → `w-[9.5rem]` → `Field` → the field. Confirmed in the page:
`font-family: Archivo`, `font-size: 17px`, row width **348 px** — which is §2's budget line
for line.

The shipped markup was rendered **beside** the fix, as a control. If the harness cannot
reproduce the card's published numbers it is not measuring the same thing, and its verdict on
the fix is worth nothing:

| markup | value | column | `clientWidth` | `scrollWidth` | clipped | card said |
|---|---|---|---|---|---|---|
| shipped | `38.500` | 152 | 43 | 55 | **yes** | 44 / 56 ✓ |
| shipped | `58.850` | 152 | 43 | 55 | **yes** | 44 / 56 ✓ |
| shipped | `4.500.000` | 152 | 43 | 81 | **yes** | 44 / 82 ✓ |
| **fixed** | `38.500` | 152 | **100** | 100 | **no** | — |
| **fixed** | `58.850` | 152 | **100** | 100 | **no** | — |
| **fixed** | `4.500.000` | 152 | **100** | 100 | **no** | — |

One pixel under the card's figures, uniformly, on every control row — a subpixel offset, not a
disagreement. The column is unchanged at 152 in both.

Chips at the same viewport, which is what settles §3: `Tempat Tinggal` **171**, `Belanja
Harian` **162**, `Kesehatan` 136, `Transport` 131, `Tagihan` 117, `Lainnya` 115, `Hiburan`
114. Against the 188 today's column leaves them, and the 150 a 190 px column would.

### 6c. What was deliberately not committed

The harness is a scratchpad script, not a repo tool. Making it one means adding
`playwright-core` as a devDependency and a CI job with a browser download, which is a bigger
decision than this card — and the guard this card ships (§4b) needs no browser to work. If
that dep is ever wanted, this is the file to resurrect; it is the only thing that has ever
measured a rendered width in this repo. `npm install --no-save playwright-core` was used, and
`git diff package.json package-lock.json` was checked empty afterwards.
