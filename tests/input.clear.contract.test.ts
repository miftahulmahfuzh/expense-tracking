/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F17 — the item Nama field's clear button, and the four ways it can be broken
 *  again without anything looking wrong in review.
 *
 *  SOURCE ASSERTIONS, NOT RENDERS, for the same reason the truncation and icon
 *  contracts are: this suite runs on `environment: 'node'`. There is no layout
 *  engine, so a component test cannot see a hit area, cannot see a focus loss on
 *  remount, and cannot see which of two conflicting padding utilities the
 *  generated stylesheet picked. It would report every failure below as passing.
 *
 *  What is pinned here, in the order it would hurt:
 *
 *   1. THE WRAPPER IS STABLE. The early return is gated on `onClear`, which is
 *      fixed per call site — never on the button's visibility, which flips on the
 *      first keystroke. Gate it on the latter and the element at that position
 *      changes `input` → `div`: React unmounts the input, mounts a fresh one, and
 *      the field loses focus and the keyboard closes as the user types character
 *      one. That is worse than the backspacing the feature exists to remove.
 *
 *   2. NO OVERLAP WITH THE DESTRUCTIVE ✕. `ItemRow` puts a `size-touch` delete 8px
 *      to the right of this field. `touch-target` centres a 44px `::after` on its
 *      button, so on a glyph inset 14px from the field's right edge it reaches
 *      ~15px past that edge — across the `gap-2`, into the delete's own 44px. A
 *      harmless action sharing a hit area with a destructive one, invisibly.
 *
 *   3. THE LABEL IS TYPE-REQUIRED. Every glyph is `aria-hidden` (icon contract), so
 *      the button's only accessible name is the call site's. A single optional prop
 *      makes "clearable but unnamed" shippable; the union makes it not compile.
 *
 *   4. ONE PADDING DECLARATION PER SIDE. `lib/cn.ts` is a plain join with no
 *      tailwind-merge, so `px-3.5` next to `pr-touch` emits both and the generated
 *      stylesheet decides — invisibly from the call site. Hence `CONTROL_BASE`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const FIELD = 'components/ui/Field.tsx'
const ROW = 'app/(bare)/new/ItemRow.tsx'

const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

/** Source with comments stripped: every mechanism here is DISCUSSED in a docblock. */
function code(file: string): string {
  return read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/**
 * Every single-quoted string literal in a file. Class lists in this repo are written as
 * literals — `cn()` composes them but never builds one from fragments — so a scan over the
 * literals is exact rather than approximate.
 */
function literals(source: string): string[] {
  return [...source.matchAll(/'([^'\\\n]*)'/g)].map((match) => match[1] ?? '')
}

/** Every `className="…"` value in a file, in source order. */
function classNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)].map((match) => match[1] ?? '')
}

describe('the wrapper Input renders around a clearable input', () => {
  const source = code(FIELD)

  it('appears whenever `onClear` was passed, and NOT only while the button shows', () => {
    // Hazard 1. `onClear` is stable per call site; `showClear` is not.
    expect(source).toContain('if (onClear === undefined) return input')
    expect(source).not.toMatch(/if \(!?\s*showClear\)\s*return/)
  })

  it('renders the button conditionally INSIDE that stable wrapper', () => {
    // The button may come and go — it is the <input>'s position in the tree that may not.
    expect(source).toMatch(/\{showClear && \(/)
    expect(source).toMatch(/<div className="relative">[\s\S]*\{input\}/)
  })
})

describe('the button', () => {
  const source = code(FIELD)

  it('shows only for a non-empty, enabled, clearable field', () => {
    // A permanently visible ✕ on an empty field is chrome pointing at nothing; a live one on a
    // disabled field edits a form the user has been told is busy saving.
    expect(source).toContain(
      "const showClear = onClear !== undefined && !rest.disabled && String(rest.value ?? '') !== ''",
    )
  })

  it('carries the call site’s label, never a bare glyph', () => {
    // Hazard 3, the runtime half.
    expect(source).toContain('aria-label={clearLabel}')
  })

  it('makes an unlabelled clearable input fail to compile', () => {
    // Hazard 3, the half that catches it before this test ever runs.
    expect(source).toContain('{ onClear: () => void; clearLabel: string }')
    expect(source).toContain('{ onClear?: undefined; clearLabel?: undefined }')
  })

  it('is painted at `xs` — 14px, against the row delete’s 22px', () => {
    // Hazard 2's first separation. `size` is a prop and never a className (icon contract).
    expect(source).toContain('<CloseIcon size="xs" />')
    expect(code(ROW)).toContain('<CloseIcon />')
  })

  it('gets its 44px from a real `w-touch` box, never from `touch-target`', () => {
    // Hazard 2. The utility's ::after would reach past the field, into the delete's hit area.
    const button = classNames(source).find((value) => value.includes('absolute'))
    expect(button).toBeDefined()
    expect(button).toContain('w-touch')
    expect(button).toContain('right-0')
    expect(source).not.toContain('touch-target')
  })

  it('keeps focus on the input rather than taking it', () => {
    // Both halves: the tap must not blur (iOS closes the keyboard), and a field that was NOT
    // focused must end up focused — without the scroll jump ReviewStage documents.
    expect(source).toContain('onMouseDown={(event) => event.preventDefault()}')
    expect(source).toContain('inner.current?.focus({ preventScroll: true })')
  })

  it('forwards the caller’s ref as well as holding its own', () => {
    // F05's focus manager moves focus to a new row's name field; swallowing the ref would
    // break `+ Tambah item` silently, since nothing else reads that ref.
    expect(source).toContain("if (typeof ref === 'function') ref(node)")
    expect(source).toContain('else if (ref) ref.current = node')
  })
})

describe('padding, which no stylesheet order gets to decide', () => {
  const source = read(FIELD)

  it('splits the right side off `CONTROL_BASE`', () => {
    // Hazard 4.
    expect(source).toContain('const CONTROL_BASE =')
    expect(source).toContain("export const CONTROL_CLASS = CONTROL_BASE + ' pr-3.5'")
  })

  it('gives a clearable input exactly one right padding', () => {
    expect(code(FIELD)).toContain("cn(CONTROL_BASE, showClear ? 'pr-touch' : 'pr-3.5', className)")
  })

  it('leaves no literal in the file carrying both `px-` and `pr-`', () => {
    for (const value of [...literals(source), ...classNames(source)]) {
      if (value.includes('px-')) expect(value, value).not.toContain('pr-')
    }
  })
})

describe('the row that asked for it', () => {
  const source = code(ROW)

  it('clears through the same `onNameChange` typing goes through', () => {
    // One path into `draft.items[].name`, so the reducer, the localStorage draft and
    // validate.ts all see a clear exactly as they see a deletion typed by hand.
    expect(source).toContain("onClear={() => onNameChange('')}")
  })

  it('names the button per item, and not with the delete’s verb', () => {
    // `Hapus roti buaya` deletes the row. A clear button called `Hapus teks roti buaya` differs
    // from it by one word in the middle, spoken, one row apart.
    expect(source).toContain('clearLabel={`Kosongkan nama ${label}`}')
    expect(source).toContain('aria-label={`Hapus ${label}`}')
  })
})
