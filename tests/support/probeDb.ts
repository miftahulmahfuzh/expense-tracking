/**
 * A Drizzle instance over a fake Neon HTTP client, for asserting the SQL that
 * lib/db/queries.ts actually emits.
 *
 * Why not `.toSQL()` on builders rebuilt inside the test: rebuilding the query in the
 * test asserts that the test and the plan agree, not that the *shipped function* does.
 * The neon-http driver's client is just `client(sql, params, opts)` plus a
 * `client.transaction(promises, opts)` for db.batch, so standing in for it costs a dozen
 * lines and lets every assertion run against the real exported function.
 *
 * Usage (the mock must be hoisted above the import of the module under test):
 *
 *   vi.mock('@/lib/db', () => import('./support/probeDb'))
 *   import { calls, queueRows, reset } from './support/probeDb'
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from '@/lib/db/schema'

export interface Captured {
  sql: string
  params: unknown[]
}

/** Every statement the driver was asked to run, in order, across single queries and batches. */
export const calls: Captured[] = []

/** Canned result rows, shifted one per statement. Rows are arrays (Neon's arrayMode). */
const queued: unknown[][][] = []

/** Queue the rows the next statement should return. Column order = select-object key order. */
export function queueRows(rows: unknown[][]): void {
  queued.push(rows)
}

export function reset(): void {
  calls.length = 0
  queued.length = 0
}

/** The last statement's SQL with parameter placeholders and whitespace normalised. */
export function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

type NeonResult = { rows: unknown[][]; fields: unknown[]; rowCount: number; command: string }

const client = ((sql: string, params: unknown[]): Promise<NeonResult> => {
  calls.push({ sql, params })
  const rows = queued.shift() ?? []
  return Promise.resolve({ rows, fields: [], rowCount: rows.length, command: 'SELECT' })
}) as unknown as NeonQueryFunction<false, true>

// db.batch() hands the driver an array of in-flight statement promises.
;(client as unknown as { transaction: (q: Promise<unknown>[]) => Promise<unknown[]> }).transaction =
  (queries) => Promise.all(queries)

export const db = drizzle(client, { schema })
export { schema }
