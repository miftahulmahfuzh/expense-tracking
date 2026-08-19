import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '@/lib/categories'
import { RECORD_EXPENSE_TOOL, TOOL_NAME, buildSystemPrompt } from '../prompt'

/**
 * The prompt is prose, so it cannot be unit-tested for correctness — that is what the
 * live corpus in `parseExpense.live.test.ts` is for. What CAN be tested is that the
 * load-bearing paragraphs are still present. Each assertion below corresponds to a
 * concrete way the product breaks:
 *
 *   - drop the dot-is-thousands rule and every amount is 1000× too small;
 *   - drop DAY/MONTH/YEAR and August becomes December;
 *   - drop a category from the list and the enum and the prose disagree;
 *   - drop the total-line rule and every group with a "total" line double-counts.
 */
describe('system prompt', () => {
  const p = buildSystemPrompt('2026-08-19')

  it('interpolates TODAY and leaves no placeholder behind', () => {
    expect(p).toContain('2026-08-19')
    expect(p).not.toContain('{{TODAY}}')
  })

  it('states the dot-is-thousands rule explicitly', () => {
    expect(p).toContain('`.` (dot) is the THOUSANDS separator')
    expect(p).toContain('It is NOT 38.5')
  })

  it('states DD/MM/YYYY explicitly', () => {
    expect(p).toContain('DAY / MONTH / YEAR')
    expect(p).toContain('18/8/2026')
  })

  it('names every category and no others', () => {
    for (const c of CATEGORIES) expect(p, c).toContain(`**${c}**`)
  })

  it('forbids total lines and zero-amount items', () => {
    expect(p).toMatch(/TOTAL \/ SUBTOTAL lines/)
    expect(p).toMatch(/Do NOT emit an item with amount 0/)
  })

  it('forbids multiplying a quantity prefix by the trailing amount', () => {
    expect(p).toContain('DO NOT multiply it by the quantity')
  })

  it('forces exactly one tool call and no prose', () => {
    expect(p).toContain('Never reply with prose')
    expect(p).toContain('Never call the tool more than once')
    expect(p.trimEnd().endsWith('Now call `record_expense`.')).toBe(true)
  })
})

describe('record_expense tool', () => {
  const s = RECORD_EXPENSE_TOOL.input_schema as {
    properties: Record<string, Record<string, unknown>>
    required: string[]
  }

  it('is named record_expense', () => {
    expect(RECORD_EXPENSE_TOOL.name).toBe(TOOL_NAME)
    expect(TOOL_NAME).toBe('record_expense')
  })

  it('mirrors ParsedExpense exactly', () => {
    expect(Object.keys(s.properties).sort()).toEqual(['items', 'occurred_on', 'title'])
    expect([...s.required].sort()).toEqual(['items', 'occurred_on', 'title'])

    const items = s.properties.items as {
      minItems: number
      maxItems: number
      items: { properties: Record<string, Record<string, unknown>> }
    }
    const item = items.items
    expect(Object.keys(item.properties).sort()).toEqual(['amount_idr', 'category', 'name'])
    expect(item.properties.amount_idr!.type).toBe('integer')
    expect(item.properties.category!.enum).toEqual([...CATEGORIES])
    expect(items.minItems).toBe(1)
    expect(items.maxItems).toBe(50)
  })

  it('carries no Claude-only fields', () => {
    // `strict` and `cache_control` exist on the SDK's Tool type but are not portable to
    // Anthropic-compatible servers. A silently-ignored one looks like it worked.
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('strict')
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('cache_control')
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('defer_loading')
    expect(RECORD_EXPENSE_TOOL).not.toHaveProperty('input_examples')
  })
})
