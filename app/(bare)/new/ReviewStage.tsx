'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { PhotoPicker } from '@/components/photos'
import { Button, CategoryPicker, Card, Field, Input, Money, TextArea } from '@/components/ui'
import type { Category } from '@/lib/categories'
import type { StagedPhoto } from '@/lib/photos/types'
import { revealAboveBar } from '@/lib/scroll/revealAboveBar'

import {
  ADD_ITEM_CTA,
  DEGRADED_NOTICE,
  RAW_DISCLOSURE,
  REPARSE_CONFIRM,
  REPARSE_CONFIRM_NO,
  REPARSE_CONFIRM_YES,
  REPARSE_CTA,
  SAVE_CTA,
  SAVE_WAITING_PHOTOS,
} from './copy'
import { ItemRow } from './ItemRow'
import { StickyBar } from './StickyBar'
import { errorSummary } from './validate'
import {
  draftTotal,
  type DraftExpense,
  type FieldErrors,
  type FocusRequest,
  type ParseFailure,
  type SaveStatus,
} from './draft'

/**
 * Stages 2 and 3: review, photos, save.
 *
 * These are ONE scroll, not two states. Photos and Simpan live at the bottom of the review
 * scroll rather than behind a "next" button, because a wizard step is navigation the product
 * explicitly does not want — three visual stages, two state stages, and `stage` is only ever
 * 'paste' | 'review'.
 */
export type ReviewStageProps = {
  draft: DraftExpense
  errors: FieldErrors
  focus: FocusRequest
  save: SaveStatus
  parseFailure: ParseFailure | null
  /** F04's ParseResult.degraded — true whenever the deterministic fallback answered. */
  degraded: boolean
  reparsing: boolean
  photosBusy: boolean
  onFocusHandled: () => void
  onTitleChange: (value: string) => void
  onDateChange: (value: string) => void
  onNoteChange: (value: string) => void
  onRawChange: (value: string) => void
  onItemName: (key: string, value: string) => void
  onItemAmount: (key: string, value: number | null) => void
  onItemAmountUnparsed: (key: string, rawText: string) => void
  onItemCategory: (key: string, category: Category) => void
  onAddItem: () => void
  onRemoveItem: (key: string) => void
  onPhotosChange: (photos: StagedPhoto[]) => void
  onPhotosBusyChange: (busy: boolean) => void
  onReparse: () => void
  onSave: () => void
}

/**
 * The unit worth revealing: the whole `<li>`, never just the focused field.
 *
 * An ItemRow is two lines — name + ✕ above, category chip + amount below — so scrolling the
 * name input into view and stopping there leaves half the row the user was sent to fix behind
 * the bar. Fields outside the list (Judul, Tanggal, Catatan, the Tambah Item button) have no
 * row, and are their own.
 */
function rowOf(element: HTMLElement): HTMLElement {
  return element.closest('li') ?? element
}

