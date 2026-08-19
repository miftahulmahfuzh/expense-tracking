import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'

// Explicit, even though 'nodejs' is the Next 16 default: this route reads server-only
// env and opens a database connection, and must never be flipped to the Edge runtime.
export const runtime = 'nodejs'
// Never prerender or cache: the whole point is to report live state.
export const dynamic = 'force-dynamic'

/**
 * Unauthenticated liveness probe. Answers "is this deployment wired to a reachable
 * database, and which commit is it running?" — the question no other route can answer,
 * because every other route needs auth or an LLM call.
 *
 * PAYLOAD IS DELIBERATELY MINIMAL (reconciliation R-27). It was originally
 * { ok, db: <database name>, now, latencyMs, llm: { baseUrl, model }, commit, env }.
 * The database name and the LLM provider/model are free reconnaissance for an
 * unauthenticated caller and bought nothing, so `db` is now a boolean and the rest is
 * gone. Never add a connection string, LLM_API_KEY or AUTH_SECRET here — and do not
 * re-add the database name or LLM details either.
 *
 * Note for F02: proxy.ts must NOT match /api/health, or the probe starts redirecting.
 */
export async function GET() {
  try {
    const sql = neon(env.DATABASE_URL)
    await sql`select 1`
    return NextResponse.json({
      ok: true,
      db: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    })
  } catch (error) {
    // The message can carry the host and role name, so it goes to the server log,
    // never to the response body.
    console.error('[health] database check failed:', error)
    return NextResponse.json(
      { ok: false, db: false, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local' },
      { status: 500 },
    )
  }
}
