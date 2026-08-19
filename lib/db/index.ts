import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'

import * as schema from './schema'

/**
 * Neon HTTP driver + Drizzle. See plan D-C / D-D.
 *
 * - Uses DATABASE_URL, the POOLED (`-pooler`) connection string. Migrations use
 *   DATABASE_URL_UNPOOLED and live in drizzle.config.ts, not here.
 * - neon() over HTTP holds no socket: each query is one `fetch`. There is no pool to
 *   warm, nothing to close and no `maxConnections` to tune. "Connection reuse" here means
 *   reusing the fetch keep-alive the runtime already manages, plus not rebuilding the
 *   Drizzle instance on every module evaluation — hence the globalThis cache, which
 *   mainly matters for Next dev HMR.
 * - Constructed EAGERLY so a missing DATABASE_URL is a loud boot crash, never a silent
 *   undefined (roadmap §4.8). neon() performs no I/O at construction, so importing this
 *   module in a unit test is free (tests/setup.ts supplies a dummy URL).
 * - IMPORTANT: no `casing` option. Auth.js columns are camelCase (plan D-G) and would be
 *   rewritten by casing: 'snake_case'.
 *
 * On plan Open question 1 — `lib/env.ts` vs `process.env`. ANSWERED: process.env, here.
 * `lib/env.ts` opens with `import 'server-only'`, whose default export condition throws
 * on import outside a React Server Components graph. Vitest resolves the default
 * condition, so routing this module through lib/env.ts would take every db unit test
 * down with it. lib/env.ts still validates both connection strings at boot for the app
 * itself; this is the same value read one layer lower, and the throw below is the
 * backstop for the non-Next callers (drizzle-kit, scripts/*.mjs) that lib/env.ts
 * likewise cannot serve.
 */

export type Database = NeonHttpDatabase<typeof schema>

function createDb(): Database {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add the POOLED Neon connection string to .env.local ' +
        '(and to the Vercel project env). See roadmap §4.8.',
    )
  }
  return drizzle(neon(url), {
    schema,
    logger: process.env.DRIZZLE_LOG === '1',
  })
}

const globalForDb = globalThis as unknown as { __expenseDb?: Database }

export const db: Database = (globalForDb.__expenseDb ??= createDb())

export { schema }
export * from './schema'
