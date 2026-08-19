import { relations } from 'drizzle-orm'
import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/* ============================================================================
 * Auth.js adapter tables — canonical @auth/drizzle-adapter Postgres shape.
 * SQL names and camelCase columns are copied verbatim from the adapter docs
 * (roadmap §4.2: "do not hand-roll them"). Exported symbols are pluralised to
 * match §4.2's prose. Consequence: we must NOT enable Drizzle's
 * casing: 'snake_case' option, so app columns are named explicitly below.
 *
 * The WebAuthn `authenticators` table is intentionally omitted — Google OAuth only.
 * ==========================================================================*/

/**
 * Mirrors next-auth's AdapterAccountType. Declared locally rather than imported so that
 * lib/db has no dependency on next-auth, which F02 wires up after this module lands.
 */
type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn'

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

/* ============================================================================
 * App tables — AUTHORITATIVE, roadmap §4.2.
 * ==========================================================================*/

export const expenseGroups = pgTable(
  'expense_groups',
  {
    /** nanoid(12) — lib/id.ts newGroupId() */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. "bakar duit tuesday" */
    title: text('title').notNull(),
    /**
     * Asia/Jakarta calendar day, 'YYYY-MM-DD'. mode:'string' — see plan D-B.
     * Never a JS Date, anywhere, ever.
     */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    note: text('note'),
    /** Original paste, kept for re-parse / audit (roadmap §4.2). */
    rawText: text('raw_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      // Applies to Drizzle .update() calls only — a raw SQL UPDATE will not bump it
      // (contract delta 9). Do not add a Postgres trigger expecting the two to agree.
      .$onUpdate(() => new Date()),
  },
  (t) => [index('expense_groups_user_occurred_idx').on(t.userId, t.occurredOn.desc())],
)

export const expenseItems = pgTable(
  'expense_items',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    /** ≤ 120 chars, enforced by Zod at the boundary. */
    name: text('name').notNull(),
    /** Whole rupiah, ≥ 0. bigint in PG, number in JS — see plan D-A. */
    amountIdr: bigint('amount_idr', { mode: 'number' }).notNull(),
    /** One of CATEGORIES. Stored as text, not a PG enum, so adding a category is not a migration. */
    category: text('category').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('expense_items_group_idx').on(t.groupId)],
)

export const expensePhotos = pgTable(
  'expense_photos',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    /** Public Vercel Blob URL. */
    blobUrl: text('blob_url').notNull(),
    /** Needed for del() on delete (F06). */
    blobPathname: text('blob_pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('expense_photos_group_idx').on(t.groupId)],
)

export const shareLinks = pgTable(
  'share_links',
  {
    /** nanoid(12), URL-safe. PRIMARY KEY — a collision is a unique violation, F09 retries once. */
    token: text('token').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => expenseGroups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  // One active link per group (roadmap §4.2). Revoke = DELETE; re-share mints a fresh token.
  (t) => [uniqueIndex('share_links_group_id_unq').on(t.groupId)],
)

/* ============================================================================
 * Relations. Optional convenience for db.query.*; the sanctioned read path in
 * lib/db/queries.ts uses explicit selects + db.batch. Kept because F07 may want
 * relational reads and they cost nothing at runtime.
 * ==========================================================================*/

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  expenseGroups: many(expenseGroups),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const expenseGroupsRelations = relations(expenseGroups, ({ one, many }) => ({
  user: one(users, { fields: [expenseGroups.userId], references: [users.id] }),
  items: many(expenseItems),
  photos: many(expensePhotos),
  shareLink: one(shareLinks, { fields: [expenseGroups.id], references: [shareLinks.groupId] }),
}))

export const expenseItemsRelations = relations(expenseItems, ({ one }) => ({
  group: one(expenseGroups, { fields: [expenseItems.groupId], references: [expenseGroups.id] }),
}))

export const expensePhotosRelations = relations(expensePhotos, ({ one }) => ({
  group: one(expenseGroups, { fields: [expensePhotos.groupId], references: [expenseGroups.id] }),
}))

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  group: one(expenseGroups, { fields: [shareLinks.groupId], references: [expenseGroups.id] }),
}))

/* ============================================================================
 * Row types. Import these instead of re-deriving $inferSelect at call sites.
 * ==========================================================================*/

export type User = typeof users.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Session = typeof sessions.$inferSelect
export type VerificationToken = typeof verificationTokens.$inferSelect
export type ExpenseGroup = typeof expenseGroups.$inferSelect
export type NewExpenseGroup = typeof expenseGroups.$inferInsert
export type ExpenseItem = typeof expenseItems.$inferSelect
export type NewExpenseItem = typeof expenseItems.$inferInsert
export type ExpensePhoto = typeof expensePhotos.$inferSelect
export type NewExpensePhoto = typeof expensePhotos.$inferInsert
export type ShareLink = typeof shareLinks.$inferSelect
export type NewShareLink = typeof shareLinks.$inferInsert
