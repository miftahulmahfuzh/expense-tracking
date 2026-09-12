# F20 — Catatan's read-only view, and URLs inside it that are actually links

**Card:** [#18](https://github.com/miftahulmahfuzh/expense-tracking/issues/18) · **Round 1** · 2026-09-12
**Branch:** `task/18-catatan-view-mode-tanpa-terpotong-auto` off `ef402838ddb3`

## 1. The ask

> lihat expense item terbaru di prod
> 1. UI revamp, view catatan terpotong
> 2. bisa auto parse url ga ya? jadi pas view catatan itu kita bisa langsung klik url disana

Both points are one feature. Queried prod (`expense_groups`, newest by `created_at`) before
designing anything — reconciliation `verify-before-planning`, not a guess: the newest group,
"kosan baru" (2026-09-12), carries

```
Alamat Kos
https://maps.google.com/maps?q=-6.123151%2C106.789494
```

`NoteField` (`ExpenseEditor.tsx`, F12 §"NO EMPTY WHITE BOX") renders the note as a
`<TextArea rows={2}>` once it has a value, full stop — a fixed 2-row well, and a plain
`<textarea>` cannot render a clickable link at any row count. Both problems share the one root
cause: a note with a value never had a rendering that was not "an editable textarea".

This design was worked out with the user directly (four small decisions, each confirmed) before
the card was even filed — see #18's body for the full transcript-derived writeup. This file
restates it as the plan, plus what round 1 actually built.

## 2. Approaches considered

### A — a third render state: read-only view, edit on tap ✅ chosen

`NoteField`'s existing boolean (`expanded`, renamed `editing`) already gates two states; extend
it to three rather than adding new state:

- `!value && !editing` → the CTA, unchanged
- `editing` → the textarea, unchanged mechanism
- `value && !editing` → **new**: full text, `whitespace-pre-wrap`, linkified, a pencil button
  always in the corner

**Convention** — matches F12's own "the field is earned" shape; extending an existing boolean
beats introducing a second piece of state that could disagree with it. **Scope** — one component,
no new dependency. **Reversibility** — deleting the third branch restores F12 exactly.

### B — textarea, auto-grow only, no view/edit split ❌

Considered first and rejected by the user directly: an auto-grow textarea fixes the truncation
half but a native `<textarea>` cannot render a clickable link regardless of row count, so it
cannot satisfy ask #2 at all. Confirmed with the user (`AskUserQuestion`, "View mode" question) —
"Read-only text + tap-to-edit" over "textarea auto-grow saja, tanpa link".

### C — tap-and-hold (long press) as the sole entry into edit mode ❌

Floated as the alternative to an always-visible pencil icon. Rejected: a note that is nothing but
a bare URL has no plain text to long-press either, and long-press has no visible affordance —
discoverability loses outright over "the ambiguous case has no committed hazard, the icon does."
Confirmed with the user ("Edit affordance" question).

### D — open a tapped link in the same tab ❌

The simpler default, and rejected on confirmation: navigating away from `/e/[id]` in the same tab
loses the user's place on the expense they were just looking at. `target="_blank"` costs one
attribute.

## 3. Linkify

`lib/linkify.ts`, a pure function, tested in isolation (`lib/__tests__/linkify.test.ts`, 8 cases)
rather than through a render — there is no jsdom in this suite (`environment: 'node'`,
`vitest.config.ts`), so a pure function is the one part of this feature a real test can exercise
end to end instead of pinning source.

- `/(https?:\/\/[^\s]+|www\.[^\s]+)/g` — confirmed with the user to include bare `www.` (not just
  `http(s)://`), over the narrower alternative (`AskUserQuestion`, "URL detection").
- Trailing punctuation (`.,;:!?)]}'"`) is peeled off a match and kept as plain text, so a URL
  ending a sentence doesn't swallow the period. Heuristic, not a URL parser — noted in the
  module's own docblock.
- A bare `www.` match gets `https://` prepended only in `href`; displayed text is untouched.

## 4. The state machine, in full

```
!value && !editing   → CTA "+ Tambah Catatan"                      (F12, unchanged)
editing               → TextArea, autoFocus, same blur commit path  (F12, blur widened — see below)
value && !editing     → read-only block: linkify(value), pencil button
```

Blur handler widened from F12's `if (!trimmed) setExpanded(false)` to an unconditional
`setEditing(false)` whenever the trimmed draft equals `value` — round-tripping through edit mode
without changing anything (tap pencil, blur without typing) must return to the read-only view,
which F12 never needed to handle because there was no view to return to.

**Accessibility call made without asking, because the code decided it, not taste:** the read-only
block's outer `<div>` gets an `onClick` for mouse/touch but deliberately **no** `role="button"` —
it contains real interactive descendants (the pencil `<button>`, any `<a>` from `linkify`), and
ARIA's button role forbids focusable descendants. Keyboard/AT access to edit mode goes through
the pencil button alone, which is a real, always-present, always-focusable `<button
aria-label={NOTE_EDIT_LABEL}>`. Pinned in `tests/note-field.contract.test.ts`.

**New icon:** `EditIcon` (lucide's `Pencil`) added to `components/ui/Icon.tsx`, the app's one
lucide choke point (`tests/icon.contract.test.ts`).

**Link color:** no existing "link" token in `app/globals.css` (only ink/rule/red/green/category).
Rather than invent a new color axis for one feature, links render in the same `text-ink` as the
surrounding body text, with `underline decoration-1 underline-offset-2` doing the "this is
tappable" signalling — zero new tokens, and it reads correctly in both themes for free since it
inherits `--ink`. Verified visually (§6), not just asserted.

## 5. Scope call: no KitchenSink entry for the *stateful* NoteField, but one for the *read-only markup*

`NoteField` is page-local (unexported, `ExpenseEditor.tsx`) — same shape as `ItemRow`'s "F05
ships ZERO shared components" — so the F19 precedent ("a state absent from the gallery is a
state nobody checks") does not, on its own, force a gallery entry for a private component's
internal state.

It reversed once verification started: `/e/[id]` requires real Google OAuth, which this session
cannot drive headlessly, so **without a KitchenSink entry there was no way to see this feature
rendered at all** before shipping it — the actual justification F19 gives, just arrived at from
a different direction (verification necessity, not "shared component states must all be shown").
Added a static (non-stateful, pencil unwired) rendering of the read-only block to
`KitchenSink.tsx`, seeded with the real prod note plus two edge cases (a long URL that must wrap
without overflowing the card, and a note with no link at all, to show the pencil is still there).
This is the markup, not the component — acceptable duplication for the one thing it exists to
let a session actually look at, not a second implementation anyone will maintain independently
of the real one's tests.

## 6. Verified

`npx playwright` (cached Chromium, not `npm`-installed — see §8) against `next dev` on
`localhost:3000/dev/ui`, 414×1000 @DPR2, both themes:

- Real prod note: "Alamat Kos" on its own line, the Maps URL underlined and wrapping across two
  lines without touching the pencil.
- Long-URL case: wraps at a word boundary, three lines, never overflows the card.
- No-link case: plain sentence, pencil still present and reachable.
- Both `prefers-color-scheme` — `text-ink`/`text-ink-3` repaint correctly with no separate dark
  rule needed, confirming the "reuse ink, don't invent a link color" call in §4.

Screenshots kept in the session scratchpad, not the repo — this is dev-QA evidence, not a
shipped asset.

## 7. Tests

- `lib/__tests__/linkify.test.ts` — 8 cases: no URL, `http(s)://`, bare `www.`, no double-match
  of `www.` inside `http://www...`, trailing `.`, wrapping `()`, two URLs in one note, empty
  string.
- `tests/note-field.contract.test.ts` — source-pinned (no jsdom, matching every other
  `*.contract.test.ts` in this repo): the read-only branch's gating condition, that it renders
  through `linkify` rather than a raw string, the pencil's `aria-label`, the link's
  `target="_blank"`/`rel`, the link's `stopPropagation` (so a tap opens the URL and does *not*
  also flip into edit mode), no `role="button"` on the container, and the widened blur contract
  (commits only on an actual change; closes unconditionally otherwise, not gated on empty).

Full gate, in the worktree: `lint`, `typecheck`, `test` (983 passed, 17 skipped — pre-existing),
`db:check`, `build`, `format:check`. All green.

## 8. Files

| File | Change |
|---|---|
| `lib/linkify.ts` | new — the URL-splitting pure function |
| `lib/__tests__/linkify.test.ts` | new — 8 cases |
| `components/ui/Icon.tsx` | `EditIcon` (lucide `Pencil`) |
| `components/ui/index.ts` | export `EditIcon` |
| `app/(bare)/e/[id]/copy.ts` | `NOTE_EDIT_LABEL` |
| `app/(bare)/e/[id]/ExpenseEditor.tsx` | `NoteField`'s third state, widened blur handler |
| `app/(shell)/dev/ui/KitchenSink.tsx` | static read-only-view demo, three notes |
| `tests/note-field.contract.test.ts` | new — the state-machine and a11y invariants |
| `docs/plans/F20-note-view-linkify.md` | this file |
