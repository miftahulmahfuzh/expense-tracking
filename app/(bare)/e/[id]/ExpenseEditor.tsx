'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition, type ReactNode } from 'react'

import { updateExpenseMeta } from '@/app/actions/expenses'
import { addItem, deleteItem, updateItem } from '@/app/actions/items'
import {
  Card,
  CategoryDisc,
  ChevronLeftIcon,
  CloseIcon,
  Field,
  Input,
  Money,
  TextArea,
  TitlePresets,
  TrashIcon,
  useToast,
} from '@/components/ui'
import { isValidDateISO, monthKey } from '@/lib/format'

import {
  ADD_ITEM_CTA,
  ADD_NOTE_CTA,
  BACK_LABEL,
  DATE_LABEL,
  DELETE_FAILED,
  DELETE_GROUP_CTA,
  DETAIL_LABEL,
  ITEM_DELETED_TOAST,
  ITEM_HEADING,
  NOTE_LABEL,
  SAVE_FAILED,
  TITLE_LABEL,
  TOTAL_LABEL,
  UNDO_DURATION_MS,
  UNDO_FAILED,
  UNDO_LABEL,
} from './copy'
import { DeleteExpenseSheet } from './DeleteExpenseSheet'
import { nextSortOrder, reduceItems, totalOf, type EditableItem, type EditableMeta } from './items'
import { ItemSheet, type ItemDraft } from './ItemSheet'

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE OPTIMISTIC CONTRACT. Read this before changing anything below.
 *
 *  1. Every mutation runs inside ONE `startTransition(async () => { … })`.
 *  2. The `useOptimistic` dispatch is the FIRST statement inside that callback.
 *     Dispatching outside a transition throws in React 19.
 *  3. React holds the optimistic value until the transition settles.
 *  4. SUCCESS: the action calls `revalidateGroup`, Next streams a fresh RSC payload for
 *     this page inside the same transition, the new `items` / `meta` props arrive already
 *     matching the optimistic value, and React drops the overlay with no visible change.
 *     No flash, no spinner.
 *  5. FAILURE: we catch, show a toast, and return. The transition settles with UNCHANGED
 *     props, so React discards the overlay and the row visibly snaps back to the server
 *     value. That snap-back IS the rollback — we never hand-roll a revert.
 *  6. Therefore: never `await` an action outside a transition, and never keep a `useState`
 *     mirror of server data. A mirror survives the rollback and desyncs silently.
 *
 *  R-92, generalised from F05: state a child reads and that changes as part of a transition
 *  belongs in the reducer. `useState` here is only for what this component owns and nothing
 *  persists — which row's sheet is open, whether the delete confirm is showing.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function ExpenseEditor({
  groupId,
  meta,
  items,
  photoSlot,
  shareSlot,
  shareLinkSlot,
}: {
  groupId: string
  meta: EditableMeta
  items: EditableItem[]
  photoSlot?: ReactNode
  /**
   * F09's Bagikan control, now an icon button. It is the LEFT of the header's two actions —
   * delete is drawn here rather than passed in, because its confirm sheet is already this
   * component's state. See the header's docblock for why there are two.
   */
  shareSlot?: ReactNode
  /**
   * F09's live-link status and its revoke control. Renders nothing when the group has no
   * share link, which is the common case, so the slot is usually an empty node rather than
   * a conditional here — hence the `empty:hidden` at the call site.
   *
   * It used to sit above `Hapus pengeluaran` at the foot of the page. The delete button is
   * gone from there, so it now sits between the photos and the note: still the last
   * *statement* on the page, still separated from the header action that shares the link,
   * and no longer the second-to-last thing before a red block. `ShareLinkPanel`'s own
   * docblock carries the reason status and action are separated at all.
   */
  shareLinkSlot?: ReactNode
}) {
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [optimisticItems, applyItem] = useOptimistic(items, reduceItems)
  const [optimisticMeta, applyMeta] = useOptimistic(
    meta,
    (state: EditableMeta, patch: Partial<EditableMeta>) => ({ ...state, ...patch }),
  )

  const [editing, setEditing] = useState<EditableItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const total = totalOf(optimisticItems)

  /* ---- meta ------------------------------------------------------------- */

  function commitMeta(patch: Partial<EditableMeta>) {
    startTransition(async () => {
      applyMeta(patch)
      try {
        await updateExpenseMeta(groupId, patch)
      } catch {
        toast.show(SAVE_FAILED, { tone: 'danger' })
      }
    })
  }

  /* ---- items ------------------------------------------------------------ */

  function saveItem(target: EditableItem, value: ItemDraft) {
    setEditing(null)

    // Send only what changed. Two fields edited in two transitions then cannot overwrite
    // each other, and an unchanged sheet submit costs no round trip at all.
    const patch: Partial<EditableItem> = {}
    if (value.name !== target.name) patch.name = value.name
    if (value.amountIdr !== target.amountIdr) patch.amountIdr = value.amountIdr
    if (value.category !== target.category) patch.category = value.category
    if (Object.keys(patch).length === 0) return

    startTransition(async () => {
      applyItem({ type: 'patch', id: target.id, patch })
      try {
        await updateItem(target.id, patch)
      } catch {
        toast.show(SAVE_FAILED, { tone: 'danger' })
      }
    })
  }

  function insertItem(value: ItemDraft, sortOrder: number, failureMessage: string) {
    startTransition(async () => {
      applyItem({
        type: 'insert',
        // A placeholder id, replaced by the server's when the RSC payload lands. Prefixed so
        // it can never collide with a nanoid(12), which has no underscore-delimited prefix.
        item: { id: `optimistic_${sortOrder}_${value.name}`, sortOrder, ...value },
      })
      try {
        await addItem(groupId, { ...value, sortOrder })
      } catch {
        toast.show(failureMessage, { tone: 'danger' })
      }
    })
  }

  /**
   * Delete now, undo by re-inserting (plan A7). A deferred timer would be a truer undo but
   * loses the delete when the tab closes mid-window; this is durable and costs one round trip
   * on a tap nobody is waiting on. The restored row gets a NEW id, which is harmless —
   * nothing references an item id across requests — and its ORIGINAL `sortOrder`, which is
   * what puts it back where it was rather than at the bottom (R-16).
   */
  function removeItem(target: EditableItem) {
    setEditing(null)
    startTransition(async () => {
      applyItem({ type: 'remove', id: target.id })
      try {
        await deleteItem(target.id)
      } catch {
        toast.show(DELETE_FAILED, { tone: 'danger' })
        return
      }
      toast.show(ITEM_DELETED_TOAST, {
        duration: UNDO_DURATION_MS,
        action: {
          label: UNDO_LABEL,
          onAction: () =>
            insertItem(
              { name: target.name, amountIdr: target.amountIdr, category: target.category },
              target.sortOrder,
              UNDO_FAILED,
            ),
        },
      })
    })
  }

  /* ---- render ----------------------------------------------------------- */

  // Deterministic, not `router.back()`: arriving here from a share link, a bookmark or a hard
  // refresh leaves no history to go back to, and the month is derivable from the date we are
  // already showing. It follows an optimistic date edit, so moving an expense to July makes
  // the chevron point at July before the server has answered (plan A3).
  const backHref = `/m/${monthKey(optimisticMeta.occurredOn)}`

  return (
    <main>
      {/*
       * ════════════════════════════════════════════════════════════════════════
       *  THE HEADER NOW CARRIES TWO ACTIONS, and that supersedes two earlier rulings.
       *
       *  Design R-38 specified: back chevron · mono label · ONE optional action, as a text
       *  button. R-124 leaned on the "one action" half of that to put `Hapus pengeluaran`
       *  at the very bottom of the page as a full-width destructive block. Both are now
       *  reversed on purpose: share and delete sit up here as two 44px icon buttons.
       *
       *  WHY. Both were the only two things on this screen that were not *the expense*. A
       *  page that ends in a red full-width DELETE button ends on its most frightening
       *  control, and the note — the one genuinely optional field — was wedged above it
       *  where nobody scrolls. Moving both actions into the chrome band lets the page end
       *  on `+ Tambah catatan`, which is an invitation rather than a warning.
       *
       *  WHAT IT COSTS, stated plainly because R-38's reasoning was not wrong: the delete
       *  target is now one thumb-width from a target the user taps on purpose, instead of a
       *  scroll away. `DeleteExpenseSheet` is what makes that survivable — it is a real
       *  confirm that quotes the group's own title, and it is the reason this trade is
       *  acceptable here and would not be for anything undoable. The glyph is therefore
       *  `ink-3` grey, NOT red: red in the chrome band would read as an alarm on every
       *  visit to a page that is usually just being read (see the trash glyph below).
       *
       *  `/e/[id]` has no tab bar (R-51), so this IS its navigation. F10 does not ship this
       *  header because what flanks the label differs per route — on /new there is nothing
       *  (R-89). A THIRD action does not fit: 414px minus the gutters, the chevron and the
       *  label leaves room for two 44px boxes and no more.
       * ════════════════════════════════════════════════════════════════════════
       */}
      {/* Back · title · actions, on a white band with a hairline under it — the design's
          pushed-view header.

          `text-title`, the SAME 30px/900 screen title `Tambah` wears on /new, and no longer an
          11px eyebrow. The eyebrow was chosen when the reasoning was that "the expense's own
          title is the 30px thing on this screen" — but it is not: the title is an editable
          `Input` at `text-input`, so there was never a second large heading to fight, only a
          chrome label two type steps below every other screen's title. /new and /e/[id] are
          the two `(bare)` screens and both open with chevron · title · (actions); they now
          typeset that title identically. Height is unchanged either way — the 44px icon
          buttons set this band's height and 32px of line box fits inside them. */}
      <header className="glass flex items-center gap-1 border-b border-rule pt-safe-header px-safe pb-2">
        <Link
          href={backHref}
          aria-label={BACK_LABEL}
          className="-ml-2.5 grid size-touch shrink-0 press place-items-center rounded-field text-ink"
        >
          {/* F12: was a `‹` at 22px/800. The docblock above says this screen and /new "both
              open with chevron · title · (actions)" and typeset it identically — which was true
              of the size and false of the drawing, since each file had its own typed glyph. Now
              it is one import, so "identically" is structural. */}
          <ChevronLeftIcon />
        </Link>
        {/* Hard against the chevron, not centred — the same left-aligned title-beside-chevron
            arrangement /new uses. `mx-auto` pushed it to the middle of the band, which is an
            iOS convention this design does not otherwise follow. `ml-auto` on the action group
            still pins both icons right. */}
        <h1 className="text-title">{DETAIL_LABEL}</h1>
        {/* `-mr-2.5` on the GROUP, mirroring the chevron's `-ml-2.5`: each 44px box overhangs
            the gutter by the same 10px, so the two outermost glyphs are optically flush with
            the column while their touch targets stay full size. `gap-0.5` and not more —
            these are two 44px boxes whose glyphs are 22px, so there is already 11px of dead
            space between the marks without adding any. */}
        <div className="-mr-2.5 ml-auto flex items-center gap-0.5">
          {shareSlot}

          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={DELETE_GROUP_CTA}
            className="grid size-touch shrink-0 press place-items-center rounded-field text-ink-3"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      {/*
       * `pt-gutter` — the SAME 22px `px-safe` insets the column by, now applied to the top.
       * Without it `JUDUL`'s box started at exactly 0px from the header's hairline, so the
       * first eyebrow on the screen was welded to the chrome above it while every other
       * block on the page floated clear of its neighbour.
       *
       * 22px is not a fresh number: it is `--spacing-gutter`, the page inset. It also lands
       * the eyebrow's text 23.5px under the hairline, which is within 1.5px of the 22px
       * between the item card's bottom edge and `+ TAMBAH ITEM` — the gap this was measured
       * against, and the closest thing this screen has to a canonical block-to-label
       * distance. `loading.tsx` carries the same token so the skeleton does not hand over to
       * a page that jumps — it was `pt-4` against this div's zero, i.e. 16px of shift.
       */}
      <div className="pt-gutter px-safe">
        {/*
         * `key` is how the title and note fields resync after a commit, WITHOUT an effect.
         * Each holds its own in-progress text (an input the user is typing into is not server
         * state), and keying them on the committed value remounts them — with the new value on
         * success, and with the OLD value when a failed write rolls the optimistic meta back.
         * Both fields are blurred by the time either happens, so no keystroke is ever lost.
         */}
        <TitleField
          key={`title:${optimisticMeta.title}`}
          value={optimisticMeta.title}
          onCommit={(title) => commitMeta({ title })}
        />

        <Field label={DATE_LABEL} className="mt-4">
          {/*
           * The native picker — on iOS the wheel the user already knows, with locale and leap
           * years handled for free. Committed on `change`, not on blur: a wheel spin can emit
           * two or three changes and therefore two or three writes (last one wins, each
           * correctly revalidating both months), which is a better trade than losing an edit
           * entirely when someone picks a date and then taps Back without blurring.
           */}
          <Input
            type="date"
            value={optimisticMeta.occurredOn}
            onChange={(event) => {
              const next = event.target.value
              if (!isValidDateISO(next) || next === optimisticMeta.occurredOn) return
              commitMeta({ occurredOn: next })
            }}
          />
        </Field>

        <div className="mt-6 mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow">{ITEM_HEADING}</h2>
          <span className="tabular text-meta text-ink-3">{optimisticItems.length}</span>
        </div>

        {/* padded="rows" is the 16/6/2 inset a list of rows wants (R-52c): the separator runs
            the text column and the 44px delete target sits flush right without looking crammed. */}
        <Card as="ul" padded="rows">
          {optimisticItems.map((item) => (
            <li
              key={item.id}
              /* F08's biggest-expense callout links to /e/[id]#item-<itemId>. One attribute,
                 and without it the fragment is inert and the reader lands on the group with
                 no idea which of eighteen rows the callout meant. scroll-mt clears the
                 sticky detail header so the anchored row is not parked underneath it. */
              id={`item-${item.id}`}
              className="flex scroll-mt-24 items-stretch border-b border-rule last:border-b-0"
            >
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex min-h-row flex-1 press items-center gap-2.5 py-2 pr-1.5 text-left"
              >
                {/* The pictogram disc: colour AND identity, in a fixed 28px column so a
                    list of items scans as a table. */}
                <CategoryDisc category={item.category} />
                <span className="min-w-0 flex-1 truncate text-item">{item.name}</span>
                <Money value={item.amountIdr} size="sm" tone="muted" />
              </button>

              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={`Hapus ${item.name}`}
                className="grid size-touch shrink-0 press place-items-center rounded-field text-ink-3"
              >
                {/* F12: was a `×` (U+00D7, the multiplication sign) at 20px/700 — the same
                    stand-in ItemRow used on /new, and now the same real glyph. */}
                <CloseIcon />
              </button>
            </li>
          ))}
        </Card>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex min-h-12 w-full press items-center text-left text-action text-ink-2"
        >
          {ADD_ITEM_CTA}
        </button>

        <div className="glass mt-3.5 flex items-baseline justify-between rounded-card px-4 py-3">
          <span className="eyebrow">{TOTAL_LABEL}</span>
          {/*
           * Announced politely and atomically so a screen reader reads the whole new amount
           * once after an edit, instead of spelling out each digit as the optimistic value and
           * then the server value arrive.
           */}
          <span aria-live="polite" aria-atomic="true">
            <Money value={total} size="lg" />
          </span>
        </div>
      </div>

      {photoSlot && <div className="mt-7">{photoSlot}</div>}

      {/*
       * `empty:hidden`, and it is load-bearing now that this is not the second-to-last block.
       * `shareLinkSlot` is an ELEMENT that renders null, so the truthiness check above cannot
       * see that, and the wrapper survives as an empty div whose 40px top margin would
       * collapse through it and push the note down on every group WITHOUT a share link — i.e.
       * on nearly all of them. `display: none` takes the box and both its margins out.
       */}
      {shareLinkSlot && <div className="mt-10 px-safe empty:hidden">{shareLinkSlot}</div>}

      {/*
       * THE LAST BLOCK ON THE PAGE, so `pb-1.5` is the whole answer to "how close to the
       * bottom" — the 8px edge rule (globals.css), minus the 16px of slack the CTA's own 48px
       * tap target already puts under its 16px line box. That lands "+ Tambah catatan" 22px
       * off the screen edge, level with the home indicator.
       *
       * Do NOT add safe-area padding here. `(bare)/layout.tsx` deliberately no longer pads,
       * and `env(safe-area-inset-bottom)` on top of this is what used to leave the CTA
       * stranded 62px up — a band of nothing that only appears on real hardware.
       */}
      <div className="mt-7 px-safe pb-1.5">
        <NoteField
          key={`note:${optimisticMeta.note ?? ''}`}
          value={optimisticMeta.note ?? ''}
          onCommit={(note) => commitMeta({ note })}
        />
      </div>

      {/*
       * ONE sheet for add and edit, keyed on the target so its internal draft resets when the
       * target changes. `open` is a prop rather than sheet state, per Sheet's own contract.
       */}
      <ItemSheet
        key={editing ? `edit:${editing.id}` : 'add'}
        open={Boolean(editing) || adding}
        initial={
          editing
            ? { name: editing.name, amountIdr: editing.amountIdr, category: editing.category }
            : null
        }
        onClose={() => {
          setEditing(null)
          setAdding(false)
        }}
        onSubmit={(value) => {
          if (editing) {
            saveItem(editing, value)
            return
          }
          setAdding(false)
          insertItem(value, nextSortOrder(optimisticItems), SAVE_FAILED)
        }}
        onDelete={editing ? () => removeItem(editing) : undefined}
      />

      <DeleteExpenseSheet
        open={confirmingDelete}
        groupId={groupId}
        title={optimisticMeta.title}
        onClose={() => setConfirmingDelete(false)}
      />
    </main>
  )
}

