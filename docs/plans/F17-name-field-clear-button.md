# F17 — a ✕ inside the item Nama field, so a wrong name is one tap instead of twenty backspaces

**Card:** [#11](https://github.com/miftahulmahfuzh/expense-tracking/issues/11) · **Round 1** · 2026-08-31
**Branch:** `task/11-tombol-clear-text-di-field-nama-saat` off `fa8e441`

> **F17, not F16.** This was written and built as F16. Card #10's toast-dismiss work landed on
> `main` under that same label while this branch was in the gate — parallel sessions, one
> counter, no lock. `F16-toast-dismiss.md` merged first, so it keeps the number and this one
> moved. Nothing in either plan changed but the label.

## 1. The ask, and where it actually lands

> Saat bikin item baru, tambahkan tombol ✕ (clear text) di field **Nama**, biar user nggak
> perlu tekan backspace berulang-ulang di keyboard.

The field is `/new`'s review-table row — `app/(bare)/new/ItemRow.tsx`, the `<Input
id="item-<key>-name">` inside `<Field label={`Nama ${label}`} hideLabel>`. That is the one
Nama in the app arriving **pre-filled by someone other than the user**: F04 parses the pasted
receipt and writes a name per row, so the common act on this screen is *replacing* a name the
LLM guessed, and replacing means holding backspace over 20-odd characters on a phone.

### Scope: this row only, and that is the narrow reading on purpose

Two other Nama-ish fields were considered and left alone:

| Field | Why not |
|---|---|
| `app/(bare)/e/[id]/ItemSheet.tsx`, `initial === null` — literally "Tambah item" | Its Nama starts **empty by construction**. There is nothing to clear on the surface whose name most resembles the card's wording. Its other mode is an *edit*, which is not "bikin item baru". |
| `Judul` on `/new` | Also parser-filled and also backspace-heavy — but the card says "in Nama field". |

Both are now **one prop away** (§3 puts the capability in the shared control), which is the
point of building it there rather than in the row. If the user meant either, it is a two-line
round 2 rather than a redesign.

## 2. The problem the card already flagged: there is a second ✕ 8px away

`ItemRow` renders, today:

```
<div class="flex items-start gap-2">
  <div class="min-w-0 flex-1"> … <Input id="item-<key>-name"> … </div>
  <button class="flex size-touch shrink-0 press …" aria-label="Hapus {name}">
    <CloseIcon/>                        ← 22px glyph, 44×44 box, DELETES THE WHOLE ITEM
  </button>
</div>
```

So a clear-✕ at the input's right edge lands ~8px (`gap-2`) from a **destructive** ✕. Two
marks, same glyph, different consequence, adjacent. Resolving that is most of this plan.

**The resolution is scale plus containment, and it is measurable rather than tasteful:**

| | painted glyph | box | sits |
|---|---|---|---|
| clear (new) | `xs` — 14px | 44 × 50, ending **at the input's right edge** | *inside* the field well |
| delete (unchanged) | `md` — 22px | `size-touch`, 44 × 44 | outside it, past the well's boundary |

14 against 22 is a 1.57× ratio at a glance; the well's own edge runs between them; and the
new button is flat `text-ink-3` chrome inside a filled field rather than a control floating on
paper. Three separations, none of which is colour.

### The one thing that must NOT be used here: `touch-target`

`@utility touch-target` (globals.css) is this repo's normal answer for a small control that
needs 44px — "expands a visually-small control to a 44×44 hit area **without changing its
painted size**", via an `::after` that is `translate(-50%,-50%)` centred on the button. Applied
to a 14px glyph parked ~14px inside the field's right edge, that pseudo-element's 44px reaches
about 15px **past** the input's edge — across the `gap-2` and into the delete button's own 44px
area. Overlapping hit areas between a harmless action and a destructive one is the single
failure this row cannot have, and it would be invisible in review because nothing paints.

So the clear button is a **real 44px-wide box** (`w-touch`) inside the input instead, glyph
right-aligned at the field's own `pr-3.5` inset. Its hit area stops exactly where the input
does. Both controls clear the 44px floor (R-41) and neither reaches into the other.

## 3. Approaches

### A — an opt-in `onClear` on the shared `Input` ✅ chosen

`components/ui/Field.tsx` gains `onClear` + `clearLabel`. With `onClear` absent, `Input`
renders the same bare `<input>` it does today; with it, the input is wrapped in a `relative`
div and the button is positioned inside it.

- **Convention** — `components/ui/index.ts`: "Never write a raw `<input>`." `ItemRow`'s own
  docblock: "F05 ships ZERO shared components (R-33). Every control here comes from F10 …
  This file is layout, labelling and wiring only." New control chrome belongs in F10.
- **Scope** — one component, one prop pair; the two fields in §1 become one-liners.
- **Verifiability** — the a11y label is *structurally* required (§4), which a local
  implementation cannot promise.
- It also settles the padding correctly — see §5.

### B — a local wrapper and absolutely-positioned button in `ItemRow` ❌

Loses on two counts, and the second is a real bug rather than a style objection:

1. It inverts R-33 above: the row file starts owning field chrome.
2. It needs the input's right padding widened from the call site — `className="pr-touch"` on
   top of `CONTROL_CLASS`'s `px-3.5`. `lib/cn.ts` is a plain join with **no tailwind-merge**,
   so both classes ship and the **generated stylesheet's order** picks the winner — "neither
   the call site's order nor visible to the caller" (`Icon.tsx`). `cn`'s own docblock names
   the fix: expose a prop. That is approach A.

### C — the platform's own clear button: `type="search"` ❌

WebKit paints an `::-webkit-search-cancel-button`, so the feature looks free. It is not:
absent on Android Chrome (so the card's problem persists for half the users), unstyleable to a
2.5-stroke square-cap mark, and `type="search"` changes the control's semantics and the
`enterKeyHint="next"` this row depends on for its focus chain. Rejected before implementation.

## 4. `clearLabel` is required by the type, not by a review

```ts
type ClearProps =
  | { onClear: () => void; clearLabel: string }
  | { onClear?: undefined; clearLabel?: undefined }
```

An icon button with no accessible name is an unlabelled control, and `Icon.tsx` already
guarantees every glyph is `aria-hidden` — so the *only* name is the one the call site passes.
A discriminated union makes "clearable but unnamed" fail to compile, which is the same move
`Icon.tsx` made when it turned the stroke contract into props.

`ItemRow` passes `Kosongkan nama ${label}`, deliberately **not** re-using `Hapus`: the delete
button next to it is `Hapus ${label}`, and two buttons whose spoken names differ only in a
trailing word is exactly the confusion §2 is avoiding, transposed to VoiceOver.

## 5. Padding, without a precedence guess

`CONTROL_CLASS` carries `px-3.5`. A clearable input needs 44px on the right and 14px on the
left, so the class list would hold `px-3.5` **and** `pr-touch` — §3B's hazard, now inside the
component. Fixed by removing the conflict rather than resolving it:

```
CONTROL_BASE      … pl-3.5 …                 (no right padding)
CONTROL_CLASS     = CONTROL_BASE + ' pr-3.5' (exported, unchanged in effect)
clearable input   = CONTROL_BASE + ' pr-touch'
```

One padding declaration per side, always. `CONTROL_CLASS` keeps its exported meaning for the
"read-only display that must line up with a real field" its docblock promises.

## 6. Showing it, and keeping the keyboard up

Visible when **all three** hold: `onClear` was passed, the value is non-empty, the field is not
`disabled`. Not focus-gated — a button that appears on focus is a button that is not there when
the user reaches for it, and the row is already scanned rather than tabbed through.

Clearing does two things in order:

- `onMouseDown` → `preventDefault()`, so the tap never moves focus off the input. On iOS that
  is what stops the keyboard closing and reopening under the user's thumb.
- the click handler calls `onClear()`, then `input.focus({ preventScroll: true })` — for the
  case where the field was *not* focused (typed, scrolled away, came back and tapped ✕);
  `focus()` inside a click gesture raises the keyboard on iOS. `preventScroll` is not
  decoration: `ReviewStage`'s own comment records that a plain `focus()` "jumps the element to
  the nearest edge, and the nearest edge is frequently under the sticky bar".

That needs the `<input>` node, which the component did not have — the caller's `ref` was
spread straight through. `Input` now holds an internal ref and forwards to the caller's. No
behaviour change for existing callers: `ReviewStage` passes an inline arrow, whose identity
already changes every render, so the detach/attach churn (and `registerName`'s null branch
that absorbs it) is exactly what it was.

## 7. Tab order

DOM order gives: name → clear ✕ → delete ✕ → chip → amount. One extra stop per row, and the
clear button stays tabbable rather than `tabIndex={-1}` — the card asks for keyboard
reachability, and a focusable button is also what voice control matches against `aria-label`.

## 8. Measured, in a real browser

`vitest` runs on `environment: 'node'` with no jsdom, so **layout and interaction cannot be
asserted there** — the same wall F15's truncation contract and F12's icon contract hit. So the
geometry was measured instead: headless Chromium 150 over CDP at **414 × 896, DPR 2**, on
`/dev/ui`, against the clearable field this plan adds to the gallery.

| | measured | intended |
|---|---|---|
| field | 370 × 50 | `h-control` = 50 |
| `padding-left` / `padding-right`, button showing | 14px / **44px** | `pl-3.5` / `pr-touch` |
| `padding-right`, field empty | **14px** | back to `pr-3.5`, no dead gutter |
| button box | **44 × 50** | 44px floor (R-41), full field height |
| **button overflow past the field's right edge** | **0px** | 0 — §2's whole point |
| glyph | **14 × 14**, inset **14px** from the field edge | `xs`, on the field's own text inset |
| gap from where text stops to the glyph | 16px | — |

`touch-target` would have put that overflow figure at ~15px, inside the destructive delete's
44px. It is 0.

Behaviour, same session, on the real click path (`mousedown` then `click`):

| | measured |
|---|---|
| value before → after | `tanamera draft white caramel` → `` |
| **the `<input>` node survived the clear** | **yes** — §6's remount hazard does not fire |
| `mousedown` default prevented | yes, so the tap never blurs |
| focus held through the tap | yes |
| tapped while the field was **not** focused | value cleared, focus landed **on the input** |
| `window.scrollY` moved by the refocus | **0** — `preventScroll` holds |
| button when the field is empty | gone |

Then `tests/input.clear.contract.test.ts` pins the five invariants a later edit could silently
break, in the source-assertion style those two contracts established:

1. the gate is value + `onClear` + not-disabled (no always-on button);
2. the button carries `aria-label={clearLabel}`, and `clearLabel` is type-required;
3. the clear glyph is `size="xs"` while the row's delete glyph is not — §2's ratio;
4. no `touch-target` on the clear button — §2's overlap;
5. no `px-`/`pr-` pair in any one class list — §5's precedence hazard.

A measurement is not a regression test, which is why both exist: the numbers above prove the
geometry is right *today*, and the contract file is what notices when someone reaches for
`touch-target` or moves the early return.

Then the repo's gate: `lint`, `typecheck`, `test`, `db:check`, `build`, `format:check`.

`app/(shell)/dev/ui/KitchenSink.tsx` gains a clearable field in the `Field, Input, MoneyInput,
TextArea` section, because the gallery is where a control's states are looked at and a state
absent from it is a state nobody checks — F15's note that KitchenSink's deliberate 57-character
name is what should have caught the row bug cuts both ways.

## 9. Files

| File | Change |
|---|---|
| `components/ui/Field.tsx` | `CONTROL_BASE`; `InputProps & ClearProps`; internal ref; the button |
| `app/(bare)/new/ItemRow.tsx` | `onClear` + `clearLabel` on the name input |
| `app/(shell)/dev/ui/KitchenSink.tsx` | one clearable demo field |
| `tests/input.clear.contract.test.ts` | new — the five invariants |
| `docs/plans/F17-name-field-clear-button.md` | this file |
