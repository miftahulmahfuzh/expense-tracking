/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F18 — the clear button on the two fields labelled `Judul`, and the one way
 *  each of them can be broken back without the diff looking wrong.
 *
 *  SOURCE ASSERTIONS, for the reason `input.clear.contract.test.ts` gives at
 *  length: this suite runs on `environment: 'node'`, so a render could not see a
 *  focus loss, a hit area, or a write that reached the server.
 *
 *  The two fields share a label and share nothing else, which is the whole
 *  hazard here:
 *
 *   1. `/new` IS FULLY CONTROLLED. Its clear must go through `onTitleChange`,
 *      the single path typing already uses, or the draft reducer, the
 *      localStorage draft and `validate.ts` see a title the form does not have.
 *
 *   2. `/e/[id]` COMMITS ON BLUR. Its clear must move the LOCAL draft only. An
 *      `onCommit('')` here would push an empty title at a server that rejects it
 *      — and would do it from a button whose whole promise is that it is
 *      harmless. The field's own empty-blur revert is what makes the local-only
 *      clear safe, so that revert is pinned here too: this card's decision to
 *      ship the ✕ on this field rests on it, and removing it silently would
 *      leave the ✕ standing on a contract that no longer exists.
 *
 *   3. THE VERB IS `Kosongkan`. `Hapus` is the destructive one (`ItemRow`), and
 *      the two must not converge just because this field has no delete next to it.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const REVIEW = 'app/(bare)/new/ReviewStage.tsx'
const EDITOR = 'app/(bare)/e/[id]/ExpenseEditor.tsx'

/** Source with comments stripped: every mechanism here is DISCUSSED in a docblock. */
function code(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** The `<Input …>` element whose props contain `marker`, comments already stripped. */
function inputBlock(source: string, marker: string): string {
  const blocks = [...source.matchAll(/<Input\b[\s\S]*?\/>/g)].map((match) => match[0])
  const found = blocks.filter((block) => block.includes(marker))
  expect(found, `exactly one <Input> containing ${marker}`).toHaveLength(1)
  return found[0] ?? ''
}

describe('/new — the parsed title', () => {
  const source = code(REVIEW)
  const input = inputBlock(source, 'id="draft-title"')

  it('clears through the same `onTitleChange` typing goes through', () => {
    // Hazard 1. One path into `draft.title`, so nothing can skip a check by being a clear.
    expect(input).toContain("onClear={() => props.onTitleChange('')}")
    expect(input).toContain('onChange={(event) => props.onTitleChange(event.target.value)}')
  })

  it('still hands `Input` the disabled flag that hides the button while saving', () => {
    // `Input` gates `showClear` on `rest.disabled`; drop this and a busy form stays editable
    // through the one control that looks harmless.
    expect(input).toContain('disabled={saving}')
  })

  it('names the button with the clear verb', () => {
    expect(input).toContain('clearLabel="Kosongkan judul"')
  })
})

describe('/e/[id] — the committed title', () => {
  const source = code(EDITOR)
  const input = inputBlock(source, 'onBlur={() => {')

  it('clears the LOCAL draft only, never committing an empty title', () => {
    // Hazard 2. `onCommit('')` from here would send the server a title it rejects.
    expect(input).toContain("onClear={() => setDraft('')}")
    expect(input).not.toMatch(/onClear=\{[^}]*onCommit/)
  })

  it('still reverts silently on an empty blur, which is what makes that safe', () => {
    // The contract this card's decision rests on: clearing reaches a state the field already
    // handled, rather than a new one. If this goes, the ✕ needs revisiting — not just fixing.
    expect(source).toMatch(/if \(!trimmed\) \{\s*setDraft\(value\)\s*return\s*\}/)
  })

  it('does not remount itself on a clear', () => {
    // The resync contract is `key={`title:${optimisticMeta.title}`}` at the call site — keyed
    // on the COMMITTED value. A clear that committed would remount the field mid-edit.
    expect(source).toContain('key={`title:${optimisticMeta.title}`}')
  })

  it('names the button with the clear verb, off the same label constant', () => {
    // Hazard 3.
    expect(input).toContain('clearLabel={`Kosongkan ${TITLE_LABEL.toLowerCase()}`}')
    expect(source).not.toMatch(/clearLabel=\{?["`]?Hapus/)
  })
})