/* ==========================================================================
 * Local fields. In this file because they exist only to hold in-progress text for
 * this screen's two free-text values, and because their reset behaviour is the `key`
 * contract documented at the call site above.
 * ========================================================================== */

function TitleField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)

  /**
   * F12 §5. Typing here commits on BLUR; a preset tap has no blur to wait for, so it writes
   * through immediately — and it must also move the local `draft`, or the box would keep showing
   * the old text until the optimistic update landed.
   *
   * The `!== value` guard is the same one `onBlur` carries: re-tapping the chip that is already
   * active is a no-op rather than a needless action call and revalidation.
   */
  const pick = (preset: string) => {
    setDraft(preset)
    if (preset !== value) onCommit(preset)
  }

  return (
    <Field label={TITLE_LABEL}>
      <Input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          // An empty title is not a valid title, client-side or server-side. Revert silently
          // rather than showing an error for something the user can see they just did.
          if (!trimmed) {
            setDraft(value)
            return
          }
          if (trimmed !== value) onCommit(trimmed)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        maxLength={120}
        enterKeyHint="done"
        autoCapitalize="none"
        autoCorrect="off"
      />
      <TitlePresets value={draft} onPick={pick} className="-mx-safe mt-2 px-safe" />
    </Field>
  )
}

/**
 * NO EMPTY WHITE BOX. A note is the one field on this screen that most expenses will never
 * have, and a 2-row textarea sitting there empty was the page asking a question nobody had
 * asked it — the biggest blank rectangle on the screen, reserved for the least-used field.
 *
 * So the field is EARNED, in three states and no more:
 *
 *   value empty, untouched   → one mono row, `+ Tambah catatan`. No box, no label.
 *   value empty, tapped      → the real field, focused, keyboard up.
 *   value present            → the real field, exactly as before.
 *
 * `expanded` IS THE `autoFocus` GUARD, which is why it is one boolean doing two jobs. It is
 * true only on the mount that FOLLOWS the user tapping the CTA, so the textarea focuses then
 * and only then. A group that arrives from the server with a note already on it mounts with
 * `expanded === false`, so the field is visible but does NOT grab focus and shove the
 * keyboard up over the page on every visit — the bug a bare `autoFocus` would ship.
 *
 * COLLAPSING BACK. Opening the field and typing nothing puts it away again on blur, and
 * costs no round trip: the draft is empty, the value is empty, so there is nothing to commit
 * and `onCommit` is never called. Tapping the CTA is therefore free and undoable, which is
 * the point of making it a tap in the first place.
 *
 * Everything past that is the `key` contract at the call site: a commit remounts this with a
 * fresh `value`, `expanded` resets to false, and the state table above picks the right
 * rendering — the field for a saved note, the CTA again for one cleared back to empty. That
 * is also why `expanded` is not `useOptimistic`; it is this component's own scratch state and
 * nothing about it needs to survive a rollback (R-92).
 */
