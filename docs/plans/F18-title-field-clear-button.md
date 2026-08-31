# F18 — the clear button on both `Judul` fields

**Card:** [#14](https://github.com/miftahulmahfuzh/expense-tracking/issues/14) ·
**Round 1** · branch `task/14-tombol-clear-text-di-field-judul-juga`

The follow-up F17 was built for. F17 put `onClear` + `clearLabel` into `Input`
(`components/ui/Field.tsx`) as an opt-in union type and shipped it on `/new`'s item `Nama`
fields; this card spends that capability on the two fields labelled `Judul`. No design-system
change — both call sites are two props.

## The one real decision: does `/e/[id]` get it too?

The card names this and leaves it open ("It may be right to ship `/new` only and leave this one
alone"), because the editor's `TitleField` commits on blur and its blur handler **reverts
silently on empty**:

```
// An empty title is not a valid title, client-side or server-side. Revert silently
// rather than showing an error for something the user can see they just did.
```

So the worry is: tap ✕, tap elsewhere, the old title comes back unexplained.

**Decision: ship both.** The ✕ does not introduce that state. `TitleField` already reaches
empty-then-blur every time someone holds backspace over the title, and the silent revert is the
answer that was deliberately chosen for it and written down at the point of decision. A ✕ is a
*faster route to a state the field already handles by design*; whether that answer is right is a
question this card did not ask and would be reopening for free.

Two things make the good path the likely one, and both are already in `Input`:

- the button `preventDefault`s its `mousedown`, so the tap never blurs the field — clearing
  cannot itself trigger the revert;
- `onClick` then refocuses with `focus({ preventScroll: true })`, so the keyboard stays up and
  the natural continuation is typing, which commits normally.

Which is to say the ✕ on this field reads as **"start retyping"**, and the field is left focused
and empty saying exactly that.

## Approaches considered

| # | Approach | Verdict |
|---|---|---|
| **A** | **Both fields, plain `onClear`** | **Chosen.** Smallest change that satisfies the card; both call sites go through the path typing already goes through. |
| B | `/new` only | Rejected. Two fields carry the label `Judul` and the card names the field, not the screen. It would also ship the same label with two different affordances, which is the inconsistency F17's design-system placement existed to avoid. |
| C | Both fields, plus rework `TitleField`'s empty-blur to show an error instead of reverting | Rejected. The error would fire on plain backspace-to-empty too, so it reverses a decision this card never asked about, and it turns two lines into a validation redesign — failing Scope and Reversibility both. |

Scored against the four criteria: **Convention** — A is literally the shape `ItemRow.tsx:86`
ships. **Scope** — A is four lines across two files. **Verifiability** — the gate's existing
`Input` tests cover the button's mechanics; the call sites are covered by the same suites that
already cover title editing. **Reversibility** — one commit, and removing a prop pair is a
compile-checked removal.

## Ambiguity call (recorded per the loop's 4c)

The narrow reading of "tambahin tombol ✕ juga di field **Judul**" is *the field*, and there are
two of them. The competing reading — "only the `/new` one, since that is the parser-filled twin
of the `Nama` fields #11 fixed" — loses because the card's own body walks through *both* call
sites and asks about the second rather than excluding it. If the editor's ✕ turns out to be
unwanted, deleting two lines from `TitleField` is the whole reversal.

## Changes

1. **`app/(bare)/new/ReviewStage.tsx`** — `<Input id="draft-title">` gains
   `onClear={() => props.onTitleChange('')}` and `clearLabel`. Goes through the same single
   `onTitleChange` path typing does, so the draft reducer, the localStorage draft and
   `validate.ts` see it as they see a deletion.
2. **`app/(bare)/e/[id]/ExpenseEditor.tsx`** — `TitleField`'s `<Input>` gains
   `onClear={() => setDraft('')}` and `clearLabel`. Local draft only; no commit, no remount, so
   the `key={`title:${optimisticMeta.title}`}` resync contract is untouched.

`clearLabel` is `Kosongkan judul` on both — `Kosongkan`, not `Hapus`, following `ItemRow`'s note
that `Hapus` is reserved for the destructive neighbour. There is no destructive neighbour on
either Judul field, but the verb should mean one thing across the app.

## `TitlePresets`, which the card flagged as unlooked-at

Checked, and both interactions are already correct — neither needs a change:

- `/new`: `TitlePresets value={draft.title} onPick={props.onTitleChange}`. After a clear,
  `value` is `''`, so `active` (`value.trim() === preset`) is false on every chip and the row
  simply shows no highlight. Tapping one writes through `onTitleChange`, the same callback the
  ✕ just used.
- `/e/[id]`: `TitlePresets value={draft} onPick={pick}`. After a clear, `draft` is `''` and
  `value` is still the old committed title, so `pick` runs `setDraft(preset)` and — since
  `preset !== value` unless the preset *is* the current title — commits. Clearing then tapping a
  preset is a normal rename. The one edge, clearing and re-tapping the chip that was already
  active, correctly restores the box's text with no write.

## Verification

The repo's CI gate (`.github/workflows`), run in the worktree, plus a read of the diff against
`Input`'s docblock — specifically that neither call site passes `disabled` in a way that would
leave a live clear button on a busy form (`/new` passes `disabled={saving}` to the input, and
`Input` already gates `showClear` on it; `/e/[id]`'s title field has no disabled state).
