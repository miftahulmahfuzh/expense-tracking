/**
 * Detail's item sheet: every `+ Tambah item` starts blank, and Nama is clearable.
 *
 * SOURCE ASSERTIONS, for the reason `input.clear.contract.test.ts` gives: this suite runs on
 * `environment: 'node'`, so it cannot render the sheet.
 *
 * The sheet stays mounted and resets only when its `key` changes. A constant `'add'` key kept
 * the previous add's name, amount and category alive into the next add.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const EDITOR = 'app/(bare)/e/[id]/ExpenseEditor.tsx'
const SHEET = 'app/(bare)/e/[id]/ItemSheet.tsx'

function code(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('adding an item', () => {
  const source = code(EDITOR)

  it('keys each add on a fresh counter, never a constant', () => {
    expect(source).toContain('`add:${addCount}`')
    expect(source).not.toContain(": 'add'}")
  })

  it('bumps the counter when `+ Tambah item` opens the sheet', () => {
    expect(source).toContain('setAddCount((n) => n + 1)')
  })
})

describe('the Nama field', () => {
  const source = code(SHEET)

  it('clears from the left edge, with a Kosongkan label', () => {
    expect(source).toContain("onClear={() => setName('')}")
    expect(source).toContain('clearLabel={ITEM_NAME_CLEAR}')
    expect(source).toContain('clearSide="left"')
  })
})
