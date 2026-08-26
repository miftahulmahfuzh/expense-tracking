import { z } from 'zod'
import { CATEGORIES } from '@/lib/categories'

/* ============================================================================
 * AUTHORITATIVE — roadmap §4.3. ParsedExpense is the single boundary type
 * between F04 (parser) and F05 (add flow), and is byte-for-byte the shape of
 * the GLM tool's input_schema. Do not change without a Contract delta.
 * ==========================================================================*/

export const ParsedItem = z.object({
  name: z.string().trim().min(1).max(120),
  amount_idr: z.number().int().min(0).max(1_000_000_000),
  category: z.enum(CATEGORIES),
})
export type ParsedItem = z.infer<typeof ParsedItem>

export const ParsedExpense = z.object({
  title: z.string().trim().min(1).max(120),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(ParsedItem).min(1).max(50),
})
export type ParsedExpense = z.infer<typeof ParsedExpense>

/* ============================================================================
 * ADDITIVE — validation for the Server Actions in §4.4. Not in the roadmap's
 * §4.3 block; listed as an additive Contract delta. Actions MUST parse their
 * input with these, because a Server Action argument is attacker-controlled —
 * reconciliation R-5 established that proxy.ts does not cover Server Functions,
 * so each action is its own security boundary.
 * Note the camelCase here: §4.4 signatures use camelCase, §4.3's LLM boundary
 * uses snake_case. That asymmetry is intentional and stops here.
 * ==========================================================================*/

export const IdSchema = z.string().regex(/^[0-9A-Za-z_-]{12}$/, 'invalid id')
export const DateISOSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
export const AmountIdrSchema = z.number().int().min(0).max(1_000_000_000)
export const CategorySchema = z.enum(CATEGORIES)
export const TitleSchema = z.string().trim().min(1).max(120)
export const NoteSchema = z.string().trim().max(2_000)

/**
 * A blob that already exists in storage but has no expense_photos row yet.
 * Mirrors F06's `StagedPhoto` / `NewPhotoInput` in lib/photos/types.ts field for field,
 * including the required dimensions — F06's client always computes them before upload.
 */
export const NewPhotoInputSchema = z.object({
  blobUrl: z.url().max(1_000),
  blobPathname: z.string().min(1).max(500),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  sizeBytes: z.number().int().positive().max(50_000_000),
})
export type NewPhotoInputSchema = z.infer<typeof NewPhotoInputSchema>

/**
 * createExpense — ParsedExpense plus the fields the review screen adds.
 *
 * Reconciliation R-2: this takes `photos`, NOT the `photoIds` roadmap §4.4 originally
 * specified. `expense_photos.group_id` is NOT NULL with an FK, so no photo row — and
 * therefore no photo id — can exist before its group does; `photoIds` pointed at
 * nothing. Bytes upload while the user is still editing the parsed table, and
 * createExpense inserts group + items + photo rows in one db.batch().
 */
export const CreateExpenseInput = ParsedExpense.extend({
  note: NoteSchema.optional(),
  rawText: z.string().max(20_000).optional(),
  /*
   * A STRUCTURAL bound, not the product cap. The per-group cap is configuration
   * (`PHOTO_MAX_PER_GROUP`) and `app/actions/expenses.ts` enforces it per request; 50 here
   * is only "no sane payload is longer than this", and must stay >= PHOTO_CAP_CEILING or
   * this schema silently becomes the real cap and the env var stops working above 20.
   * Spelled as a literal on purpose: importing F06's constants would give this wave-1
   * module an edge into wave-3 code, which is the tightening expenses.ts documents.
   */
  photos: z.array(NewPhotoInputSchema).max(50).optional(),
})
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>

export const UpdateExpenseMetaInput = z
  .object({
    title: TitleSchema.optional(),
    occurredOn: DateISOSchema.optional(),
    note: NoteSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update')
export type UpdateExpenseMetaInput = z.infer<typeof UpdateExpenseMetaInput>

/**
 * addItem. `sortOrder` is reconciliation R-16, from F07: the undo affordance
 * ("Urungkan") re-inserts a deleted item, and without it the restored row lands at the
 * bottom of the list instead of where it was. Omitted ⇒ unchanged behaviour (the action
 * appends).
 */
export const AddItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  amountIdr: AmountIdrSchema,
  category: CategorySchema,
  sortOrder: z.number().int().min(0).max(9_999).optional(),
})
export type AddItemInput = z.infer<typeof AddItemInput>

export const UpdateItemInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amountIdr: AmountIdrSchema.optional(),
    category: CategorySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update')
export type UpdateItemInput = z.infer<typeof UpdateItemInput>

export const AttachPhotoInput = z.object({
  groupId: IdSchema,
  blobUrl: z.url().max(1_000),
  blobPathname: z.string().min(1).max(500),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  sizeBytes: z.number().int().positive().max(50_000_000).optional(),
})
export type AttachPhotoInput = z.infer<typeof AttachPhotoInput>

/**
 * POST /api/parse request body (§4.5), for callers — F05's client validates with this
 * before spending a round trip.
 *
 * The cap is 8.000, matching MAX_RAW_TEXT_CHARS in lib/llm/types.ts. It was 20.000 here,
 * which meant a paste this schema accepted could still come back 413 from the route: a
 * client validator that is more permissive than the server it guards is worse than none.
 * The literal is repeated rather than imported because this module is F03a — pure,
 * dependency-free, wave 1 — and must not gain an edge into F04's tree.
 *
 * The route itself does NOT use this schema; it needs to tell an empty paste apart from a
 * malformed body and from an oversized one, and `.trim().min(1)` collapses those. See
 * app/api/parse/route.ts.
 */
export const ParseRequest = z.object({
  rawText: z.string().trim().min(1).max(8_000),
  todayISO: DateISOSchema,
})
export type ParseRequest = z.infer<typeof ParseRequest>
