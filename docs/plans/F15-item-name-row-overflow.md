# F15 — a long item name pushes the amount and the delete target off the Detail card

**Card:** [#8](https://github.com/miftahulmahfuzh/expense-tracking/issues/8) · **Round 1** · 2026-08-30
**Branch:** `task/8-long-item-names-push-the-amount-and` off `2bb9710`

## 1. What is wrong

On `/e/[id]`, the item **"tanamera draft white caramel"** renders its name in full and takes
the space out of its neighbours: the amount loses the gap it should have, and the 44px delete
target is shoved past the card's right edge and clipped. Every other row on the same card
lines its amount up on a rail; this one does not.

The name is never ellipsised — which is the tell. `truncate` has been on that span since
2026-08-19 (`b905839`), so the row was *supposed* to clip and did not.

## 2. Why the existing `truncate` does nothing

`truncate` is `overflow:hidden; text-overflow:ellipsis; **white-space:nowrap**`. That last
declaration is the mechanism:

> With `white-space: nowrap` there are no soft-wrap opportunities, so the span's **min-content
> size equals its max-content size** — the whole string.

`min-w-0` on the span lets the *span* shrink. It does **not** shrink the span's min-content
*contribution* to its container: `min-width` is a floor, not a ceiling, so clamping a
min-content size by `0` leaves it exactly where it was.

Now the row, as shipped:

```
<li  class="flex items-stretch">                        ← block-level flex container
  <button class="flex min-h-row flex-1 …">              ← flex ITEM *and* flex CONTAINER
    <CategoryDisc/>                                     ← 28px, shrink-0
    <span class="min-w-0 flex-1 truncate">{name}</span>
    <Money/>                                            ← whitespace-nowrap
  </button>
  <button class="grid size-touch shrink-0">×</button>   ← 44px
</li>
```

That `<button>` is the only element in the chain that is simultaneously a flex item and a
row flex container, and it has no `min-w-0`. So its own `min-width: auto` resolves to its
content-based minimum — which, by the paragraph above, includes the full 208px name. It
refuses to shrink below that, overflows the `li`, and pushes the `×` out. The span then
receives exactly the width it asked for and has nothing to ellipsise.

**The three sites that render the same content correctly are all flat.** In
`app/(bare)/s/[token]/page.tsx`, `app/(shell)/dev/ui/KitchenSink.tsx`,
`app/(shell)/m/[month]/GroupRow.tsx` and `app/(shell)/stats/BiggestExpenseTile.tsx` the flex
container is block-level (an `li`, a `Link`) with a definite width, so nothing floors it.
KitchenSink even ships a deliberate 57-character name — `sewa unit 12F yang judulnya sengaja
dibuat sangat panjang` — and clips it correctly, which is why the gallery never showed the
bug the real screen has. `CategoryBreakdown.tsx` nests one flex row inside a `flex-col`; the
automatic minimum applies to the **main** axis only, so a column parent stretches its child's
width and floors nothing.

Detail is the only nested row in the app. It is the only broken one.

## 3. Measured

No repo tool measures a rendered width (see F13 §6c), so the row was rebuilt standalone —
the utilities above expanded to their declarations out of `app/globals.css`
(`--spacing-gutter` 22, `--spacing-touch` 44, `--spacing-row` 52, `--spacing-disc` 28) and
Tailwind v4 defaults — and measured in the Chromium at
`~/.cache/ms-playwright/chromium-1234`, in a 370px content box (a 414px viewport less the
`px-safe` gutters), the shipped markup rendered **beside** the fix as a control:

| row | `row.scrollWidth` | `row.clientWidth` | name `clientW`/`scrollW` | ellipsis | `×` right edge |
|---|---|---|---|---|---|
| shipped — `flex-1`, no `min-w-0` | **376** | 348 | 208 / 208 | **no** | **392** |
| fixed — `flex-1 min-w-0` | 348 | 348 | 180 / 208 | **yes** | 364 |
| control — `mr. pho blok m`, fixed | 348 | 348 | 180 / 180 | no | 364 |

28px of overflow, and the `×` landing 28px past where its neighbours land: that is the
screenshot. The control row is the one that settles §4 — a name that already fits is
untouched by the fix, keeps every word, and puts its `×` on the same 364px rail as the
truncated row.

This measures the **mechanism**, not the app's exact pixel budget: the harness has a
metric-compatible fallback face rather than the self-hosted Archivo, so the absolute widths
are approximate. Nothing in the diagnosis depends on them — `scrollWidth > clientWidth` and
the presence of an ellipsis are font-independent. Unlike F13, this needed no npm dependency
at all: Chrome was driven with `--headless --dump-dom` and the measurements written into the
DOM by the page itself, so `package.json` and `package-lock.json` are untouched.

## 4. Why the card's own suggestion loses

The card asks for `len(words) >= 4` → first two words plus `..`, i.e. `tanamera draft..`.
Built as stated it would be a second, competing truncation system, and it is worse than the
one already here:

- **It does not fix the class of bug.** A three-word name that is long — `pertanggungjawaban
  administrasi keuangan` — passes the word test and blows the row out exactly as before.
  Whatever survives the word filter still has to fit, and nothing here makes it fit.
- **It clips names that fit.** `mr. pho blok m` is four words and renders perfectly today, in
  the same screenshot; the rule would cut it to `mr. pho..` for nothing. Word count and
  available width are simply different quantities.
- **It is the wrong lever at four call sites.** The other rows already truncate correctly; a
  shared helper would have to be threaded through all of them to keep one screen consistent
  with itself.

So the narrow reading is taken: *the name is too long **for the row***. Fixing the row gets
the user the ellipsis they drew — `tanamera draft white c…` — with the cut point chosen by
the space actually available instead of by a word count. **The wider reading — always cut at
two words regardless of fit — is recorded on the card**, so if that is genuinely wanted it
comes back as a comment and round 2.

`overflow-hidden` on the button was the third candidate. Same effect, but it establishes a
clipping boundary on an element carrying the `press` active-state transform and a focus ring,
and it is not the idiom the four sibling components use. `min-w-0` is the minimal lever.

### On F13, which deleted a `min-w-0`

F13 §4b replaced `min-w-0` with `min-w-[6rem]` on `MoneyInput`, because there `min-w-0` let an
`<input>` shrink below its content and **silently clip a number** — a row reading smaller than
it is. That is not reversed here, because the two cases differ in exactly the thing F13 cared
about: an over-shrunk `<input>` clips with no signal, while an over-shrunk `truncate` span
renders an **ellipsis**. F13's rule is "never let a value shrink into an invisible clip"; this
change lets a *label* shrink into a visible one. Both keep the amount readable, which is the
point of the rail.

## 5. The change

### 5a. `app/(bare)/e/[id]/ExpenseEditor.tsx` — `min-w-0` on the row button

One class, plus a docblock stating the mechanism, the measured numbers, and the fact that the
other three row sites are flat. The class is invisible in review and the next person to add a
row will reason about it locally, so the comment is the deliverable as much as the class is.

### 5b. `tests/rows.truncation.contract.test.ts` — a source contract

Modelled on `tests/photos.lightbox.contract.test.ts`, for the same stated reason: **jsdom has
no layout engine.** `clientWidth` is 0 for everything it renders, so a component test cannot
see an overflow or an ellipsis and would have called the broken row green — which is how this
survived eleven days with its fix one line above it.

Three assertions:

1. across all six row files, no `className` is a row flex container (`flex` + `flex-1`, not
   `flex-col`) without `min-w-0` — the general rule, which also catches the next row someone
   nests;
2. the Detail row button specifically still carries it, pinned separately so deleting the row
   makes the suite fail rather than making assertion 1 vacuously true;
3. every row file still renders something `truncate`, since `min-w-0` on the ancestor buys
   nothing without it.

## 6. What is deliberately not touched

No shared truncation helper, no change to `Money`, `Card`, `CategoryDisc` or the other five
row files — all four render sites already behave. `item.name` is never shortened in the data:
the sheet still edits the full string and `aria-label={`Hapus ${item.name}`}` still speaks it,
so the ellipsis is presentational only and a screen reader still hears the whole name.

## 7. Verification

### 7a. The repo's own gate — passed

`.github/workflows/ci.yml`, in order. `db:check` and `build` need the environment and a fresh
worktree has no `.env.local`, so both were run with CI's own dummy values from the workflow's
`env:` block, not with real credentials. Node 24 (`~/tools/node-v24.18.0-linux-x64`), matching
`setup-node`'s `node-version: '24'` — the shell's default is 20, on which `vitest` will not
even start.

| step | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **926 passed, 17 skipped** · 52 files passed, 2 skipped |
| `npm run db:check` | `Everything's fine` |
| `npm run build` | exit 0, all 17 routes listed, `/e/[id]` still `ƒ` |
| `npm run format:check` | `All matched files use Prettier code style!` |

`typecheck` earned its place: it failed the first run on §5b, where `[...matchAll()].map(m =>
m[1])` is `(string | undefined)[]` under `noUncheckedIndexedAccess`. Fixed with `?? ''`.

### 7b. The guard was watched to fail

A guard nobody has seen fail is not a guard (F13 §6a). `min-w-0` was removed from the row
button and the suite re-run: **2 failed, 6 passed**, and both failures named the offending
string rather than merely going red —

```
× ExpenseEditor.tsx: every flex-1 flex container also carries min-w-0
    + "flex min-h-row flex-1 press items-center gap-2.5 py-2 pr-1.5 text-left"
× the Detail row — the one that broke — still carries the class
    AssertionError: expected 'flex min-h-row flex-1 press items-cen…' to contain 'min-w-0'
```

`min-w-0` was then restored and the suite returns 8 passed.

### 7c. What the gate cannot see, stated plainly

**The gate passed on the broken commit and would pass on it again.** `vitest` runs on
`environment: 'node'`; nothing in this repo measures a rendered width, and jsdom reports
`clientWidth: 0` for everything. So §7a is evidence that the app still compiles and its logic
holds — it is *not* evidence that the row now truncates. That evidence is §3's Chromium
measurement, and the standing protection is §5b's source contract, which needs no browser.

Not verified against the deployed app: the fix is not deployed, and `/e/[id]` needs a real
login and a real group. The next screenshot of that screen is the only thing that closes
that gap.

### 7d. What was deliberately not committed

The measurement harness in §3 is a scratchpad page, not a repo tool, for the reason F13 §6c
gives. It needed no dependency — Chrome was driven with `--headless --dump-dom` — so unlike
F13 there was not even an `npm install --no-save` to undo. `npm install` in the fresh worktree
*did* rewrite `package-lock.json` (144 deleted lines of optional platform bindings); that was
reverted with `git checkout -- package-lock.json` before committing, since CI runs `npm ci`
and the lockfile is pinned.
