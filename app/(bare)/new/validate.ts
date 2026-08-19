import { MAX_AMOUNT, MAX_ITEMS, MAX_NOTE, MAX_NAME, MAX_TITLE, NO_ERRORS } from './draft'
import type { DraftExpense, FieldErrors, FocusRequest } from './draft'

/**
 * Validation runs on Simpan, not on every keystroke.
 *
 * THE SIMPAN BUTTON IS NEVER DISABLED FOR VALIDATION. A disabled button on a phone is a
 * dead end: the user taps, nothing happens, and nothing on screen says why. Instead the tap
 * always does something — validate, render inline errors, move focus to the first bad
 * control, and announce the count in a role="alert". The button is disabled only for
 * double-submit and while F06 still has bytes in flight (R-31), which are both states with
 * visible explanations of their own.
 *
 * Every limit here mirrors lib/schema/expense.ts, so a draft that passes this cannot be
 * rejected by the server's Zod — which would surface as the generic save failure and tell
 * the user nothing.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  // The round-trip is the point: Date happily rolls 2026-02-31 forward into March, so
  // comparing the formatted result back against the input is what rejects it.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export type ValidationResult = { errors: FieldErrors; focus: FocusRequest; count: number }

/** Returns null when the draft is safe to send to createExpense. */
export function validateDraft(draft: DraftExpense): ValidationResult | null {
  const errors: FieldErrors = { items: {} }
  let focus: FocusRequest = null
  let count = 0

  const title = draft.title.trim()
  if (title.length === 0) errors.title = 'Judul belum diisi.'
  else if (title.length > MAX_TITLE) errors.title = `Judul terlalu panjang (maks ${MAX_TITLE}).`
  if (errors.title) {
    count += 1
    focus = { target: 'element', id: 'draft-title' }
  }

  if (!isValidIsoDate(draft.occurredOn)) {
    errors.occurredOn = 'Tanggal tidak valid.'
    count += 1
    focus ??= { target: 'element', id: 'draft-date' }
  }

  if (draft.items.length === 0) {
    errors.form = 'Tambahkan minimal satu item.'
    count += 1
    focus ??= { target: 'add-item' }
  } else if (draft.items.length > MAX_ITEMS) {
    errors.form = `Maksimal ${MAX_ITEMS} item.`
    count += 1
  }

  for (const item of draft.items) {
    const itemErrors: { name?: string; amount?: string } = {}

    const name = item.name.trim()
    if (name.length === 0) itemErrors.name = 'Nama item belum diisi.'
    else if (name.length > MAX_NAME) itemErrors.name = `Maks ${MAX_NAME} karakter.`

    if (item.amountIdr === null) {
      // Quoting the text back is the difference between "something is wrong" and "THIS is
      // what I could not read", which is the only version a user can act on.
      itemErrors.amount =
        item.amountRaw === null
          ? 'Jumlah belum diisi.'
          : `"${item.amountRaw}" tidak dikenali sebagai jumlah.`
    } else if (!Number.isInteger(item.amountIdr) || item.amountIdr < 0) {
      itemErrors.amount = 'Jumlah harus angka bulat ≥ 0.'
    } else if (item.amountIdr > MAX_AMOUNT) {
      itemErrors.amount = 'Jumlah terlalu besar.'
    }

    if (itemErrors.name || itemErrors.amount) {
      errors.items[item.key] = itemErrors
      count += itemErrors.name && itemErrors.amount ? 2 : 1
      focus ??= { target: 'item-name', key: item.key }
    }
  }

  if (draft.note.trim().length > MAX_NOTE) {
    errors.note = `Catatan terlalu panjang (maks ${MAX_NOTE}).`
    count += 1
    focus ??= { target: 'element', id: 'draft-note' }
  }

  if (count === 0) return null
  return { errors: { ...NO_ERRORS, ...errors }, focus, count }
}

export function errorSummary(count: number): string {
  return count === 1
    ? 'Ada 1 isian yang perlu diperbaiki.'
    : `Ada ${count} isian yang perlu diperbaiki.`
}
