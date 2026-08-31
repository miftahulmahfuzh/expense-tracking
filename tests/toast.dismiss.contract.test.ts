/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The toast's dismiss control — F16, card #10.
 *
 *  Until this card the sticker had NO way out but the timer: `dismiss()` existed on
 *  `ToastApi` and nothing outside the provider ever called it. The undo toast runs for
 *  `UNDO_DURATION_MS` (7s, longer than the 5s default on purpose), so a user who had
 *  already decided *not* to undo watched a sticker sit over the tab bar for six more
 *  seconds.
 *
 *  SOURCE ASSERTIONS, NOT RENDERS, for the reason `rows.truncation.contract` and
 *  `photos.lightbox.contract` both give: this suite runs on `environment: 'node'`, and
 *  jsdom has no layout engine — `clientWidth` is 0 for everything it renders. A component
 *  test cannot see a control squeezed off a row, cannot see a 44px hit area and cannot see
 *  a glyph that inverted to white on yellow. What ships is the source, so the source is
 *  what is asserted.
 *
 *  The five properties below are the five that a later edit would break SILENTLY — each
 *  one still renders, still typechecks, and is wrong:
 *
 *    1. the control exists and is named `Tutup` — the app's one word for this, spelled
 *       identically in `Sheet.tsx` and `components/share/copy.ts`;
 *    2. `shrink-0`, so a long item name can never push it off the sticker (F15);
 *    3. the 44px tap floor, by any of this repo's three idioms;
 *    4. the literal near-black, never a `text-ink*` token — the sticker is yellow in BOTH
 *       schemes, so an inverting token disappears in dark mode;
 *    5. it is wired to the provider's own `dismiss`, not to the action's handler.
 *
 *  NOT asserted: that the control is conditional on `toast.action`. That is a design call
 *  (plan F16 §2) and it is one line to reverse — freezing it here would make a legitimate
 *  product decision look like a regression.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const TOAST = 'components/ui/Toast.tsx'

/** Source with comments stripped: the mechanism is DISCUSSED in the docblocks. */
function code(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const source = code(TOAST)

/**
 * The whole `<button>…</button>` carrying the dismiss label, children included.
 *
 * Sliced rather than regexed per attribute because this component composes its classes
 * through `cn(…)` instead of one literal `className="…"` — the trick `rows.truncation`
 * uses would find nothing here. Buttons are never nested, so the non-greedy match is exact.
 */
function dismissButton(): string {
  const buttons = source.match(/<button\b[\s\S]*?<\/button>/g) ?? []
  const found = buttons.filter((b) => b.includes('aria-label="Tutup"'))
  expect(
    found,
    `expected exactly one <button aria-label="Tutup"> in ${TOAST}; found ${found.length}. ` +
      `The toast's only exit would be its timer again.`,
  ).toHaveLength(1)
  return found[0] ?? ''
}

describe('the toast can be dismissed by hand', () => {
  it("renders a dismiss button named with the app's one word for it", () => {
    const button = dismissButton()
    // `Tutup` and nothing else: Sheet.tsx and components/share/copy.ts already spell it, and
    // R-40's rule is that one action does not get two vocabularies.
    expect(button).toContain('aria-label="Tutup"')
    expect(source).not.toMatch(/aria-label="(Close|Batal|Hapus notifikasi)"/)
  })

  it("calls the provider's dismiss, not the action's handler", () => {
    // `onClick={() => toast.action?.onAction()}` here would undo the delete instead of
    // closing the message — the one wiring mistake that looks identical on screen.
    expect(dismissButton()).toContain('onClick={dismiss}')
  })

  it('renders the icon-set glyph rather than a typed character', () => {
    // icon.contract.test.ts forbids a typed `x` standing in for a picture; this asserts the
    // positive half, plus the sibling import that keeps the barrel out of a cycle.
    expect(dismissButton()).toContain('<CloseIcon')
    expect(source).toContain("import { CloseIcon } from './Icon'")
    expect(source).not.toMatch(/from '@\/components\/ui'/)
  })
})

describe('the dismiss button survives the row it sits in', () => {
  const classes = () => {
    const m = dismissButton().match(/className="([^"]*)"/)
    expect(m, 'the dismiss button has no literal className to read').not.toBeNull()
    return (m?.[1] ?? '').split(/\s+/)
  }

  it('is floored at its own size, so a long message cannot push it off the sticker', () => {
    /*
     * F15, applied before it can bite. The message is the only `min-w-0 flex-1` child of the
     * sticker, so it is what shrinks; both trailing controls must refuse to. Without
     * `shrink-0` a name like "tanamera draft white caramel" walks the dismiss target past
     * the sticker's right edge exactly as it once walked the Detail row's delete target off
     * its card.
     */
    expect(classes()).toContain('shrink-0')
  })

  it('reaches the 44px tap floor', () => {
    // Three idioms in this repo, any of which is a pass: `touch-target` expands a small
    // painted box (Chip, the row delete, the month chevrons), `size-touch` paints the whole
    // 44 (Sheet's header), `min-h-touch` floors the height only (the action button beside it).
    const FLOOR = ['touch-target', 'size-touch', 'min-h-touch']
    const cls = classes()
    expect(
      FLOOR.some((c) => cls.includes(c)),
      `none of ${FLOOR.join(' / ')} on the dismiss button — design R-41 puts the floor at 44px, ` +
        `and a 22px glyph in a 32px box is 32.`,
    ).toBe(true)
  })

  it('is painted in the literal near-black, never a token that inverts', () => {
    /*
     * The sticker is `bg-yellow` in BOTH schemes — the component's docblock is explicit that
     * it does not flip with the theme. `text-ink` inverts to white in dark mode, so a glyph
     * wearing it would be white on yellow: still rendered, still passing typecheck, invisible.
     * The message next to it carries the same literal for the same reason.
     */
    const cls = classes()
    expect(cls).toContain('text-[#0d0d0d]')
    expect(cls.filter((c) => /^text-ink/.test(c))).toEqual([])
  })
})
