/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F18 — the Jumlah field's clear button, and the seven ways it can be undone
 *  without anything looking wrong in review.
 *
 *  SOURCE ASSERTIONS, NOT RENDERS, for the reason `input.clear.contract` gives at
 *  length: this suite runs on `environment: 'node'`. There is no layout engine, so
 *  no component test here can see a hit area, an overlapping `::after`, a glyph
 *  sitting on a digit, or which of two conflicting padding utilities the generated
 *  stylesheet picked. It would report every failure below as passing.
 *
 *  What is pinned, in the order it would hurt:
 *
 *   1. `/new`'s REVIEW ROW STAYS UNCLEARABLE. This is the one invariant no other
 *      file records and the only one that is a measurement rather than a
 *      mechanism. That column affords the input 100px; `4.500.000` measures 81 and
 *      `999.999.999` 100 (Chromium 150, 414x896 DPR 2). Reserving the button's
 *      gutter shrinks the input to 62 — issue #3, re-shipped, and a clipped
 *      `<input>` throws nothing and reads as a smaller number. Adding one prop
 *      there is a two-character diff that looks like a completed series.
 *
 *   2. BOTH HALVES OF THE STATE. `unparseable` holds text no parser could read and
 *      is component-local by construction. A ✕ that only nulls the value leaves
 *      the unreadable paste on screen.
 *
 *   3. THE GATE IS THE DISPLAYED TEXT, NOT THE VALUE. An unreadable paste HAS no
 *      value, and it is the state a user is most stuck in.
 *
 *   4. NO OVERLAP WITH THE DESTRUCTIVE ✕, on two axes. `touch-target` centres a
 *      44px `::after` on its button; on a 14px glyph inset in a 50px well it
 *      reaches ~15px sideways past the field and ~15px out of it vertically. On
 *      `/new` both land in `ItemRow`'s `size-touch` delete — 8px right of the name
 *      field, at this column's own x, 8px above. Nothing paints, so review cannot
 *      see it.
 *
 *   5. ONE PADDING DECLARATION PER SIDE. `lib/cn.ts` is a plain join with no
 *      tailwind-merge, so `pr-1.5` next to `pr-touch` emits both and the generated
 *      stylesheet decides — invisibly from the call site. Hence the ternary.
 *
 *   6. THE WIDTH FLOOR STAYS. `min-w-[6rem]` is what makes misuse of this prop a
 *      VISIBLE overflow instead of a silent shrink. `scripts/f05-audit.sh` forbids
 *      `min-w-0`; nothing else asserts the floor is still there at all.
 *
 *   7. THE LABEL IS THE OPT-IN. Every glyph is `aria-hidden` (icon contract), so
 *      the button's only accessible name is the call site's — and here its presence
 *      is what renders the button, which makes clearable-but-unnamed unreachable
 *      rather than merely uncompilable.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const MONEY = 'components/ui/MoneyInput.tsx'
const ROW = 'app/(bare)/new/ItemRow.tsx'
const SHEET = 'app/(bare)/e/[id]/ItemSheet.tsx'

const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

/** Source with comments stripped: every mechanism here is DISCUSSED in a docblock. */
function code(file: string): string {
  return read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** Every `className="…"` value in a file, in source order. */
function classNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)].map((match) => match[1] ?? '')
}

describe('the review row on /new, which cannot afford the button', () => {
  const source = code(ROW)

  it('passes NO clear label to its MoneyInput', () => {
    // Hazard 1. 100px of input against 81px for `4.500.000`; reserving 44 leaves 62.
    const amount = source.slice(source.indexOf('<MoneyInput'))
    expect(amount).toContain('<MoneyInput')
    expect(amount).not.toContain('clearLabel')
  })

  it('still clears its NAME field, which is F17 and unaffected', () => {
    // The refusal above is about pixels in one column, not a reversal of the series.
    expect(source).toContain("onClear={() => onNameChange('')}")
  })
})

