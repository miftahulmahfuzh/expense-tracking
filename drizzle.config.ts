import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next.js, so Next's automatic .env.local loading does not
// apply and lib/env.ts (server-only) is not importable here.
loadEnv({ path: '.env.local', quiet: true })

const url = process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED is not set. drizzle-kit must use the DIRECT (unpooled) Neon ' +
      'connection string — running migrations through the pooler is unsupported. ' +
      'Copy .env.example to .env.local and fill it in.',
  )
}
if (new URL(url).host.includes('-pooler')) {
  throw new Error(
    `DATABASE_URL_UNPOOLED points at a pooled host (${new URL(url).host}). ` +
      'Use the direct connection string from the Neon console.',
  )
}

export default defineConfig({
  // Owned by F03. This path must not change.
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
