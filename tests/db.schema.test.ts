/**
 * F03b Tasks 8 & 9 — the shape of the tables, asserted against the roadmap §4.2 block
 * rather than against what `drizzle-kit generate` happened to emit.
 *
 * These are the tests that fail if someone "tidies" a column mode. Two of them are
 * load-bearing beyond tidiness:
 *   - occurred_on must stay `date` with mode 'string' (plan D-B). A JS Date here renders
 *     as the previous day for every viewer west of Greenwich, including share-link guests.
 *   - amount_idr must stay `bigint` in SQL (plan D-A). `integer` overflows a monthly SUM.
 */
import { describe, expect, it } from 'vitest'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  accounts,
  expenseGroups,
  expenseInsights,
  expenseItems,
  expensePhotos,
  photoShareLinks,
  sessions,
  shareLinks,
  users,
  verificationTokens,
} from '@/lib/db/schema'

/** SQL names of a table's columns, in declaration order. */
const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((c) => c.name)

const column = (table: Parameters<typeof getTableConfig>[0], name: string) => {
  const found = getTableConfig(table).columns.find((c) => c.name === name)
  if (!found) throw new Error(`no column ${name} on ${getTableConfig(table).name}`)
  return found
}

describe('app tables — roadmap §4.2', () => {
  it('uses the SQL table names the roadmap specifies', () => {
    expect(getTableConfig(expenseGroups).name).toBe('expense_groups')
    expect(getTableConfig(expenseItems).name).toBe('expense_items')
    expect(getTableConfig(expensePhotos).name).toBe('expense_photos')
    expect(getTableConfig(shareLinks).name).toBe('share_links')
  })

  it('expense_groups has exactly the specified columns, snake_cased', () => {
    expect(columnNames(expenseGroups)).toEqual([
      'id',
      'user_id',
      'title',
      'occurred_on',
      'note',
      'raw_text',
      'created_at',
      'updated_at',
    ])
  })

  it('expense_items has exactly the specified columns', () => {
    expect(columnNames(expenseItems)).toEqual([
      'id',
      'group_id',
      'name',
      'amount_idr',
      'category',
      'sort_order',
    ])
  })

  it('expense_photos has exactly the specified columns', () => {
    expect(columnNames(expensePhotos)).toEqual([
      'id',
      'group_id',
      'blob_url',
      'blob_pathname',
      'width',
      'height',
      'size_bytes',
      'sort_order',
      'created_at',
    ])
  })

  it('share_links has exactly the specified columns', () => {
    expect(columnNames(shareLinks)).toEqual(['token', 'group_id', 'created_at'])
  })

  it('amount_idr is bigint in SQL and a JS number (plan D-A)', () => {
    const amount = column(expenseItems, 'amount_idr')
    expect(amount.getSQLType()).toBe('bigint')
    expect(amount.notNull).toBe(true)
    // mode: 'number' — the driver casts, so nothing downstream sees a BigInt.
    expect(amount.mapFromDriverValue('266350')).toBe(266350)
    expect(typeof amount.mapFromDriverValue('266350')).toBe('number')
  })

  it('occurred_on is a date column that stays a string (plan D-B)', () => {
    const occurredOn = column(expenseGroups, 'occurred_on')
    expect(occurredOn.getSQLType()).toBe('date')
    expect(occurredOn.notNull).toBe(true)
    expect(occurredOn.mapFromDriverValue('2026-08-18')).toBe('2026-08-18')
    expect(typeof occurredOn.mapFromDriverValue('2026-08-18')).toBe('string')
  })

  it('timestamps are timestamptz with a now() default', () => {
    for (const [table, name] of [
      [expenseGroups, 'created_at'],
      [expenseGroups, 'updated_at'],
      [expensePhotos, 'created_at'],
      [shareLinks, 'created_at'],
    ] as const) {
      const col = column(table, name)
      expect(col.getSQLType()).toBe('timestamp with time zone')
      expect(col.notNull).toBe(true)
      expect(col.hasDefault).toBe(true)
    }
  })

  it('sort_order defaults to 0 and is not null', () => {
    for (const table of [expenseItems, expensePhotos]) {
      const col = column(table, 'sort_order')
      expect(col.getSQLType()).toBe('integer')
      expect(col.notNull).toBe(true)
      expect(col.default).toBe(0)
    }
  })

  it('every foreign key cascades on delete (the §9.1 ownership chain)', () => {
    const fkTables = [expenseGroups, expenseItems, expensePhotos, shareLinks, accounts, sessions]
    let seen = 0
    for (const table of fkTables) {
      const { foreignKeys, name } = getTableConfig(table)
      expect(foreignKeys.length, `${name} must declare a foreign key`).toBeGreaterThan(0)
      for (const fk of foreignKeys) {
        expect(fk.onDelete, `${name}.${fk.reference().columns[0]?.name}`).toBe('cascade')
        seen++
      }
    }
    // The six the roadmap draws: account, session, expense_groups → user;
    // expense_items, expense_photos, share_links → expense_groups.
    expect(seen).toBe(6)
  })

  it('the child tables point at the columns the ownership chain needs', () => {
    const parentOf = (table: Parameters<typeof getTableConfig>[0]) => {
      const [fk] = getTableConfig(table).foreignKeys
      const ref = fk!.reference()
      return {
        from: ref.columns.map((c) => c.name),
        to: [getTableConfig(ref.foreignTable).name, ...ref.foreignColumns.map((c) => c.name)],
      }
    }
    expect(parentOf(expenseGroups)).toEqual({ from: ['user_id'], to: ['user', 'id'] })
    expect(parentOf(expenseItems)).toEqual({ from: ['group_id'], to: ['expense_groups', 'id'] })
    expect(parentOf(expensePhotos)).toEqual({ from: ['group_id'], to: ['expense_groups', 'id'] })
    expect(parentOf(shareLinks)).toEqual({ from: ['group_id'], to: ['expense_groups', 'id'] })
  })

  it('indexes the (user_id, occurred_on DESC) access path /m/[month] uses', () => {
    const [idx, ...rest] = getTableConfig(expenseGroups).indexes
    expect(rest).toHaveLength(0)
    expect(idx!.config.name).toBe('expense_groups_user_occurred_idx')
    expect(idx!.config.unique).toBe(false)
    const cols = idx!.config.columns.map((c) => ('name' in c ? c.name : String(c)))
    expect(cols).toEqual(['user_id', 'occurred_on'])
  })

  it('indexes group_id on both child tables', () => {
    for (const [table, expected] of [
      [expenseItems, 'expense_items_group_idx'],
      [expensePhotos, 'expense_photos_group_idx'],
    ] as const) {
      const [idx] = getTableConfig(table).indexes
      expect(idx!.config.name).toBe(expected)
      expect(idx!.config.unique).toBe(false)
      expect(idx!.config.columns.map((c) => ('name' in c ? c.name : String(c)))).toEqual([
        'group_id',
      ])
    }
  })

  it('share_links.group_id is UNIQUE — one active link per group', () => {
    const [idx] = getTableConfig(shareLinks).indexes
    expect(idx!.config.name).toBe('share_links_group_id_unq')
    expect(idx!.config.unique).toBe(true)
    expect(idx!.config.columns.map((c) => ('name' in c ? c.name : String(c)))).toEqual(['group_id'])
  })

  it('share_links.token is the primary key, so a collision is a unique violation', () => {
    const { columns, primaryKeys } = getTableConfig(shareLinks)
    expect(primaryKeys).toHaveLength(0) // declared on the column, not as a table constraint
    expect(columns.find((c) => c.name === 'token')?.primary).toBe(true)
  })
})

