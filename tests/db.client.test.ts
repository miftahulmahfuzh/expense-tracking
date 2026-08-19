/**
 * F03b Task 10 — the Drizzle/Neon singleton.
 *
 * Two properties are worth a test. The first is that a missing DATABASE_URL is a loud
 * crash at import time rather than a silent `undefined` that fails later inside a query
 * (roadmap §4.8). The second is that importing the module twice yields the same instance,
 * because Next's dev HMR re-evaluates modules on every edit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REAL_URL = process.env.DATABASE_URL

/** The module caches on globalThis, which outlives a module registry reset. */
function clearCaches() {
  delete (globalThis as { __expenseDb?: unknown }).__expenseDb
  vi.resetModules()
}

beforeEach(clearCaches)

afterEach(() => {
  process.env.DATABASE_URL = REAL_URL
  clearCaches()
})

describe('lib/db', () => {
  it('throws at import time when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL
    await expect(import('@/lib/db')).rejects.toThrow(/DATABASE_URL/)
  })

  it('exposes a Drizzle instance and the schema namespace', async () => {
    const { db, schema, expenseGroups } = await import('@/lib/db')
    expect(db).toBeDefined()
    expect(db.select).toBeTypeOf('function')
    // db.batch is the sanctioned multi-statement path (plan D-C / R-4).
    expect(db.batch).toBeTypeOf('function')
    // db.transaction exists on the type but throws on this driver — do not use it.
    expect(schema.expenseGroups).toBe(expenseGroups)
  })

  it('returns the same instance across imports (globalThis cache)', async () => {
    const first = await import('@/lib/db')
    vi.resetModules()
    const second = await import('@/lib/db')
    expect(second.db).toBe(first.db)
  })

  it('builds SQL without touching the network', async () => {
    const { db, expenseGroups } = await import('@/lib/db')
    const { sql, params } = db.select().from(expenseGroups).toSQL()
    expect(sql).toContain('"expense_groups"')
    expect(params).toEqual([])
  })
})
