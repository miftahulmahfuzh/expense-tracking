'use client'

import type { Ref } from 'react'

import { Chip, Field, Input, MoneyInput } from '@/components/ui'

import type { DraftItem } from './draft'

/**
 * One editable line of the review table.
 *
 * TWO LINES, NOT ONE: name + ✕ on top, category chip + amount below. On a 414px screen a
 * single line squeezes the name to about twelve characters, and the name is the field the
 * user scans to check the parse was right.
 *
 * F05 ships ZERO shared components (R-33). Every control here comes from F10 — an earlier
 * draft of this plan specified its own AmountInput, Chip and CategorySheet, and all three
 * already existed. This file is layout, labelling and wiring only.
 *
 * NO SWIPE-TO-DELETE, and that is a decision rather than an omission. A horizontal swipe on
 * the web fights Safari's edge-back gesture on the left and momentum scroll everywhere else.
 * A visible ✕ is discoverable, reachable by keyboard, announced by VoiceOver, and free.
 */
export type ItemRowProps = {
  item: DraftItem
  index: number
  errors?: { name?: string; amount?: string }
  onNameChange: (value: string) => void
  onAmountChange: (value: number | null) => void
  onAmountUnparsed: (rawText: string) => void
  onOpenCategory: () => void
  onRemove: () => void
  disabled?: boolean
  nameRef?: Ref<HTMLInputElement>
  deleteRef?: Ref<HTMLButtonElement>
}

export function ItemRow({
  item,
  index,
  errors,
  onNameChange,
  onAmountChange,
  onAmountUnparsed,
  onOpenCategory,
  onRemove,
  disabled = false,
  nameRef,
  deleteRef,
}: ItemRowProps) {
  // Every accessible name on the row quotes the item, so VoiceOver announces "Hapus roti
  // buaya" rather than four identical "Hapus" buttons.
  const label = item.name.trim() || `item ${index + 1}`

  return (
    <li className="border-b border-rule-2 py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Field owns the label, the generated id and the aria-describedby wiring.
              hideLabel keeps it screen-reader-only — a placeholder is not a label. */}
          <Field label={`Nama ${label}`} hideLabel error={errors?.name}>
            <Input
              id={`item-${item.key}-name`}
              ref={nameRef}
              type="text"
              enterKeyHint="next"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Nama item"
              value={item.name}
              disabled={disabled}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </Field>
        </div>

        <button
          type="button"
          ref={deleteRef}
          onClick={onRemove}
          disabled={disabled}
          // A full 44×44 (design R-41), from real box size rather than a transform, so the
          // hit area and the painted area agree.
          className="flex size-touch shrink-0 press items-center justify-center rounded-field font-mono text-ink-3"
          aria-label={`Hapus ${label}`}
        >
          <span aria-hidden="true" className="text-row leading-none">
            ✕
          </span>
        </button>
      </div>

      <div className="mt-2 flex items-start gap-2">
        {/* Chip with an onClick renders a <button> carrying the two-letter code AND the
            Indonesian label, so colour is never the only signal. */}
        <Chip category={item.category} size="md" onClick={disabled ? undefined : onOpenCategory} />

        <div className="ml-auto w-[9.5rem]">
          <Field label={`Jumlah ${label}`} hideLabel error={errors?.amount}>
            <MoneyInput
              id={`item-${item.key}-amount`}
              value={item.amountIdr}
              disabled={disabled}
              onValueChange={onAmountChange}
              onParseError={onAmountUnparsed}
              enterKeyHint="done"
            />
          </Field>
        </div>
      </div>
    </li>
  )
}