export function ReviewStage(props: ReviewStageProps) {
  const { draft, errors, focus, save, parseFailure, degraded, reparsing, photosBusy } = props
  const { onFocusHandled } = props

  const nameRefs = useRef(new Map<string, HTMLInputElement | null>())
  const deleteRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const addRef = useRef<HTMLButtonElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const [sheetKey, setSheetKey] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [confirmReparse, setConfirmReparse] = useState(false)

  const saving = save.kind === 'saving'
  const total = draftTotal(draft.items)
  const sheetItem = draft.items.find((item) => item.key === sheetKey) ?? null

  /*
   * The single place that fulfils a focus request emitted by the reducer. Centralised
   * because the request is computed where the state changes — "the row after the one you
   * deleted" only means something in the reducer, before the splice.
   *
   * Depends on `onFocusHandled`, not the whole `props` object: `props` is a fresh object
   * every render, which would re-run this effect continuously.
   */
  useEffect(() => {
    if (!focus) return

    let element: HTMLElement | null = null
    if (focus.target === 'item-name') element = nameRefs.current.get(focus.key) ?? null
    else if (focus.target === 'item-delete') element = deleteRefs.current.get(focus.key) ?? null
    else if (focus.target === 'add-item') element = addRef.current
    else element = document.getElementById(focus.id)

    // preventScroll, then reveal deliberately: focus() alone jumps the element to the nearest
    // edge, and the nearest edge is frequently under the sticky bar.
    element?.focus({ preventScroll: true })
    if (element) revealAboveBar(rowOf(element), barRef.current)
    onFocusHandled()
  }, [focus, onFocusHandled])

  /*
   * Re-establish the bar clearance whenever the viewport resizes.
   *
   * THIS IS THE OTHER HALF OF THE FIX, and without it the effect above is useless for the case
   * that reported the bug. "Tambah Item" focuses the new row while the keyboard is still
   * CLOSED, so the reveal runs against a full-height pane in which the row is already clear —
   * it correctly does nothing. The keyboard then opens, --app-h takes ~390px off the pane, and
   * the bar rides up over the row that was just revealed. Nothing recomputed the scroll, so the
   * new item's name field, its error message and its amount field ended up behind Simpan.
   *
   * The keyboard's arrival IS a visualViewport resize, so that is where the correction belongs
   * — not on a timer guessing when the animation has finished.
   */
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const correct = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      // Blur puts <body> here, and a CategoryPicker is a modal <dialog> that scrolls itself.
      if (active === document.body || active.closest('dialog')) return
      revealAboveBar(rowOf(active), barRef.current, 'auto')
    }

    viewport.addEventListener('resize', correct)
    return () => viewport.removeEventListener('resize', correct)
  }, [])

  // Keep the map free of rows that have been deleted, or it grows for the tab's lifetime.
  const registerName = useCallback((key: string, element: HTMLInputElement | null) => {
    if (element) nameRefs.current.set(key, element)
    else nameRefs.current.delete(key)
  }, [])

  const registerDelete = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) deleteRefs.current.set(key, element)
    else deleteRefs.current.delete(key)
  }, [])

  const errorCount =
    (errors.title ? 1 : 0) +
    (errors.occurredOn ? 1 : 0) +
    (errors.note ? 1 : 0) +
    Object.keys(errors.items).length +
    (errors.form ? 1 : 0)

  return (
    <>
      <div className="flex-1 px-safe">
        {/*
          Landing here after a failure is the DESIGNED outcome, not an accident: the user
          always gets an editable table. The banner is what explains why it may look rough.
          role="alert" when something actually failed, role="status" when nothing did and the
          answer is merely unreliable.
        */}
        {parseFailure ? (
          <div role="alert" className="mb-4 rounded-card border border-red bg-red-soft px-3 py-2.5">
            <p className="text-body">{parseFailure.message}</p>
          </div>
        ) : degraded ? (
          <div
            role="status"
            className="mb-4 rounded-card border border-rule-strong bg-paper-2 px-3 py-2.5"
          >
            <p className="text-body">{DEGRADED_NOTICE}</p>
          </div>
        ) : null}

        <Field label="Judul" error={errors.title} className="mb-4">
          <Input
            id="draft-title"
            type="text"
            enterKeyHint="done"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={saving}
            value={draft.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </Field>

        <Field label="Tanggal" error={errors.occurredOn} className="mb-5">
          <Input
            id="draft-date"
            // The native picker: on iOS this is the wheel the user already knows, it handles
            // locale and leap years, and it is free. Do not build one.
            type="date"
            disabled={saving}
            value={draft.occurredOn}
            onChange={(event) => props.onDateChange(event.target.value)}
          />
        </Field>

        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow">Item</h2>
          <span className="font-mono tabular text-meta text-ink-3">{draft.items.length}</span>
        </div>

        <Card as="ul" padded="rows">
          {draft.items.map((item, index) => (
            <ItemRow
              key={item.key}
              item={item}
              index={index}
              errors={errors.items[item.key]}
              disabled={saving}
              nameRef={(element) => registerName(item.key, element)}
              deleteRef={(element) => registerDelete(item.key, element)}
              onNameChange={(value) => props.onItemName(item.key, value)}
              onAmountChange={(value) => props.onItemAmount(item.key, value)}
              onAmountUnparsed={(rawText) => props.onItemAmountUnparsed(item.key, rawText)}
              onOpenCategory={() => setSheetKey(item.key)}
              onRemove={() => props.onRemoveItem(item.key)}
            />
          ))}
        </Card>

        <button
          type="button"
          ref={addRef}
          onClick={props.onAddItem}
          disabled={saving}
          className="mt-2 min-h-touch w-full press rounded-field border border-dashed border-rule-strong font-mono text-action text-ink-2 uppercase"
        >
          {ADD_ITEM_CTA}
        </button>

        {errors.form ? (
          <p role="alert" className="mt-2 font-mono text-meta text-red">
            {errors.form}
          </p>
        ) : null}

        {/*
          The original paste, and the way back to it. Collapsed by default because after a
          good parse nobody wants to see it again; kept because after a BAD parse it is the
          fastest fix — edit one line, re-run.
        */}
        <details className="mt-5 rounded-card border border-rule px-3 py-2" open={showRaw}>
          <summary
            className="flex min-h-touch cursor-pointer list-none items-center font-mono text-action text-ink-2 uppercase"
            onClick={(event) => {
              // Controlled, so the disclosure state survives a re-render of the list above it.
              event.preventDefault()
              setShowRaw((open) => !open)
            }}
          >
            {RAW_DISCLOSURE}
          </summary>

          <Field label="Teks pengeluaran asli" hideLabel className="mt-1 mb-2">
            <TextArea
              id="raw-text-review"
              rows={6}
              disabled={saving}
              value={draft.rawText}
              onChange={(event) => props.onRawChange(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="bg-paper font-mono"
            />
          </Field>

          {confirmReparse ? (
            // An INLINE confirm, not window.confirm(): the alert family is banned here, and a
            // native dialog cannot be styled, cannot be dismissed by a scrim tap, and reads
            // as a browser error rather than a question from the app.
            <div className="mb-2 rounded-field bg-paper-2 p-2.5">
              <p className="mb-2.5 text-body">{REPARSE_CONFIRM}</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="md"
                  onClick={() => {
                    setConfirmReparse(false)
                    props.onReparse()
                  }}
                >
                  {REPARSE_CONFIRM_YES}
                </Button>
                <Button variant="secondary" size="md" onClick={() => setConfirmReparse(false)}>
                  {REPARSE_CONFIRM_NO}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="md"
              className="mb-2"
              loading={reparsing}
              disabled={reparsing || saving || draft.rawText.trim().length === 0}
              onClick={() => setConfirmReparse(true)}
            >
              {REPARSE_CTA}
            </Button>
          )}
        </details>

        {/*
          F06 owns compression, upload, progress, cancel, retry, the ＋ tile, its own "Foto"
          heading and its own counter — so F05 renders no heading of its own here. F05 holds
          the resulting StagedPhoto[] and hands it to createExpense (R-2 / F06 decision D-C);
          it contains zero upload, compression or Blob code and never imports attachPhoto.
        */}
        <PhotoPicker
          mode="staged"
          className="mt-5"
          value={draft.photos}
          onChange={props.onPhotosChange}
          onBusyChange={props.onPhotosBusyChange}
          disabled={saving}
        />

        <Field label="Catatan (opsional)" className="mt-5" error={errors.note}>
          <TextArea
            id="draft-note"
            rows={2}
            disabled={saving}
            value={draft.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
        </Field>

        <div className="h-8" />
      </div>

      <StickyBar ref={barRef}>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="eyebrow">Total</span>
          {/*
            Recomputed on every accepted keystroke (R-52e: MoneyInput fires on change, not on
            blur, so the total never lags the field). Announced politely and atomically, so a
            screen reader reads the whole new amount once instead of spelling out each digit
            as it changes.
          */}
          <span aria-live="polite" aria-atomic="true">
            <Money value={total} size="lg" />
          </span>
        </div>

        {save.kind === 'error' ? (
          <p role="alert" className="mb-2 font-mono text-meta text-red">
            {save.message}
          </p>
        ) : null}

        {errorCount > 0 ? (
          <p role="alert" className="mb-2 font-mono text-meta text-red">
            {errorSummary(errorCount)}
          </p>
        ) : null}

        <Button
          type="button"
          fullWidth
          onClick={props.onSave}
          loading={saving}
          /*
           * NEVER disabled for validation — tap, then see why. Disabled only for
           * double-submit and while F06 still has bytes in flight (R-31), and the second one
           * says so on the button rather than leaving a dead control with no explanation.
           */
          disabled={saving || photosBusy}
        >
          {photosBusy ? SAVE_WAITING_PHOTOS : SAVE_CTA}
        </Button>
      </StickyBar>

      {/*
        ONE picker for the whole list, hoisted here rather than one per row — at 50 rows that
        is 49 fewer dialogs in the DOM. F10's Sheet is a real <dialog> opened with
        showModal(), so the focus trap, Escape, backdrop dismissal and focus restoration to
        the chip that opened it all come from the platform.
      */}
      <CategoryPicker
        open={sheetItem !== null}
        value={sheetItem?.category ?? null}
        title={sheetItem?.name.trim() ? `Kategori · ${sheetItem.name.trim()}` : 'Pilih kategori'}
        onSelect={(category) => {
          if (sheetItem) props.onItemCategory(sheetItem.key, category)
        }}
        onClose={() => setSheetKey(null)}
      />
    </>
  )
}
