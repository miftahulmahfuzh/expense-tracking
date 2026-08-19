/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 Task 7 — the anti-drift gate on three shapes that MUST agree.
 *
 *  F06 declares client-safe types in lib/photos/types.ts; F03 declares the same
 *  shapes for its own reasons elsewhere. They are duplicated on purpose:
 *
 *   - PhotoDTO (F06, client) vs PhotoRow (F03, lib/db/queries.ts). Re-exporting
 *     PhotoRow would put a module that imports the Drizzle client one careless
 *     `import { PhotoRow }` away from the browser bundle.
 *   - StagedPhoto (F06, TS) vs NewPhotoInputSchema (F03a, Zod). R-46 gave the Zod
 *     mirror to F03a because createExpense consumes it.
 *
 *  Duplication is only safe while something fails when they diverge. That is this
 *  file. Every import here is `import type`, so nothing is loaded at runtime and no
 *  database client is constructed — the assertions are discharged by tsc.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest'

import type { PhotoRow } from '@/lib/db/queries'
import type { PhotoDTO, StagedPhoto } from '@/lib/photos/types'
import type { NewPhotoInputSchema } from '@/lib/schema/expense'

/** Compile error unless A and B have exactly the same keys and value types. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

// If either line below stops compiling, do not widen the type — reconcile the two
// declarations, because a real consumer is about to be handed the wrong shape.
const photoDtoMatchesPhotoRow: Exact<PhotoDTO, PhotoRow> = true
const stagedPhotoMatchesZodMirror: Exact<StagedPhoto, NewPhotoInputSchema> = true

describe('photo type mirrors', () => {
  it('PhotoDTO is exactly F03s PhotoRow', () => {
    // The value is trivial; the assignment above is the assertion. This keeps the
    // symbol used so no-unused-vars cannot delete the check.
    expect(photoDtoMatchesPhotoRow).toBe(true)
  })

  it('StagedPhoto is exactly NewPhotoInputSchema, dimensions included (R-46)', () => {
    expect(stagedPhotoMatchesZodMirror).toBe(true)
  })
})
