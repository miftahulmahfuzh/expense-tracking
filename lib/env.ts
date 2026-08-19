import 'server-only'
import { z } from 'zod'

/**
 * Environment contract for expensetracking.online.
 *
 * Roadmap v0.1.0 section 4.8 is authoritative for the variable names.
 * Every variable here is server-only; none is prefixed NEXT_PUBLIC_.
 *
 * Import rules:
 *   - Server Components, Route Handlers, Server Actions, lib/**  -> allowed
 *   - Client Components ('use client')                           -> build error
 *   - Node scripts outside Next (scripts/*.mjs, drizzle.config)  -> NOT importable,
 *     because 'server-only' has no react-server condition there. Those read
 *     process.env directly; see scripts/db-smoke.mjs and drizzle.config.ts.
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required but was empty or unset`)

const postgresUrl = (name: string) =>
  nonEmpty(name).startsWith('postgres', `${name} must be a postgres:// or postgresql:// URL`)

/** Always required. Parsed eagerly at module load -> a missing value fails the build. */
const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // F04 — GLM-5.2 via the z.ai Anthropic-compatible endpoint.
  LLM_API_KEY: nonEmpty('LLM_API_KEY'),
  LLM_BASE_URL: z.url('LLM_BASE_URL must be an absolute URL'),
  LLM_MODEL: nonEmpty('LLM_MODEL'),

  // F03 — Neon. DATABASE_URL is pooled (runtime); DATABASE_URL_UNPOOLED is direct
  // (drizzle-kit migrate/studio only).
  DATABASE_URL: postgresUrl('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: postgresUrl('DATABASE_URL_UNPOOLED'),
})

/** F02 owns these. Validated on first call, which F02's auth.ts makes module-scope. */
const authSchema = z.object({
  AUTH_SECRET: nonEmpty('AUTH_SECRET'),
  AUTH_GOOGLE_ID: nonEmpty('AUTH_GOOGLE_ID'),
  AUTH_GOOGLE_SECRET: nonEmpty('AUTH_GOOGLE_SECRET'),
  // Production only. Auth.js infers the origin from the request in dev and preview.
  AUTH_URL: z.url('AUTH_URL must be an absolute URL').optional(),
})

/** F06 owns this. Vercel injects it once a Blob store is linked to the project. */
const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: nonEmpty('BLOB_READ_WRITE_TOKEN'),
})

function fail(group: string, error: z.ZodError): never {
  const lines = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(
    [
      '',
      '',
      `================ INVALID ${group.toUpperCase()} ENVIRONMENT ================`,
      lines,
      '',
      'Local dev : copy .env.example to .env.local and fill in the blanks.',
      'Vercel    : Project Settings > Environment Variables (per environment).',
      '============================================================',
      '',
    ].join('\n'),
  )
}

function load<T extends z.ZodType>(group: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) fail(group, parsed.error)
  return parsed.data
}

/**
 * Validated core environment. Evaluated at import time — a missing or malformed
 * variable throws here and aborts `next build` / `next dev` with the message above.
 */
export const env = load('core', coreSchema)

let authCache: z.infer<typeof authSchema> | null = null
/** Auth.js configuration. Throws loudly on first use if F02's vars are unset. */
export function authEnv(): z.infer<typeof authSchema> {
  authCache ??= load('auth', authSchema)
  return authCache
}

let blobCache: z.infer<typeof blobSchema> | null = null
/** Vercel Blob token. Throws loudly on first use if the store is not linked. */
export function blobEnv(): z.infer<typeof blobSchema> {
  blobCache ??= load('blob', blobSchema)
  return blobCache
}

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

export type CoreEnv = z.infer<typeof coreSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type BlobEnv = z.infer<typeof blobSchema>