describe('clearing resets the whole field', () => {
  const source = code(MONEY)

  it('nulls the value AND the unparseable escape hatch, in that order', () => {
    // Hazard 2. `handleChange`'s empty branch does the same two calls in the same order, so a
    // ✕ is indistinguishable downstream from a field emptied by hand.
    const click = source.slice(source.indexOf('onClick={() => {'))
    const unparseable = click.indexOf('setUnparseable(null)')
    const value = click.indexOf('onValueChange(null)')
    expect(unparseable).toBeGreaterThanOrEqual(0)
    expect(value).toBeGreaterThan(unparseable)
  })

  it('refocuses the input without the scroll jump', () => {
    // Both halves: the tap must not blur (iOS closes the keyboard), and a field that was NOT
    // focused must end up focused — without the jump ReviewStage documents.
    expect(source).toContain('onMouseDown={(event) => event.preventDefault()}')
    expect(source).toContain('inner.current?.focus({ preventScroll: true })')
  })

  it('holds the node it refocuses', () => {
    expect(source).toContain('const inner = React.useRef<HTMLInputElement | null>(null)')
    expect(source).toContain('ref={inner}')
  })
})

describe('the button', () => {
  const source = code(MONEY)

  it('shows only for a clearable, enabled field with something on screen', () => {
    // Hazard 3. `text` is `unparseable ?? formatIdrDigits(value)`, so a paste no parser could
    // read — which has no value at all — still gets its way out.
    expect(source).toContain(
      "const showClear = clearLabel !== undefined && !rest.disabled && text !== ''",
    )
    expect(source).not.toMatch(/showClear\s*=[^\n]*value !== null/)
  })

  it('carries the call site’s label, never a bare glyph', () => {
    // Hazard 7, the runtime half. The opt-in half is that `showClear` reads `clearLabel`.
    expect(source).toContain('aria-label={clearLabel}')
  })

  it('is painted at `xs` — 14px, matching Input’s clear and not the row delete’s 22px', () => {
    // `size` is a prop and never a className (icon contract).
    expect(source).toContain('<CloseIcon size="xs" />')
    expect(code(ROW)).toContain('<CloseIcon />')
  })

  it('gets its 44px from a real `w-touch` box, never from `touch-target`', () => {
    // Hazard 4, both axes.
    const button = classNames(source).find((value) => value.includes('absolute'))
    expect(button).toBeDefined()
    expect(button).toContain('w-touch')
    expect(button).toContain('right-0')
    expect(button).toContain('inset-y-0')
    expect(source).not.toContain('touch-target')
  })

  it('sits inside a positioned well, after the input, so nothing remounts', () => {
    // The well is unconditional and the button is appended AFTER the <input>, so the input's
    // index among its siblings never changes when the button appears on the first keystroke.
    const well = classNames(source).find((value) => value.includes('h-control'))
    expect(well).toBeUndefined() // the well's classes are composed by cn(), not a literal
    expect(source).toContain("'glass relative flex h-control")
    expect(source.indexOf('{showClear && (')).toBeGreaterThan(source.indexOf('<input'))
  })
})

describe('the gutter, which no stylesheet order gets to decide', () => {
  const source = code(MONEY)

  it('is one ternary, never two padding classes in one list', () => {
    // Hazard 5.
    expect(source).toContain("showClear ? 'pr-touch' : 'pr-1.5'")
    expect(source).toContain("'pl-3.5',")
  })

  it('leaves no literal in the file carrying two right paddings', () => {
    for (const value of [
      ...classNames(source),
      ...[...source.matchAll(/'([^'\\\n]*)'/g)].map((m) => m[1] ?? ''),
    ]) {
      const rights = value.match(/\b(pr-[\w.[\]]+|px-[\w.[\]]+)\b/g) ?? []
      expect(rights.length, value).toBeLessThan(2)
    }
  })

  it('keeps the width floor that makes misuse visible', () => {
    // Hazard 6. Without it the input shrinks under its content and a too-narrow container
    // silently drops digits instead of overflowing where somebody sees it.
    expect(source).toContain('min-w-[6rem]')
  })
})

describe('the sheet that got it', () => {
  const source = code(SHEET)

  it('names the button without the footer’s destructive verb', () => {
    // `Hapus item` sits in this sheet's footer. `Kosongkan` is F17's verb for the same act.
    expect(source).toContain('clearLabel={ITEM_AMOUNT_CLEAR}')
    expect(read('app/(bare)/e/[id]/copy.ts')).toContain(
      "export const ITEM_AMOUNT_CLEAR = 'Kosongkan jumlah'",
    )
  })
})
