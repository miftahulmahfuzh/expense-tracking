'use server'

import { and, desc, eq } from 'drizzle-orm'

import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { expenseGroups } from '@/lib/db/schema'
import { newGroupId } from '@/lib/id'
import { todayJakartaISO } from '@/lib/format'

import { assertDevOnly } from './guard'

/**
 * Scratch group for the F06 QA harness. NOT SHIPPABLE — see ./page.tsx.
 *
 * `attached` mode needs a real `expense_groups` row to attach photos to, and the real
 * creator of those rows is F05's `createExpense`, which does not exist yet. Rather than
 * pre-empt F05's contract, this makes the smallest possible row (title, date, no items) and
 * reuses it on subsequent visits, so the QA table can exercise attachPhoto, deletePhoto,
 * the onUploadCompleted webhook and PhotoManager against real database rows.
 *
 * Delete this directory when F07 ships — at that point /e/[id] is the real harness.
 */
const TITLE = 'DEV F06 photo harness'

export async function getOrCreateScratchGroup(): Promise<string> {
  assertDevOnly()
  const userId = await requireUserId()

  // Scoped by userId like every other query in the app: a shared preview deployment must
  // not hand one tester another tester's group.
  const [existing] = await db
    .select({ id: expenseGroups.id })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.userId, userId), eq(expenseGroups.title, TITLE)))
    .orderBy(desc(expenseGroups.createdAt))
    .limit(1)
  if (existing) return existing.id

  const id = newGroupId()
  await db.insert(expenseGroups).values({
    id,
    userId,
    title: TITLE,
    occurredOn: todayJakartaISO(),
  })
  return id
}
