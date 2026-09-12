/**
 * ════════════════════════════════════════════════════════════════════════════
 *  #18 — the note field's read-only view, and the two ways it must not swallow a tap.
 *
 *  SOURCE ASSERTIONS, for the reason every other `*.contract.test.ts` in this directory gives:
 *  this suite runs on `environment: 'node'`, so a render could not see a focus change, a tap
 *  landing on a link versus the block behind it, or a new tab opening.
 *
 *  The two hazards this pins:
 *
 *   1. A tap on a linkified URL must open it AND must NOT also flip the field into edit mode —
 *      the two are mutually exclusive per the card's own design, and only `stopPropagation`
 *      inside the anchor's own click handler keeps them that way.
 *
 *   2. The blur handler used to close the box only when the draft was empty (F12's contract).
 *      #18 widens that to "nothing changed", so a value re-opened and blurred untouched
 *      returns to the read-only view instead of leaving a textarea standing open. Losing the
 *      unconditional `setEditing(false)` silently reintroduces the old, narrower behaviour.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const EDITOR = 'app/(bare)/e/[id]/ExpenseEditor.tsx'

/** Source with comments stripped, same helper `title.clear.contract.test.ts` uses. */
function code(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** The body of `NoteField`, isolated so an assertion cannot accidentally match `TitleField`. */
function noteFieldBody(source: string): string {
  const start = source.indexOf('function NoteField(')
  expect(start, 'NoteField not found').toBeGreaterThanOrEqual(0)
  return source.slice(start)
}

describe('NoteField — the read-only view', () => {
  const source = noteFieldBody(code(EDITOR))

  it('renders it only once there is a value and editing has not started', () => {
    expect(source).toContain('if (value && !editing) {')
  })

  it('renders the value through linkify, not as a raw string', () => {
    expect(source).toMatch(/linkify\(value\)\.map\(/)
  })

  it(
    "gives the pencil button NOTE_EDIT_LABEL as its accessible name — the note's only " +
      'guaranteed way into edit mode when the whole note is one bare URL',
    () => {
      expect(source).toContain('aria-label={NOTE_EDIT_LABEL}')
    },
  )

  it('opens a linkified URL in a new tab, never the current one', () => {
    const anchor = source.slice(source.indexOf('<a\n'), source.indexOf('</a>'))
    expect(anchor).toContain('target="_blank"')
    expect(anchor).toContain('rel="noopener noreferrer"')
  })

  it('stops a link tap from also bubbling into the block’s own onClick', () => {
    // Hazard 1. Without this, tapping a URL would open it AND flip the field into edit mode
    // in the same gesture.
    const anchor = source.slice(source.indexOf('<a\n'), source.indexOf('</a>'))
    expect(anchor).toContain('onClick={(event) => event.stopPropagation()}')
  })

  it('has no role="button" on the outer block, since it holds real interactive children', () => {
    // ARIA's button role forbids focusable descendants; the pencil button and any link inside
    // are the real, keyboard-reachable path into edit mode.
    const blockStart = source.indexOf('if (value && !editing)')
    const blockEnd = source.indexOf('return (\n    <Field label={NOTE_LABEL}>')
    expect(source.slice(blockStart, blockEnd)).not.toContain('role="button"')
  })
})

describe('NoteField — collapsing back on blur', () => {
  const source = noteFieldBody(code(EDITOR))

  it('commits only when the trimmed draft actually differs from the saved value', () => {
    expect(source).toMatch(/if \(trimmed !== value\) \{\s*onCommit\(trimmed\)\s*return\s*\}/)
  })

  it('closes the box unconditionally otherwise — not gated on the draft being empty', () => {
    // Hazard 2. F12 shipped `if (!trimmed) setExpanded(false)`; #18 needs the unconditional
    // form so a value re-opened and left untouched also returns to the read-only view.
    const onBlur = source.slice(source.indexOf('onBlur={() => {'), source.indexOf('}}\n      />'))
    expect(onBlur).not.toMatch(/if \(!trimmed\)/)
    expect(onBlur.trim().endsWith('setEditing(false)')).toBe(true)
  })
})
