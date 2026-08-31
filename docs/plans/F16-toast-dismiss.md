# F16 — the Urungkan toast has no way out but waiting

Card: [#10](https://github.com/miftahulmahfuzh/expense-tracking/issues/10) · round 1 · 2026-08-31

> in Urungkan notification, add x (close button) so user can quickly close the notification

## 1. What is wrong

`components/ui/Toast.tsx` renders a yellow sticker with a message and, optionally, one action
button. There is **no dismiss affordance in the UI at all**. The only exits are the
`duration ?? 5000` timer and the programmatic `dismiss()` that `ToastApi` already exposes and
that nothing outside the provider calls.

That is worst on exactly the toast the card names. `ITEM_DELETED_TOAST` is shown with
`UNDO_DURATION_MS` — 7 s, deliberately longer than the default because "5s is not enough to
read, decide and reach" (`app/(bare)/e/[id]/copy.ts`). So the user who reads it, decides *no,
I did mean to delete that*, and is done with it has to watch a sticker sit over the tab bar
for the remaining ~6 s. The undo window is a kindness on the way in and a wait on the way out.

Nothing new is needed to fix it: `dismiss()` exists, is stable (`useCallback`), and is already
what the action button calls after `onAction()`. This is a rendering + a11y change.

## 2. The decision the card left open, and how it was settled

The card recorded one open question: does the ✕ appear on **every** toast, or only on the ones
carrying an action?

**Chosen: only on toasts that carry an action.** Three pieces of evidence from this repo, not
taste:

1. **The card's words.** "in Urungkan notification" names the toast with an action. The
   narrowest reading that fully satisfies it is the conditional one.
2. **This design is minimal about dismiss chrome.** `Sheet` — the app's other overlay — ships
   `showCloseButton` defaulting to **false**, with the reason in its own docblock: "The design
   specifies no close button — the grabber plus a scrim tap". A ✕ is something this app adds
   where it earns its place, not everywhere by reflex.
3. **Only an action toast makes dismissal a decision.** Every other toast in the app
   (`Tersimpan`, `SHARE_COPIED_TOAST`, `REVOKED_TOAST`, the four `tone: 'danger'` failures) is
   a statement that expires in 5 s; a ✕ there saves a couple of seconds and costs 32 px of a
   382 px row. On the undo toast, dismissing *is* an act — it closes the undo window early and
   says "I meant it".

**The loser: ✕ on every toast.** It reads as more consistent, and consistency is a real
argument — a control that appears only sometimes is a moving target. It lost to 1 and 2, and it
is a one-line change (`{toast.action && …}` → unconditional) if the user says otherwise on the
card. Recorded here rather than argued away.

Two more shapes were considered and dropped, both because the card asked for a **visible**
control:

| Rejected | Why |
|---|---|
| Swipe-to-dismiss | Invisible. Nothing on a 414 px sticker advertises it, and the card asked for an `x`. |
| Tap anywhere on the toast dismisses | The sticker's only other target is `Urungkan`. A near-miss would kill the undo window instead of using it — the one outcome that is not recoverable. |

## 3. The change

### 3a. `components/ui/Toast.tsx` — a third flex child

```tsx
import { CloseIcon } from './Icon'
```

A **sibling** import, not through `components/ui/index.ts`, for the reason `Sheet.tsx` already
records: the barrel re-exports this file, so going through it is a cycle.

Inside the sticker, after the action button and in the same `{toast.action && …}` region:

```tsx
<button
  type="button"
  onClick={dismiss}
  aria-label="Tutup"
  className="touch-target grid size-8 shrink-0 press place-items-center text-[#0d0d0d]"
>
  <CloseIcon />
</button>
```

Four choices in that one element, each forced by something already in the repo:

- **`shrink-0`** — F15's lesson, applied before it can bite. The message is `min-w-0 flex-1`, so
  it absorbs every pixel of pressure by wrapping; both trailing controls are floored at their
  own size and cannot be pushed off the sticker by a long item name.
- **`touch-target grid size-8`**, not `Sheet`'s painted `size-touch`. Both idioms are in this
  repo — `touch-target` expands a small control to the 44×44 floor without changing its painted
  size, and globals.css names Chip, the row delete affordance and the month chevrons as its
  users. A sheet header has width to spare; this row does not. Budget on a 414 px screen:
  `pl-4` 16 + gap 12 + `Urungkan` (14 px/900 ≈ 78 + `px-3` 24) + gap 12 + 32 + `pr-2` 8 = 182 px
  of overhead, leaving ~200 px for a message that measures ~90 px at `text-chip`. A painted
  44 px box spends 12 px more and pushes the glyph 35 px from the action's text.
- **`text-[#0d0d0d]`**, the literal near-black, never `text-ink*`. The sticker is yellow in
  **both** schemes — the component's docblock is explicit that it does not flip with the theme —
  so `ink` would invert to white in dark mode and the ✕ would vanish. It stays near-black on a
  `tone: 'danger'` toast too: the ✕ is chrome, not the message, and `#8a1410` is the colour of
  what went wrong.
- **`gap-3` left as it is** — no negative margin pulling the ✕ toward `Urungkan`. ~29 px between
  the label's last glyph and the ✕ looks loose in a screenshot and is correct on a thumb: a
  mistap on ✕ when reaching for `Urungkan` loses the undo permanently, while a mistap the other
  way costs nothing. The two hit areas end up ~6 px apart, which is the separation that asymmetry
  deserves.

**Copy: `Tutup`, verbatim from `Sheet.tsx:163`**, and hardcoded here rather than added to
`app/(bare)/e/[id]/copy.ts`. That file's first line is "Every string `/e/[id]` renders, in one
file", and this string is rendered by `components/ui` on every route; `components/share/copy.ts`
independently spells the same word `CLOSE_CTA = 'Tutup'`, so the vocabulary is already settled
and R-40 is not in play.

**Accessibility, stated rather than assumed.** The button sits inside the always-mounted
`role="status" aria-live="polite"` wrapper, so a screen reader announcing a new toast will read
"Item dihapus, Urungkan, Tutup". That is accepted: the alternative is `aria-hidden`, which would
hide the dismiss from precisely the user who most benefits from not being forced to wait out a
timer they cannot see. One extra word is the right trade.

**Not touched:** no Escape-key handler (this is a phone-first app and the toast traps nothing),
no `dismissible` prop (an option with one call site is an API nobody asked for), no change to
`ToastApi`, no change to any of the 13 `toast.show(…)` call sites.

### 3b. `tests/toast.dismiss.contract.test.ts` — a source contract

Source assertions, not renders, for the reason `tests/rows.truncation.contract.test.ts` and
`tests/photos.lightbox.contract.test.ts` both give: the suite runs on `environment: 'node'`, and
jsdom has no layout engine — `clientWidth` is 0 for everything, so a component test cannot see a
control pushed off a row and would report the bug as passing. What ships is the source.

The five properties worth freezing are the five that a later edit would break **silently** —
each one still renders, still typechecks, and is wrong:

1. the dismiss button **exists** and is named `Tutup` (not a new synonym);
2. it carries **`shrink-0`**, so it can never be squeezed off the sticker;
3. it reaches the **44 px floor** (`touch-target`, `size-touch` or `min-h-touch` — any of the
   repo's three idioms passes; none of them is not an option);
4. its colour is the **literal near-black**, never a `text-ink*` token that inverts;
5. it is wired to the provider's own **`dismiss`** and not to the action's handler — the one
   mis-wiring that would undo the delete while looking identical on screen.

A sixth assertion covers the glyph: `<CloseIcon />` imported from `./Icon`, which is the positive
half of what `icon.contract.test.ts` forbids from the other side.

**Deliberately not asserted:** that the control is conditional on `toast.action`. That is the
design call in §2, it is one line to reverse, and freezing it would make a legitimate product
decision read as a regression.

`Toast.tsx` composes its classes through `cn(…)` rather than as one literal attribute, so the
test slices the enclosing `<button …>` element around `aria-label="Tutup"` instead of regexing
`className="…"` the way the F15 contract does.

## 4. Measured

Same method as F15 §3, for the same reason: no repo tool measures a rendered width, `vitest`
runs on `environment: 'node'`, and jsdom reports `clientWidth: 0` for everything. So the sticker
was rebuilt standalone — every utility expanded to its declaration out of `app/globals.css`
(`--yellow` `#ffe600`, `--radius-field` 8, `--spacing-touch` 44, `--container-app` 416,
`--text-chip` 14/18/700) — and measured in the Chromium at
`~/.cache/ms-playwright/chromium-1234`, driven with `--headless --dump-dom`, at a 414px viewport
less the wrapper's own `px-4`. Three rows: the short message, the long one, and the **shipped
markup with no dismiss control** as a control.

| row | sticker | `scrollW − clientW` | height | message | lines | ✕ box | ✕ inset from right edge | hit area | hit-area gap to `Urungkan` |
|---|---|---|---|---|---|---|---|---|---|
| `Item dihapus` | 382 | **0** | 68 | 212.7 | 1 | 32 | 8 | **44 × 44** | 6 |
| `"tanamera draft white caramel" dihapus` | 382 | **0** | 68 | 212.7 | **2** | 32 | 8 | **44 × 44** | 6 |
| control — same message, no ✕ | 382 | 0 | 68 | 256.7 | **2** | — | — | — | — |

Four things that settles:

1. **Nothing overflows.** `scrollWidth == clientWidth` on every row, and the ✕ sits 8px inside
   the sticker's right edge — its `pr-2`, exactly where its neighbours land. The 44px the control
   costs comes out of the message (256.7 → 212.7), which is the child that is supposed to pay.
2. **The worst message this app can produce still costs nothing extra.** F15's own overflow
   string wraps to two lines *with or without* the ✕, and the sticker's height does not move
   either way: the action button's `min-h-touch` already sets it at 68px, so two lines of 18px
   fit inside the height the toast had anyway.
3. **The tap floor is real, not nominal.** `getComputedStyle(el, '::after')` returns
   `44px × 44px` on a 32px painted box — `touch-target` doing what globals.css says it does.
4. **The colour rule is not a preference.** `#0d0d0d` on `#ffe600` is **15.34:1**. The same glyph
   wearing `text-ink` would be `#f7f7f5` on `#ffe600` in dark mode — **1.18:1**, which is a ✕
   nobody can see, rendering and typechecking perfectly. That is the number §3a's rule exists
   for, and it is what test 4 in §3b freezes.

As in F15, the harness is a scratchpad page rather than a repo tool, it needed no dependency, and
absolute text widths are approximate — the harness has a metric-compatible fallback face, not the
self-hosted Archivo. Nothing above depends on them: the overflow, the hit area and the contrast
are font-independent.

## 5. Verification

### 5a. The repo's own gate — passed

`.github/workflows/ci.yml`, every step, in order, in the worktree:

| step | result |
|---|---|
| `npm ci` | clean from the committed lockfile |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | `next typegen` + `tsc --noEmit`, exit 0 |
| `npm test` | **53 files passed, 2 skipped · 932 tests passed, 17 skipped** |
| `npm run db:check` | `Everything's fine 🐶🔥` |
| `npm run build` | compiled, all 17 routes listed, `/dev/ui` still `ƒ` |
| `npm run format:check` | `All matched files use Prettier code style!` |

`format:check` failed on the first run against the new test file and was fixed with
`prettier --write` on that one file; the table above is the re-run.

### 5b. The guard was watched to fail

A test that has never failed is a test that might be asserting nothing. Each property was broken
in `Toast.tsx` in turn, the suite run, and the file restored:

| mutation | result |
|---|---|
| `shrink-0` deleted from the ✕ | **1 failed** — "is floored at its own size" |
| `text-[#0d0d0d]` → `text-ink` | **1 failed** — "painted in the literal near-black" |
| `touch-target` deleted | **1 failed** — "reaches the 44px tap floor" |
| `onClick={dismiss}` → `onClick={() => toast.action?.onAction()}` | **1 failed** — "calls the provider's dismiss" |
| restored | 6 passed |

### 5c. What the gate cannot see, stated plainly

The gate proves the app compiles, the routes render and 932 assertions hold. It does **not** prove
anyone tapped this ✕ — CI's own header says as much, and F12's carousel is the standing example.
The evidence that the control lands where §3a claims is §4's Chromium measurement; the standing
protection is §3b's source contract, which needs no browser.

**Not verified against the deployed app.** The undo toast lives on `/e/[id]`, which needs a real
login and a real expense group. `/dev/ui`'s "Toast dengan Urungkan" button
(`app/(shell)/dev/ui/KitchenSink.tsx:256`) renders this exact shape and is the fastest place to
tap it once this is deployed.

### 5d. Local environment note

The gate cannot run under this machine's default `node` — v20.11.1, where the lockfile's
`rolldown` needs `node:util`'s `styleText` (Node ≥ 20.12) and vitest dies at startup. It was run
on **Node 24.18.0** from `~/tools/node-v24.18.0-linux-x64/bin`, which is also the major CI pins
(`node-version: '24'`, matching Vercel). Worth knowing before reading a startup error as a code
failure. `node_modules` must be installed by that same Node: an `npm ci` run under 20.11.1 leaves
`@rolldown/binding-linux-x64-gnu` out and vitest then fails with "Cannot find native binding".

### 5e. What was deliberately not committed

`npm install` in the fresh worktree rewrote `package-lock.json` (512 insertions, 144 deletions of
optional platform bindings). Reverted with `git checkout -- package-lock.json` before committing,
and `node_modules` reinstalled from the committed lockfile so the gate above ran against what CI
will run against. The measurement harness is a scratchpad file, not a repo tool.