function NoteField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [expanded, setExpanded] = useState(false)

  if (!value && !expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true)
          /*
           * The field is taller than the row it replaces, and this row is the LAST block on
           * the page — so at the foot of a long expense the box it turns into lands partly
           * below the fold. Scrolling to the document's new bottom always reveals it, which
           * is only true because of that "last block" invariant; move the note back up the
           * page and this needs rethinking.
           *
           * One frame late, because the box does not exist until React has committed. NOT an
           * effect: this is a consequence of a tap, and it belongs in the tap handler.
           *
           * iOS ALSO scrolls a focused input clear of the keyboard on its own, ~250ms later,
           * and that adjustment lands after this one and wins. This is for the platforms that
           * do not — desktop Safari, an iPad with a hardware keyboard.
           */
          requestAnimationFrame(() =>
            window.scrollTo({ top: document.documentElement.scrollHeight }),
          )
        }}
        /* The `+ Tambah item` row, verbatim, minus the `mt-1` its own list wanted. Same
           height, same 12px/800 Title Case, same ink — because it is the same kind of thing, and
           two different-looking "add a thing" rows on one screen is how a design starts
           drifting. min-h-12 keeps the 44px target the 15px type does not fill on its own. */
        className="flex min-h-12 w-full press items-center text-left text-action text-ink-2"
      >
        {ADD_NOTE_CTA}
      </button>
    )
  }

  return (
    <Field label={NOTE_LABEL}>
      <TextArea
        rows={2}
        value={draft}
        maxLength={2_000}
        autoFocus={expanded}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (trimmed !== value) {
            onCommit(trimmed)
            return
          }
          // Nothing typed, nothing saved — put the box away rather than leaving the user
          // looking at the empty rectangle they just asked to see.
          if (!trimmed) setExpanded(false)
        }}
      />
    </Field>
  )
}

/*
 * THE TRASH GLYPH MOVED (F12) to `components/ui/Icon.tsx` as `TrashIcon`, wrapping lucide's
 * `Trash2`.
 *
 * What was here was the same drawing in three hand-cut paths — lid, handle, tapered can —
 * under a docblock deferring to `FullscreenToggle`'s "no icon dependency in this repo" and
 * restating its numbers: 24 viewBox, 2.5 stroke, square caps, mitred joins, 22px rendered.
 * All five survive, as props inside `Icon`. What does not survive is the rib argument: the old
 * glyph deliberately had NO ribs on the can, because two vertical ribs at a 2.5 stroke silt up
 * into a grey block at 22px. Lucide's `Trash2` HAS two ribs, so if the can ever reads as a
 * smudge on the XS Max, `Trash` (ribless) is the swap — one word in Icon.tsx, and this
 * paragraph is why you would.
 *
 * `currentColor` still applies, so the `ink-3` on the button remains the only place the colour
 * is decided — see the header docblock for why grey and not red.
 */
