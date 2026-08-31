'use client'

import { useState } from 'react'

import { Button, CategoryPicker, Chip, Field, Input, MoneyInput, Sheet } from '@/components/ui'
import { DEFAULT_CATEGORY, type Category } from '@/lib/categories'

import {
  DELETE_CTA,
  ITEM_AMOUNT_CLEAR,
  ITEM_AMOUNT_INVALID,
  ITEM_AMOUNT_LABEL,
  ITEM_NAME_LABEL,
  ITEM_NAME_PLACEHOLDER,
  ITEM_SHEET_ADD,
  ITEM_SHEET_EDIT,
  SAVE_CTA,
} from './copy'

/** What the sheet hands back. Identical for an edit and an add. */
export interface ItemDraft {
  name: string
  amountIdr: number
  category: Category
}

/**
 * Tap an item row, edit it here. Also the "+ Tambah item" surface, because an add and an edit
 * ask for exactly the same three values and a second layout for them would be two things to
 * keep in step.
 *
 * WHY A SHEET AND NOT INLINE FIELDS, when /new edits its rows inline: on /new the whole
 * point is scanning a freshly parsed table, so every row is open at once. Here the group is
 * already correct and the reader is looking for one thing — an item row that is a *reading*
 * row (code, name, amount, aligned) beats three controls per row, and roadmap §5 asks for
 * tap-to-edit.
 *
 * NO `autoFocus`. `Sheet` moves focus to its panel on open so a screen reader announces the
 * sheet before its contents; an autofocused field would fight that effect and, on iOS, throw
 * the keyboard up over the category grid before the user has seen it.
 *
 * The internal draft is NOT reset when `initial` changes — the parent passes a `key` derived
 * from the target instead, which is one mechanism instead of a sync effect that can miss.
 */
export function ItemSheet({
  open,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean
  /** null = adding. */
  initial: ItemDraft | null
  onClose: () => void
  onSubmit: (value: ItemDraft) => void
  /** Only for an edit: the sheet's own way to remove the row it is editing. */
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amountIdr, setAmountIdr] = useState<number | null>(initial?.amountIdr ?? null)
  const [category, setCategory] = useState<Category>(initial?.category ?? DEFAULT_CATEGORY)
  const [unparsed, setUnparsed] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && amountIdr !== null

  function submit() {
    if (!canSubmit || amountIdr === null) return
    onSubmit({ name: trimmed, amountIdr, category })
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={initial ? ITEM_SHEET_EDIT : ITEM_SHEET_ADD}
        // R-52d: the ✕ is off by default because a picker does not need one. This sheet is an
        // editor — it has a destructive action in its footer, and dismissing an editor by
        // guessing at the scrim is not a thing to make someone do.
        showCloseButton
        footer={
          <div className="flex gap-2">
            {onDelete && (
              <Button variant="destructive" onClick={onDelete} className="shrink-0">
                {DELETE_CTA}
              </Button>
            )}
            <Button onClick={submit} disabled={!canSubmit} className="flex-1">
              {SAVE_CTA}
            </Button>
          </div>
        }
      >
        {/* bg-paper on both controls: the sheet panel is already `card`, and a card-filled
            field on a card surface has no visible well (Field.tsx says so at CONTROL_CLASS). */}
        <Field label={ITEM_NAME_LABEL}>
          <Input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            enterKeyHint="next"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={ITEM_NAME_PLACEHOLDER}
            className="bg-paper"
          />
        </Field>

        <Field
          label={ITEM_AMOUNT_LABEL}
          error={unparsed ? ITEM_AMOUNT_INVALID : undefined}
          className="mt-4"
        >
          {/* MoneyInput carries `inputMode="numeric"`, the static Rp, and dots inserted as
              you type (design R-37). It also accepts a pasted `45k` / `1,5jt` via
              parseIdrLoose, which is the whole reason this app exists.

              F19's ✕ ships HERE and not on `/new`'s review row, because this Jumlah is
              full-width in a sheet — 274px of input, 236 once the button's gutter is
              reserved — against the 100px that row affords. The component clears both the
              value and its own unparseable escape hatch, so `onValueChange(null)` arrives
              through the handler below and `unparsed` goes with it.

              The Nama field above stays non-clearable: that is F17's call on card #11 (it
              starts empty when this sheet is an add), not this card's to reverse. */}
          <MoneyInput
            value={amountIdr}
            onValueChange={(value) => {
              setUnparsed(null)
              setAmountIdr(value)
            }}
            onParseError={setUnparsed}
            clearLabel={ITEM_AMOUNT_CLEAR}
            enterKeyHint="done"
            className="bg-paper"
          />
        </Field>

        <div className="mt-4 mb-1">
          <p className="mb-1.5 eyebrow">Kategori</p>
          {/* A Chip with onClick is a 44px button carrying the two-letter code AND the
              Indonesian label, so the category is never colour-only. */}
          <Chip category={category} size="md" onClick={() => setPickerOpen(true)} />
        </div>
      </Sheet>

      {/*
       * A SIBLING dialog, not a nested one. Two `<dialog open>`s both sit in the top layer, so
       * the picker paints above this sheet and neither is inert — and `Sheet`'s body-scroll
       * lock is reference-counted precisely so closing the inner one does not unlock the page
       * while the outer one is still open.
       */}
      <CategoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={category}
        onSelect={setCategory}
      />
    </>
  )
}
