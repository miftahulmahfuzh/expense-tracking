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

export const photoShareLinks = pgTable(
  'photo_share_links',
  {
    /** nanoid(12), URL-safe — the same generator as `share_links.token` (lib/id.ts). */
    token: text('token').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => expensePhotos.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  /*
   * F12 §4. Shape-for-shape with `share_links` above, deliberately, so there is one pattern to
   * learn rather than two — including WHY the unique index exists: one active link per photo,
   * so a second tap of the share icon copies the SAME url. A fresh token would silently break
   * the link the user sent yesterday.
   *
   * THIS IS A SECOND, NARROWER TOKEN TYPE, not a duplicate of the first. `share_links`
   * publishes a whole group — title, every item, every amount. Sending someone a receipt photo
   * should not also publish what you spent, so `/f/[token]` resolves to one blob URL and
   * nothing else (see `getPhotoByShareToken`).
   *
   * ON REVOKE: `onDelete: 'cascade'` means deleting the photo kills its link. That IS the
   * revoke — there is no separate control, and F12 §4.7 records that as an accepted cost.
   */
  (t) => [uniqueIndex('photo_share_links_photo_id_unq').on(t.photoId)],
)

/**
 * The LLM-written summaries behind `/stats` — F12 §6.
 *
 * ONE ROW PER USER, not one per section. All three summaries come from a single model call
 * over a single window of data and go stale together, so splitting them would be three
 * upserts, three freshness comparisons and three ways to end up with a "this week" paragraph
 * written against last week's numbers.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THE TWO KEYS ARE THE WHOLE DESIGN. Freshness is `dataKey` AND `scopeKey`, and each catches
 *  something the other cannot:
 *
 *  dataKey  — did the underlying expenses change? Derived, never written by a mutation: see
 *             `insightDataKey()` in lib/db/insights.ts. It is NOT just MAX(updated_at),
 *             because deleting a group whose updated_at sits BELOW the max leaves the max
 *             untouched while the data changed — a stale summary that reads as fresh. The row
 *             count travels with it for exactly that case.
 *
 *  scopeKey — did the CALENDAR move? On Monday morning, with no new expense anywhere, the
 *             dataKey is unchanged but "Simpulan Minggu Ini" is now describing last week.
 *             Nothing about the data can detect that; only the clock can.
 *
 *  Miss either and the failure is silent, because a wrong summary looks exactly like a right
 *  one. There is no rendering glitch to notice.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * NOT a cache in the discardable sense: if it is missing we pay a model call, so it is the
 * only copy of text that cost money. It is still safe to TRUNCATE — the next page view
 * regenerates.
 */
export const expenseInsights = pgTable('expense_insights', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Simpulan Minggu Ini · Bulan Ini · 2 Bulan Terakhir. Nullable: a model may decline one. */
  weekText: text('week_text'),
  monthText: text('month_text'),
  twoMonthText: text('two_month_text'),
  /** `<max(updated_at) as epoch ms>:<group count>` — see the block above. */
  dataKey: text('data_key').notNull(),
  /** `<jakarta ISO week>|<jakarta month>`, e.g. `2026-W34|2026-08`. */
  scopeKey: text('scope_key').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }).notNull(),
  /** The model that wrote this text. `glm-5.2` aliases upward server-side (lib/llm/COST.md). */
  model: text('model').notNull(),
})

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
  shareLink: one(photoShareLinks, {
    fields: [expensePhotos.id],
    references: [photoShareLinks.photoId],
  }),
}))

export const photoShareLinksRelations = relations(photoShareLinks, ({ one }) => ({
  photo: one(expensePhotos, {
    fields: [photoShareLinks.photoId],
    references: [expensePhotos.id],
  }),
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
export type PhotoShareLink = typeof photoShareLinks.$inferSelect
export type NewPhotoShareLink = typeof photoShareLinks.$inferInsert
export type ExpenseInsights = typeof expenseInsights.$inferSelect
export type NewExpenseInsights = typeof expenseInsights.$inferInsert
