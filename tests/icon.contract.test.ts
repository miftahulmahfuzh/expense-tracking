/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F12 §1 — the icon dependency was taken on ONE condition, and this is it.
 *
 *  Three files used to argue against installing lucide, and the half of that argument which
 *  still stands is: "a 2.5 stroke, not the 1.5 an icon library ships: the system is Archivo at
 *  800-900 weight and a hairline glyph next to it reads as a different app."
 *
 *  `components/ui/Icon.tsx` promotes that from a comment into props. But a contract enforced in
 *  one file is only a contract if nothing can go round it, and going round it is EASIER than
 *  using it: `import { Trash2 } from 'lucide-react'` then `<Trash2 className="size-5" />` is
 *  less typing, renders fine, and is a hairline. Nobody reviewing that diff would see a bug.
 *
 *  So this asserts the property from outside: exactly one module may name the package, and that
 *  module must set all three attributes. Source analysis rather than rendering, because the
 *  suite runs on `environment: 'node'` — and because what actually ships is the source.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const ICON_MODULE = 'components/ui/Icon.tsx'

/**
 * This file quotes every pattern it forbids — the package name, the deep path, and all seven
 * retired characters — because the assertions have to name what they are looking for. Excluding
 * itself is not a loophole: nothing here renders.
 */
const SELF = 'tests/icon.contract.test.ts'

/** Every .ts/.tsx file we author. Build output, deps and the worktrees are not ours. */
function sourceFiles(): string[] {
  const skip = new Set(['node_modules', '.next', '.git', '.worktrees', 'drizzle', 'public'])
  const out: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(relative(repoRoot, full))
    }
  }
  walk(repoRoot)
  return out
}

const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

describe('the lucide choke point', () => {
  it('is named by exactly ONE module in the repo', () => {
    const importers = sourceFiles()
      .filter((f) => f !== SELF)
      .filter((f) => /from '(lucide-react[^']*)'/.test(read(f)))
    expect(importers.sort()).toEqual([ICON_MODULE])
  })

  it('is not reachable through a deep path either', () => {
    // `lucide-react/dist/esm/icons/trash-2` would satisfy a naive check for the bare name.
    for (const file of sourceFiles()) {
      if (file === ICON_MODULE || file === SELF) continue
      expect(read(file), file).not.toMatch(/lucide-react\//)
    }
  })

  it('is guarded by eslint as well, so the failure is caught before the test run', () => {
    // Belt and braces on purpose: the test tells you WHY, the lint rule tells you AT THE MOMENT
    // you write it. Losing either leaves the contract resting on the other.
    const config = read('eslint.config.mjs')
    expect(config).toContain("name: 'lucide-react'")
    expect(config).toContain("ignores: ['components/ui/Icon.tsx']")
  })
})

describe('the stroke contract', () => {
  const source = read(ICON_MODULE)

  it('sets all three attributes that make a lucide glyph match Archivo', () => {
    // These exact three values came from FullscreenToggle's retired `GLYPH` constant. lucide's
    // defaults are strokeWidth 2, round caps and round joins — all three differ.
    expect(source).toContain('strokeWidth={2.5}')
    expect(source).toContain('strokeLinecap="square"')
    expect(source).toContain('strokeLinejoin="miter"')
  })

  it('applies them in ONE place, so a new glyph cannot forget them', () => {
    // If `strokeWidth` ever appears twice, the set has grown a second rendering path and this
    // file's guarantee is now "most glyphs".
    expect(source.match(/strokeWidth=/g)).toHaveLength(1)
  })

  it('marks every glyph aria-hidden — the word lives on the button, not the picture', () => {
    expect(source).toContain('aria-hidden="true"')
  })

  it('exposes size as a PROP and never as a className override', () => {
    // lib/cn.ts is a plain join with no tailwind-merge, so `cn('size-5.5', 'size-3')` emits both
    // and the generated stylesheet's order decides — invisibly, from the call site's point of
    // view. cn's own docblock names the fix: expose a prop.
    expect(source).toContain('SIZE[size]')
    expect(source).toMatch(/const SIZE: Record<IconSize, string>/)
  })
})

describe('the retired hand-drawn glyphs', () => {
  it('left no <svg> behind anywhere in app/ or components/', () => {
    // Four glyph components and seven typed characters were replaced. A surviving <svg> would be
    // a twelfth drawing nobody is checking against the other eleven.
    const offenders = sourceFiles()
      .filter((f) => f.startsWith('app/') || f.startsWith('components/'))
      .filter((f) => read(f).includes('<svg'))
    expect(offenders).toEqual([])
  })

  it('left no typed glyph standing in for an icon', () => {
    /*
     * `✕` U+2715, `×` U+00D7, `⧉` U+29C9, `‹ ›` U+2039/203A, `↑ ↓ →`. Each was a character asked
     * to be a picture, rendered at whatever weight the font happened to have for it — and `⧉` is
     * outside Archivo's coverage entirely, so it fell back per-device.
     *
     * MATCHED BY SHAPE, NOT BY CHARACTER, because some of these are legitimate TYPOGRAPHY: the
     * dev page's "the hit area is a full 44×44" wants a real multiplication sign, and forbidding
     * the codepoint outright would make the rule wrong rather than strict. Every retired glyph
     * was written one of exactly two ways —
     *
     *     >✕<                    sole child, inline
     *     \n          ‹\n        alone on its own line, as a JSX text child
     *
     * — and neither shape has any use except "this character is the picture".
     *
     * Comments are stripped first: several docblocks quote these characters while explaining what
     * replaced them, and this assertion is about code.
     */
    const code = (file: string) =>
      read(file)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')

    const GLYPH = '✕✖×⧉‹›↑↓→'
    const soleChild = new RegExp(`>\\s*[${GLYPH}]\\s*<`)
    const ownLine = new RegExp(`^\\s*[${GLYPH}]\\s*$`, 'm')

    for (const file of sourceFiles()) {
      if (!file.startsWith('app/') && !file.startsWith('components/')) continue
      expect(code(file), `${file} — glyph as an element's sole child`).not.toMatch(soleChild)
      expect(code(file), `${file} — glyph alone on a line`).not.toMatch(ownLine)
    }
  })
})
