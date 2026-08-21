'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition, type ReactNode } from 'react'

import { updateExpenseMeta } from '@/app/actions/expenses'
import { addItem, deleteItem, updateItem } from '@/app/actions/items'
import {
  Button,
  Card,
  CategoryDisc,
  Field,
  Input,
  Money,
  TextArea,
  useToast,
} from '@/components/ui'
import { isValidDateISO, monthKey } from '@/lib/format'

import {
  ADD_ITEM_CTA,
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
  /** F09's Bagikan button — the header's one optional action (design R-38). */
  shareSlot?: ReactNode
  /**
   * F09's live-link status and its revoke control. Renders nothing when the group has no
   * share link, which is the common case, so the slot is usually an empty node rather than
   * a conditional here. It goes above the delete button, not beside the header action:
   * see the docblock on `ShareLinkPanel` for why status and action are separated.
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
       * The pushed-view header design R-38 specifies: back chevron · mono label · optional
       * action. `/e/[id]` has no tab bar (R-51), so this IS its navigation. F10 does not ship
       * this header because what flanks the label differs per route — here the right side is
       * F09's Bagikan, on /new there is nothing (R-89).
       */}
      {/* Back · label · action, on a white band with a hairline under it — the design's
          pushed-view header. The label stays a tiny eyebrow rather than becoming a screen
          title, because the expense's own title is the 30px thing on this screen and two
          large headings would fight. */}
      <header className="flex items-center gap-1 border-b border-rule bg-card pt-safe-header px-safe pb-2">
        <Link
          href={backHref}
          aria-label={BACK_LABEL}
          className="-ml-2.5 grid size-touch shrink-0 press place-items-center rounded-field text-ink"
        >
          <span aria-hidden="true" className="text-[22px] leading-none font-extrabold">
            ‹
          </span>
        </Link>
        <h1 className="mx-auto eyebrow">{DETAIL_LABEL}</h1>
        <div className="ml-auto">{shareSlot}</div>
      </header>

      <div className="px-safe">
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
                <span aria-hidden="true" className="text-[20px] leading-none font-bold">
                  ×
                </span>
              </button>
            </li>
          ))}
        </Card>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex min-h-12 w-full press items-center text-left text-action text-ink-2 uppercase"
        >
          {ADD_ITEM_CTA}
        </button>

        <div className="mt-3.5 flex items-baseline justify-between rounded-card bg-card px-4 py-3">
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

      <div className="mt-7 px-safe">
        <NoteField
          key={`note:${optimisticMeta.note ?? ''}`}
          value={optimisticMeta.note ?? ''}
          onCommit={(note) => commitMeta({ note })}
        />
      </div>

      {shareLinkSlot && <div className="mt-10 px-safe">{shareLinkSlot}</div>}

      <div className="mt-10 px-safe pb-8">
        <Button variant="destructive" fullWidth onClick={() => setConfirmingDelete(true)}>
          {DELETE_GROUP_CTA}
        </Button>
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
    </Field>
  )
}

function NoteField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)

  return (
    <Field label={NOTE_LABEL}>
      <TextArea
        rows={2}
        value={draft}
        maxLength={2_000}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (trimmed !== value) onCommit(trimmed)
        }}
      />
    </Field>
  )
}
