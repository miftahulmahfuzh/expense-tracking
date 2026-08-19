// Vitest global setup. Owned by F01 (reconciliation R-11).
//
// lib/db/index.ts (F03) constructs the Neon client eagerly at import time so that a
// missing DATABASE_URL is a loud crash in production rather than a silent undefined
// (roadmap §4.8). neon() is lazy at the network level — it only builds a fetch-based
// tagged template — so a syntactically valid dummy URL lets unit tests import query
// modules and inspect .toSQL() without ever touching a network.
//
// A real value in the environment always wins: this only fills gaps.
const DUMMY_PG =
  'postgresql://u:p@ep-unit-test-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'

process.env.DATABASE_URL ??= DUMMY_PG
process.env.DATABASE_URL_UNPOOLED ??= DUMMY_PG.replace('-pooler', '')

// F04's parser module reads these at import time via lib/env.ts.
process.env.LLM_API_KEY ??= 'test-key-not-a-real-credential'
process.env.LLM_BASE_URL ??= 'https://api.z.ai/api/anthropic'
process.env.LLM_MODEL ??= 'glm-5.2'
