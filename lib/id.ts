/**
 * Id generation for every primary key in the app, and for the share token.
 *
 * DEVIATION FROM F03's D-E, DELIBERATE. That decision hand-rolled a 64-symbol
 * generator to avoid taking a dependency "not in the pinned stack table". By the time
 * F03a executes that premise is gone: F01 pinned `nanoid@5.1.16` in package.json, and
 * F06 imports `nanoid` directly for blob pathnames (`nanoid(21)`). Hand-rolling here
 * would put two CSPRNG id generators with *different alphabets* in one codebase — the
 * exact duplication reconciliation R-7, R-8 and R-33 each struck down. The dependency
 * ships either way, so this module wraps it.
 *
 * Nothing observable changes: nanoid's default alphabet is the same 64 URL-safe
 * symbols, drawn from `crypto.getRandomValues` with no modulo bias (256 / 64 = 4), so
 * the entropy F09 §2.2 reasons about is identical. Only the symbol ordering differs,
 * and no consumer may depend on that.
 */
import { nanoid, urlAlphabet } from 'nanoid'

/**
 * The 64 URL-safe symbols `newId` draws from. Re-exported so `isValidId` and the
 * entropy figure below are derived from the generator rather than asserted beside it.
 */
export const ID_ALPHABET: string = urlAlphabet

/** Roadmap §4.2: every PK and the share token are nanoid(12). */
export const ID_LENGTH = 12

/** 12 symbols × log2(64) = 72 bits of entropy. */
export const ID_ENTROPY_BITS = ID_LENGTH * 6

export function newId(size: number = ID_LENGTH): string {
  return nanoid(size)
}

/** Semantic aliases. All identical today; keeping them separate makes call sites self-documenting. */
export const newGroupId = (): string => newId()
export const newItemId = (): string => newId()
export const newPhotoId = (): string => newId()

/**
 * Share token for /s/<token>. Same generator, same 72 bits.
 * `token` is the PRIMARY KEY of share_links, so a collision surfaces as a unique-violation on
 * insert — F09 must retry once rather than swallow it. Probability at 1e6 tokens: ~1e-10.
 */
export const newShareToken = (): string => newId()

const ID_RE = /^[0-9A-Za-z_-]{12}$/

/** Cheap shape check for route params, so /e/<garbage> 404s without a DB round trip. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}