describe('Auth.js adapter tables — canonical @auth/drizzle-adapter shape (plan D-G)', () => {
  it('keeps the adapter’s singular SQL table names', () => {
    expect(getTableConfig(users).name).toBe('user')
    expect(getTableConfig(accounts).name).toBe('account')
    expect(getTableConfig(sessions).name).toBe('session')
    expect(getTableConfig(verificationTokens).name).toBe('verificationToken')
  })

  it('keeps the adapter’s camelCase column names verbatim', () => {
    expect(columnNames(users)).toEqual(['id', 'name', 'email', 'emailVerified', 'image'])
    expect(columnNames(accounts)).toEqual([
      'userId',
      'type',
      'provider',
      'providerAccountId',
      'refresh_token',
      'access_token',
      'expires_at',
      'token_type',
      'scope',
      'id_token',
      'session_state',
    ])
    expect(columnNames(sessions)).toEqual(['sessionToken', 'userId', 'expires'])
    expect(columnNames(verificationTokens)).toEqual(['identifier', 'token', 'expires'])
  })

  it('account has 11 columns and a composite PK over (provider, providerAccountId)', () => {
    const { columns, primaryKeys } = getTableConfig(accounts)
    expect(columns).toHaveLength(11)
    expect(primaryKeys).toHaveLength(1)
    expect(primaryKeys[0]!.columns.map((c) => c.name)).toEqual(['provider', 'providerAccountId'])
  })

  it('verificationToken has a composite PK over (identifier, token)', () => {
    const { primaryKeys } = getTableConfig(verificationTokens)
    expect(primaryKeys[0]!.columns.map((c) => c.name)).toEqual(['identifier', 'token'])
  })

  it('user.email is unique and user.id defaults to a uuid', () => {
    const { columns } = getTableConfig(users)
    const email = columns.find((c) => c.name === 'email')!
    expect(email.isUnique).toBe(true)
    const id = columns.find((c) => c.name === 'id')!
    expect(id.primary).toBe(true)
    expect(id.defaultFn).toBeTypeOf('function')
    expect(id.defaultFn!()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('session.expires and user.emailVerified are plain timestamps, as the adapter writes them', () => {
    expect(column(sessions, 'expires').getSQLType()).toBe('timestamp')
    expect(column(users, 'emailVerified').getSQLType()).toBe('timestamp')
  })
})

describe('photo_share_links — F12 §4.2', () => {
  it('is shaped exactly like share_links, one photo wide', () => {
    expect(getTableConfig(photoShareLinks).name).toBe('photo_share_links')
    expect(columnNames(photoShareLinks)).toEqual(['token', 'photo_id', 'created_at'])
  })

  it('makes the token the PRIMARY KEY, so a collision is a unique violation', () => {
    // The action's retry loop depends on this: an untargeted onConflictDoNothing has to absorb
    // BOTH the PK and the photo_id unique index, and it distinguishes them by re-reading.
    expect(column(photoShareLinks, 'token').primary).toBe(true)
  })

  it('keeps ONE ACTIVE LINK PER PHOTO — the unique index is a product decision', () => {
    // Without it, a second tap of the share icon would mint a fresh token and orphan the URL the
    // user already sent someone, silently, with nothing anywhere to tell them.
    const indexes = getTableConfig(photoShareLinks).indexes
    const unq = indexes.find((i) => i.config.name === 'photo_share_links_photo_id_unq')
    expect(unq, 'photo_share_links_photo_id_unq is missing').toBeDefined()
    expect(unq!.config.unique).toBe(true)
  })

  it('CASCADES from the photo — deleting the photo IS the revoke (F12 §4.7)', () => {
    // There is no revoke UI. If this ever became `no action`, a deleted photo would leave a live
    // token behind, and the only way to kill a shared link would be gone.
    const fk = getTableConfig(photoShareLinks).foreignKeys[0]
    expect(fk, 'no foreign key on photo_id').toBeDefined()
    expect(fk!.onDelete).toBe('cascade')
  })
})

describe('expense_insights — F12 §6.2', () => {
  it('is one row per user, keyed by the user', () => {
    expect(getTableConfig(expenseInsights).name).toBe('expense_insights')
    expect(column(expenseInsights, 'user_id').primary).toBe(true)
  })

  it('carries the three texts plus BOTH freshness keys', () => {
    expect(columnNames(expenseInsights)).toEqual([
      'user_id',
      'week_text',
      'month_text',
      'two_month_text',
      'data_key',
      'scope_key',
      'generated_at',
      'model',
    ])
  })

  it('requires both keys — neither is optional, because neither subsumes the other', () => {
    // data_key catches an edited expense; scope_key catches Monday morning, when the data has
    // not moved but "Simpulan Minggu Ini" is now about last week. A nullable key would let a row
    // exist that can never be judged stale.
    expect(column(expenseInsights, 'data_key').notNull).toBe(true)
    expect(column(expenseInsights, 'scope_key').notNull).toBe(true)
    expect(column(expenseInsights, 'generated_at').notNull).toBe(true)
  })

  it('leaves the three texts NULLABLE — a model may decline one section', () => {
    expect(column(expenseInsights, 'week_text').notNull).toBe(false)
    expect(column(expenseInsights, 'month_text').notNull).toBe(false)
    expect(column(expenseInsights, 'two_month_text').notNull).toBe(false)
  })

  it('stores generated_at WITH a timezone — the cooldown compares it to now()', () => {
    // A naive timestamp would make the 60s cooldown wrong by the server's offset, which on
    // Vercel is UTC and locally is +07:00 — so the bug would only appear in production.
    expect(column(expenseInsights, 'generated_at').getSQLType()).toBe('timestamp with time zone')
  })

  it('CASCADES from the user, so deleting an account leaves no orphan text', () => {
    const fk = getTableConfig(expenseInsights).foreignKeys[0]
    expect(fk, 'no foreign key on user_id').toBeDefined()
    expect(fk!.onDelete).toBe('cascade')
  })
})
