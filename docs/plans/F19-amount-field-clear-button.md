# F19 — a ✕ in the Jumlah field, on the two surfaces where 44px exists, and measurably not on the third

**Card:** [#15](https://github.com/miftahulmahfuzh/expense-tracking/issues/15) · **Round 1** · 2026-08-31
**Branch:** `task/15-tombol-clear-text-di-field-harga-jumlah` off `4719e11`

> **F19, not F18.** This was written and built as F18. Card #14's `Judul` clear button landed on
> `main` under that same label while this branch was in the gate — parallel sessions, one counter,
> no lock, and `F18-title-field-clear-button.md` merged first, so it keeps the number. Exactly what
> happened to F17, which was built as F16. Nothing here changed but the label.
>
> Third in the series after F17 (#11, item `Nama`) and F18 (#14, `Judul`).

## 1. The ask

> Tambahin tombol ✕ (clear text) juga di field **harga** — the amount field, labelled `Jumlah`.

`juga` chains it to #11, which shipped on `/new`'s review row. But the amount field is not an
`Input`: `components/ui/MoneyInput.tsx` is its own component, so F17's `onClear` does not reach
it, and the 44px it needs has to come from somewhere. **That is the whole card**, and the answer
turned out to be different per call site.

## 2. What was measured, before deciding anything

Chromium 150 headless over CDP, **414 × 896, DPR 2**, on `/dev/ui`, against today's `MoneyInput`
— the same rig F17 used, and the numbers reproduce `docs/plans/F13-amount-field-clipping.md`
exactly rather than being quoted from it:

| | measured |
|---|---|
| well (gallery, full width) | 370 × 50, `pl` **14px**, `pr` **6px**, `gap` **10px**, border **1px** |
| static `Rp` span | **20px** |
| input `min-width` | **96px** (`min-w-[6rem]`), font 17px/700 Archivo, `tabular-nums` |
| text `500` | 30px |
| text `38.500` | 55px |
| text `450.000` | 66px |
| text `4.500.000` | **81px** |
| text `12.500.000` / `45.000.000` | **91px** each — `tabular` holds, so width is character count alone |
| text `999.999.999` | **100px** |

So a digit is 10px and a thousands dot 5px, and `/new`'s column arithmetic is confirmed:
`152 − 2 border − 14 pl − 6 pr − 20 Rp − 10 gap = 100px` of input.

### The consequence, which decides §4

`/new`'s row has **100px of input and 6px of right inset**. A 44px clear button can only be paid
for two ways, and both are already-known bugs:

| Pay with | What happens on `/new`'s row |
|---|---|
| **Reserved space** (`pr-touch` on the well, input shrinks) | input → **62px**. `4.500.000` needs 81. That is **issue #3, re-shipped** — a clipped `<input>` throws nothing and reads as a smaller number. |
| **An overlay** (input keeps 100px, glyph paints over it) | the glyph's 14px lands at 87px from the input's left edge at best. `4.500.000` (81px) clears by 6px; **`45.000.000` (91px) is 4px under it and `999.999.999` 14px under it** — the last digit is behind the ✕. F13 deleted a ~48px `IDR` badge from exactly this spot; the card is right that "a 44px ✕ is that badge again under a new name". |

Neither is acceptable, and the escapes were pre-rejected on measurement rather than taste:
widening the column to 190px takes it from the category chip (`Tempat Tinggal` measures 171px,
`Belanja Harian` 162, against the 150 they would be left) — F13 §2; and relaxing
`min-w-[6rem]` re-arms the silent-shrink that `scripts/f05-audit.sh` guards the class name for.

### `touch-target` is barred here TWICE, and the second one is new

F17 already found that `@utility touch-target`'s 44px `::after`, centred on a glyph inset in a
field's right edge, reaches ~15px **past** that edge — across `ItemRow`'s `gap-2` and into the
`size-touch` **delete** button's own hit area. On the amount field there is a second axis: row 2
sits `mt-2` (8px) below row 1, and the amount column (`ml-auto w-[9.5rem]`, x 188…340 in a 340px
row) is directly under the delete button (x 296…340). A 44px pseudo-element centred on a glyph
in a 50px-tall well overflows ~15px vertically too — through the 8px gap and into that same
destructive 44px box.

So the affordance is a **real `w-touch` box whose hit area stops where the well does**, exactly as
F17 concluded, and `touch-target` never appears near either control.

## 3. Approaches

### A — `clearLabel` on `MoneyInput`, and the component performs the clear ✅ chosen

One optional prop. Present → the button renders and the string is its accessible name; absent →
the component is byte-identical in behaviour to today. The click handler does both halves itself:
`setUnparseable(null)` **and** `onValueChange(null)`.

- **Convention** — `components/ui/index.ts`: "Never write a raw `<input>`"; `ItemRow`'s docblock:
  "F05 ships ZERO shared components (R-33) … This file is layout, labelling and wiring only."
  Control chrome belongs in F10's folder, which is where F17 put the `Input` half.
- **Scope** — one component plus one prop per call site.
- **Verifiability** — see §5: the failure mode of misusing it is a *visible* overflow, which is
  the failure `min-w-[6rem]` was chosen to produce. The a11y name is required by construction.
- **Reversibility** — deleting the prop and the button restores the file; no call site changes
  meaning.

### B — mirror F17's API exactly: `onClear` + `clearLabel` as a discriminated union ❌

The symmetric choice, and it loses on a difference that is structural rather than stylistic.

`Input` **had** to delegate: the caller owns `value` and the only way to change it is a real DOM
`input` event, which a component cannot synthesise — so `onClear` is the mutation, and the union
exists to stop it shipping unnamed. `MoneyInput` is **fully controlled by design** and already
emits `onValueChange(null)` when the field is emptied by hand (`handleChange`'s first branch),
and its docblock already promises the callback "fires as the field changes, **and when it is
cleared**". So here the component *can* clear, and if the caller is asked to do it instead the API
makes the card's own mechanical note — "a ✕ that only nulls the value would leave unparseable text
on screen" — into a thing a call site can get wrong. One optional prop cannot be half-wired.

The cost is accepted knowingly: two sibling controls in `components/ui/` have different clear
APIs, and a dev who reaches for `onClear` on `MoneyInput` gets a TypeScript error. That error
points at the right prop, which is a cheaper teacher than an unclearable escape hatch.

### C — ship it on `/new`'s row too, gated on focus ❌

The card floats this ("a focus-gated or narrower affordance may be the only thing that fits").
Rejected on the measurement in §2: focus changes *when* the glyph paints, not *where*. Tapping a
field holding `45.000.000` still puts a ✕ on its last digit, and `MoneyInput`'s `onFocus` select-
all means the value is highlighted underneath it. It also contradicts F17 §6 — "a button that
appears on focus is a button that is not there when the user reaches for it" — and would make the
same prop mean two different things on two rows.

### D — gate the button on the value's character count ❌

`≤ 9 characters` is precisely the set that clears the overlay. It is also an affordance that
disappears when the number gets big, i.e. exactly when a mistyped amount is most likely, and
nothing on screen explains why. Rejected as a worse bug than the one it dodges.

## 4. Scope: two call sites, and the third refused in writing

| Call site | Input width | Ships? |
|---|---|---|
| `app/(bare)/e/[id]/ItemSheet.tsx` — `Jumlah`, full-width in the edit sheet | 274px (F13), **236px** with the gutter reserved | ✅ |
| `app/(shell)/dev/ui/KitchenSink.tsx` — the gallery | 318px → **280px** | ✅ |
| `app/(bare)/new/ItemRow.tsx` — the review row | 100px → 62px, or overlaid | ❌ **no**, per §2 |

### The ambiguity call, stated because the user did not state it

The card says `field harga (Jumlah)` and lists three call sites without choosing; `juga` points at
#11, which was `/new`-only. **The narrow reading taken here is "the Jumlah field, wherever it is a
full-width editable amount".** The reading that lost is "`/new`'s review row specifically" — and it
lost to arithmetic, not to preference: there are 4px of slack in that column and the affordance
needs 44. If the user wants it there anyway, the honest options are a narrower category chip or a
two-line amount row, both of which are a different card. One sentence on #15 says so.

`ItemSheet`'s **Nama** stays non-clearable: that is F17 §1's decision on card #11's scope
("empty by construction" in add mode), not this card's to reverse.

## 5. Where the 44px comes from, and why the misuse is loud

`MoneyInput`'s well already carries an asymmetric `pr-1.5` — 6px, because "the value is
left-aligned and grows rightward, so the right inset is whitespace it eats into". Clearable, that
becomes `pr-touch`:

```
well  = 'glass flex h-control … pl-3.5'  +  (showClear ? 'pr-touch' : 'pr-1.5')
```

One right-padding declaration, never two — `lib/cn.ts` is a plain join with no tailwind-merge, so
a class list holding both would let the **generated stylesheet's** order pick the winner,
invisibly from the call site. This is F17 §5's hazard and F17 §5's fix, applied to a well instead
of an input.

The button's class list is `Input`'s, character for character:

```
absolute inset-y-0 right-0 flex w-touch press items-center justify-end pr-3.5 text-ink-3
```

`absolute` rather than a flex sibling **on purpose**, and this is the load-bearing half of the
design: the well is `relative`, the button is taken out of flow, and the 38px the gutter costs is
paid by the `flex-1` input. So on a container too narrow to afford it the input hits
`min-w-[6rem]` and the **well overflows where somebody sees it** — F13's chosen failure mode —
instead of the input quietly shrinking under its content, which is #3. A flex-sibling button would
have produced the same overflow, but it would end at the well's 6px `pr` and put the glyph 7px in,
half a glyph off every other field on the screen.

Painted at `xs` — 14px, the same as F17's — against the row delete's `md` 22px.

**One measured pixel of divergence from `Input`, and it is kept rather than corrected.** The glyph
lands **15px** from the well's outer right edge against `Input`'s 14: `Input`'s `relative` wrapper
sits *outside* the field, so `right-0` resolves to the border box, while here the `relative`
element *is* the bordered well and it resolves to the padding box, 1px further in. Clawing that
back needs `-right-px`, a magic offset for a pixel — and 15px is where this control's own prefix
already sits, since `border 1 + pl-3.5` puts the static `Rp` 15px from the left edge. The ✕ and
the `Rp` mirror each other, which is a better rule inside one field than a pixel of parity with a
different one.

## 6. Both halves of the state, which is the card's one mechanical note

```ts
onClick={() => {
  setUnparseable(null)      // the escape hatch: text no parser could read
  onValueChange(null)       // the value
  inner.current?.focus({ preventScroll: true })
}}
```

`unparseable` is component-local by construction — it exists precisely because the text has no
numeric value to derive from — so nothing outside can reset it. Clearing in this order matches
`handleChange`'s empty-string branch exactly, which is the path a hand-emptied field already
takes, so the reducer, the draft in localStorage and `validate.ts` see a ✕ as a deletion typed by
hand. `ItemSheet`'s own `unparsed` error state clears for free: its `onValueChange` already does
`setUnparsed(null)`.

Focus handling is F17 §6's, unchanged and for the same two reasons: `onMouseDown` →
`preventDefault()` so the tap never blurs (on iOS a blur closes the keyboard under the thumb), and
`focus({ preventScroll: true })` in the click handler for the tap that arrives while the field is
*not* focused — plain `focus()` "jumps the element to the nearest edge, and the nearest edge is
frequently under the sticky bar" (`ReviewStage`). That needs the `<input>` node, which this
component did not hold; it gains an internal ref and forwards the caller's, as `Input` does.

**No remount hazard here, and it is worth saying why not.** F17's `Input` had to keep its wrapper
`<div>` unconditional, because gating it on the button's visibility swaps `input` → `div` at that
position and React remounts the field mid-typing. `MoneyInput`'s well is *already* an
unconditional `<div>` and the button is appended **after** the `<input>`, so the input's index
among its siblings is 1 whether the button is there or not. Nothing can remount.

## 7. Showing it

Visible when all three hold, mirroring F17 §6: the field is clearable (`clearLabel` was passed),
it is not `disabled`, and **`text !== ''`** — where `text` is the component's existing
`unparseable ?? formatIdrDigits(value)`. Using `text` rather than `value !== null` is the point:
the ✕ must be there for a paste of garbage, which is the state with no value at all and the one
the user is most stuck in.

## 8. Tests

`vitest` runs on `environment: 'node'` with no jsdom, so layout, hit areas and stylesheet order
cannot be asserted — the wall F12's icon contract, F15's truncation contract and F17's clear
contract all hit. `tests/money-input.clear.contract.test.ts` therefore pins the source, in their
style, plus the one thing no other file records:

1. the gate is `clearLabel` + not-disabled + non-empty **`text`**, so the escape hatch is covered;
2. the button carries `aria-label={clearLabel}` and is `<CloseIcon size="xs" />`;
3. no `touch-target` anywhere in the file — §2's two-axis overlap;
4. exactly one right padding on the well, via the ternary — §5;
5. the click handler resets **both** halves, in `handleChange`'s order — §6;
6. `min-w-[6rem]` is still there, positively (f05-audit only forbids `min-w-0`);
7. **`/new`'s `ItemRow` passes no `clearLabel`** — §4's refusal, with the arithmetic in the
   comment, so "let's just add it there too" is a red test rather than a shipped regression.

Then the repo's gate: `lint`, `typecheck`, `test`, `db:check`, `build`, `format:check`, plus
`scripts/f05-audit.sh`, and the geometry re-measured on the same rig (§9).

`KitchenSink` gains a clearable Jumlah beside the plain one — the plain one is `/new`'s shape and
has to stay visible — because a state absent from the gallery is a state nobody checks.

## 9. Measured after the change

Same rig, same session, `/dev/ui` at **414 × 896, DPR 2** — the gallery now holds the plain
`MoneyInput` (`/new`'s shape) and the clearable one side by side, so both columns are one render:

| | plain | clearable | intended |
|---|---|---|---|
| well | 370 × 50 | 370 × 50 | unchanged |
| well `padding-right` | **6px** | **44px** | `pr-1.5` / `pr-touch`, one declaration |
| input width | **318px** | **280px** | the gutter costs 38, paid by `flex-1` |
| well `position` | — | **relative** | the button's containing block |
| button box | — | **44 × 48** | 44px floor (R-41), the well's inner height |
| **button overflow past the well** | — | **−1px** | ≤ 0 — it ends *inside* the border |
| glyph | — | **14 × 14**, inset **15px** | `xs`, mirroring `Rp`'s own 15px |
| gap from where `999.999.999` ends to the glyph | — | **196px** | no contact, at the widest value there is |

`padding-right`, and the input, go **back to 6px / 318px the moment the field is emptied** — no
dead gutter, verified in the same run.

Behaviour, on the real click path (`mousedown` then `click`) with the field **not** focused:

| | measured |
|---|---|
| value before → after | `45.000.000` → `` |
| **the `<input>` node survived the clear** | **yes** — §6's remount hazard cannot fire here |
| `mousedown` default prevented | yes, so the tap never blurs |
| focus landed on the input | **yes** |
| `window.scrollY` moved by the refocus | **0** — `preventScroll` holds |
| button when the field is empty | gone |
| **button after pasting `abc`** | **still there** — §7's `text` gate, the state with no value |

### One thing this run found that is NOT this card's to fix

`MoneyInput`'s red error border **has never painted**, and it predates this card — the plain field
shows it too. The well's class list carries `border-transparent` *and*, when invalid,
`border-red-ink`; `lib/cn.ts` has no tailwind-merge, so both ship and the generated stylesheet
picks. Measured in the same session: `border border-red-ink` alone computes
`rgb(179, 22, 16)`, and `border border-transparent border-red-ink` computes
`rgba(0, 0, 0, 0)`. `Field.tsx` is immune by accident of syntax — it uses the
`aria-[invalid=true]:border-red-ink` *variant*, which outranks a bare utility — which is why
`Input` and `TextArea` do go red.

It is the same hazard as §5, two classes over, and the fix is the same shape (one border-colour
declaration, chosen by a ternary). It is deliberately **not** in this diff: it is a visible change
to the error state of a field this card only adds a button to, and it deserves its own card and its
own verification rather than arriving attributed to a ✕. Filed separately.

## 10. Files

| File | Change |
|---|---|
| `components/ui/MoneyInput.tsx` | `clearLabel`; `relative` well; the `pr` ternary; internal ref; the button |
| `app/(bare)/e/[id]/copy.ts` | `ITEM_AMOUNT_CLEAR` |
| `app/(bare)/e/[id]/ItemSheet.tsx` | one prop on the Jumlah field |
| `app/(shell)/dev/ui/KitchenSink.tsx` | a clearable Jumlah demo |
| `tests/money-input.clear.contract.test.ts` | new — the seven invariants |
| `docs/plans/F19-amount-field-clear-button.md` | this file |
