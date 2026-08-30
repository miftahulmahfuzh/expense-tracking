/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The item row's truncation contract — F15, after "tanamera draft white caramel"
 *  shipped a row that shoved its own amount and delete button off the card.
 *
 *  SOURCE ASSERTIONS, NOT RENDERS, and for the same reason the Lightbox contract is:
 *  jsdom has no layout engine. `clientWidth` is 0 for everything it renders, so a
 *  component test cannot see an overflow, cannot see an ellipsis, and would have
 *  reported the broken row as passing — which is how it lasted from 2026-08-19 to
 *  2026-08-30 with the fix (`min-w-0`) sitting one line above the bug.
 *
 *  What went wrong is worth stating once, because it will be re-introduced by anyone
 *  who adds a row and reasons about it locally:
 *
 *      `truncate` sets `white-space: nowrap`, so the name's min-content size is the
 *      whole string. `min-w-0` on the name lets the NAME shrink; it does not shrink
 *      the name's min-content CONTRIBUTION to its container. So every ancestor that
 *      is itself a flex item AND a flex container needs its own `min-w-0`, or its
 *      `min-width: auto` floors it at the full string and nothing ever ellipsises.
 *
 *  Measured in Chromium at a 370px content box, "tanamera draft white caramel":
 *
 *      | ExpenseEditor row     | row scrollW | clientW | ellipsis |
 *      | without `min-w-0`     |         376 |     348 | no       |
 *      | with    `min-w-0`     |         348 |     348 | YES      |
 *
 *  So the assertion below is not style policing. 28px of overflow is the delete
 *  target leaving the card.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

/** Every file that renders an expense item's name in a row. */
const ROW_FILES = [
  'app/(bare)/e/[id]/ExpenseEditor.tsx',
  'app/(bare)/s/[token]/page.tsx',
  'app/(shell)/dev/ui/KitchenSink.tsx',
  'app/(shell)/m/[month]/GroupRow.tsx',
  'app/(shell)/stats/BiggestExpenseTile.tsx',
  'app/(shell)/stats/CategoryBreakdown.tsx',
] as const

/** Source with comments stripped: the mechanism is DISCUSSED in the docblocks. */
function code(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/**
 * Every `className` string in a file, in source order. Rows are written as literal
 * class strings throughout this app — no `cn()` at these call sites — so a regex over
 * the attribute is exact rather than approximate.
 */
function classNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1] ?? '')
}

describe('a truncating name never sits under an unfloored flex ancestor', () => {
  it.each(ROW_FILES)('%s: every flex-1 flex container also carries min-w-0', (file) => {
    const offenders = classNames(code(file)).filter((cls) => {
      const has = (c: string) => cls.split(/\s+/).includes(c)
      // A flex item (`flex-1`) that is ALSO a row flex container (`flex`, not `flex-col`)
      // floors itself at its content's min-content size unless min-w-0 says otherwise.
      return has('flex') && has('flex-1') && !has('flex-col') && !has('min-w-0')
    })

    expect(
      offenders,
      `these are flex-1 row containers with no min-w-0, so a nested \`truncate\` cannot ` +
        `shrink and the row will overflow its card:\n  ${offenders.join('\n  ') || '(none)'}`,
    ).toEqual([])
  })

  it('the Detail row — the one that broke — still carries the class', () => {
    /*
     * Pinned separately from the sweep above so that deleting the rule does not merely
     * make a generic assertion vacuous. This is the exact element from the bug report.
     */
    const detail = code('app/(bare)/e/[id]/ExpenseEditor.tsx')
    const rowButton = classNames(detail).find((cls) => cls.includes('min-h-row'))

    expect(rowButton, 'the Detail item row button vanished or was renamed').toBeDefined()
    expect(rowButton).toContain('min-w-0')
  })

  it('the name itself still truncates at every render site', () => {
    /*
     * The other half of the pair. `min-w-0` on the ancestor is only worth anything
     * because the name is `truncate`; drop that and the row overflows again, silently.
     */
    for (const file of ROW_FILES) {
      expect(code(file), `${file} renders no truncating text`).toMatch(/truncate/)
    }
  })
})
