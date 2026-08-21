import { describe, expect, it } from 'vitest'

import { MAX_TITLE } from '@/app/(bare)/new/draft'
import { TITLE_PRESETS } from '@/lib/titlePresets'

/**
 * F12 §5. A preset that cannot be saved is worse than no preset: the chip fills the field and
 * the form then refuses it, blaming the user for a string the app supplied.
 */
describe('TITLE_PRESETS', () => {
  it('every preset is saveable — non-empty and within MAX_TITLE', () => {
    for (const preset of TITLE_PRESETS) {
      expect(preset.trim(), preset).not.toBe('')
      expect(preset.length, `${preset} is ${preset.length} chars, max ${MAX_TITLE}`).toBeLessThanOrEqual(
        MAX_TITLE,
      )
    }
  })

  it('has no duplicates — a repeated chip is two identical buttons', () => {
    expect(new Set(TITLE_PRESETS).size).toBe(TITLE_PRESETS.length)
  })

  it('is already trimmed, so `value.trim() === preset` can light the active chip', () => {
    // TitlePresets compares the trimmed field value against the raw preset. A preset with
    // incidental whitespace would never match and its chip could never go yellow.
    for (const preset of TITLE_PRESETS) expect(preset).toBe(preset.trim())
  })

  it('leads with the daily title, which is the whole point of the feature', () => {
    // The card: "pengeluaran harian … is the most title I will ever used." Only ~2.5 chips are
    // visible before the scroll edge on a 414px screen, so this is a layout guarantee, not taste.
    expect(TITLE_PRESETS[0]).toBe('pengeluaran harian')
  })

  it('preserves the user’s own casing rather than Title-Casing values', () => {
    // globals.css requires Title Case for LABELS. These are values — see the module docblock.
    expect(TITLE_PRESETS).toContain('IPL tokyo')
    expect(TITLE_PRESETS).not.toContain('Ipl Tokyo')
  })
})
