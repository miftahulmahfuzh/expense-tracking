import { DRAFT_VERSION, type DraftExpense } from './draft'

/**
 * The versioned localStorage codec for the /new draft.
 *
 * WHY THIS EXISTS. The product promise is that a mis-tap never costs you a long paste, and
 * on iOS a mis-tap is one edge swipe away at all times. The draft is what makes the promise
 * true.
 *
 * KEYED PER USER. `et:new-draft:<userId>`, so a shared iPad does not leak one person's
 * paste into another's /new. `userId` comes from the server component, so it is available
 * before first paint.
 *
 * TWO VERSION NUMBERS, ON PURPOSE. `v` on the envelope is what the LOADER switches on;
 * `draft.version` is what the SHAPE GUARD asserts. An envelope carrying a `v` we do not
 * know about is discarded rather than guessed at — a newer tab must never be downgraded
 * into corruption.
 */

const PREFIX = 'et:new-draft'
export const ENVELOPE_VERSION = 1

/**
 * Persist-only truncation. A paste this large is pathological; we protect the ~5 MB
 * localStorage quota rather than the edge case, and the IN-MEMORY draft keeps the full text
 * so nothing the user can see is lost mid-session.
 *
 * Note this is deliberately NOT MAX_RAW_TEXT_CHARS (8.000). That cap is what /api/parse
 * accepts; this one is what we are willing to store. They answer different questions.
 */
export const MAX_RAW_CHARS = 20_000
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function draftKey(userId: string): string {
  return `${PREFIX}:${userId}`
}

type Envelope = { v: number; savedAt: number; draft: DraftExpense }

/**
 * Forward compatibility. A future ENVELOPE_VERSION 2 keeps a `1` entry here that upgrades
 * the old shape; anything else is discarded. Empty today, and that is the correct amount of
 * migration machinery for one shipped version.
 */
const MIGRATIONS: Record<number, (raw: unknown) => DraftExpense | null> = {}

/**
 * A structural guard, not a Zod schema. localStorage is attacker-writable in the sense that
 * the user's own devtools can put anything there, and a stale shape from a previous deploy
 * is the realistic case — either way a bad field must produce "no draft", never a crash on
 * first paint.
 */
function isDraftShape(value: unknown): value is DraftExpense {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  if (draft.version !== DRAFT_VERSION) return false
  if (draft.stage !== 'paste' && draft.stage !== 'review') return false
  if (typeof draft.rawText !== 'string' || typeof draft.title !== 'string') return false
  if (typeof draft.occurredOn !== 'string' || typeof draft.note !== 'string') return false
  if (!Array.isArray(draft.items) || !Array.isArray(draft.photos)) return false
  for (const item of draft.items) {
    if (typeof item !== 'object' || item === null) return false
    const row = item as Record<string, unknown>
    if (typeof row.key !== 'string' || typeof row.name !== 'string') return false
    if (typeof row.category !== 'string') return false
    if (row.amountIdr !== null && typeof row.amountIdr !== 'number') return false
    if (row.amountRaw !== null && typeof row.amountRaw !== 'string') return false
  }
  for (const photo of draft.photos) {
    if (typeof photo !== 'object' || photo === null) return false
    const row = photo as Record<string, unknown>
    if (typeof row.blobUrl !== 'string' || typeof row.blobPathname !== 'string') return false
  }
  return true
}

/** True when the draft holds something a user would be annoyed to lose. */
export function isDraftMeaningful(draft: DraftExpense): boolean {
  return (
    draft.rawText.trim().length > 0 ||
    draft.title.trim().length > 0 ||
    draft.note.trim().length > 0 ||
    draft.photos.length > 0 ||
    draft.items.some((item) => item.name.trim().length > 0 || item.amountIdr !== null)
  )
}

export function loadDraft(userId: string): DraftExpense | null {
  if (typeof window === 'undefined') return null

  let text: string | null = null
  try {
    text = window.localStorage.getItem(draftKey(userId))
  } catch {
    return null // Safari private mode, or storage disabled entirely
  }
  if (!text) return null

  let envelope: Envelope
  try {
    envelope = JSON.parse(text) as Envelope
  } catch {
    clearDraft(userId)
    return null
  }

  if (typeof envelope?.savedAt !== 'number' || Date.now() - envelope.savedAt > DRAFT_TTL_MS) {
    clearDraft(userId)
    return null
  }

  let draft: unknown = envelope.draft
  if (envelope.v !== ENVELOPE_VERSION) {
    const migrate = MIGRATIONS[envelope.v]
    if (!migrate) {
      clearDraft(userId)
      return null
    }
    draft = migrate(envelope.draft)
  }

  if (!isDraftShape(draft)) {
    clearDraft(userId)
    return null
  }
  return draft
}

export function saveDraft(userId: string, draft: DraftExpense): void {
  if (typeof window === 'undefined') return

  // An empty draft is removed rather than stored, so a fresh /new never shows the
  // "draf dipulihkan" notice for a draft that holds nothing.
  if (!isDraftMeaningful(draft)) {
    clearDraft(userId)
    return
  }

  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    savedAt: Date.now(),
    draft: { ...draft, rawText: draft.rawText.slice(0, MAX_RAW_CHARS) },
  }

  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(envelope))
  } catch {
    /*
     * QuotaExceededError must never break typing. This runs from a debounce on every
     * keystroke, so a throw here would surface as a frozen keyboard — losing the draft is
     * the better of two bad outcomes, and the in-memory state is untouched either way.
     */
  }
}

export function clearDraft(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    /* storage disabled — nothing was written, so nothing needs removing */
  }
}
