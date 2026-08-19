/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 Tasks 6 + 8 — the pathname contract, both halves of it.
 *
 *  Two regexes guard two different strings and getting them confused is a
 *  production outage in either direction:
 *
 *    PHOTO_REQUEST_PATHNAME_RE  gates what the client may ASK for, in
 *      onBeforeGenerateToken. Too loose and the upload route writes anywhere in
 *      the store; too tight and no upload can start at all.
 *
 *    PHOTO_STORED_PATHNAME_RE  gates what comes BACK from the client, in
 *      attachPhoto and discardStagedPhotos. Too tight and the bytes are already
 *      paid for when the row insert refuses them.
 *
 *  The stored form is the requested form plus Vercel's addRandomSuffix. Measured
 *  against the live store, not assumed — see the comment on the constant.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest'

import {
  PHOTO_PREFIX,
  PHOTO_REQUEST_PATHNAME_RE,
  PHOTO_STORED_PATHNAME_RE,
} from '@/lib/photos/constants'
import { newPhotoPathname } from '@/lib/photos/pathname'

/** The shape Vercel returned for a real put({ addRandomSuffix: true }). */
const REAL_STORED = 'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'

describe('newPhotoPathname', () => {
  it('always satisfies the regex the upload route enforces', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(newPhotoPathname()).toMatch(PHOTO_REQUEST_PATHNAME_RE)
    }
  })

  it('is 21 symbols of entropy under photos/, with a .jpg extension', () => {
    const p = newPhotoPathname()
    expect(p.startsWith(PHOTO_PREFIX)).toBe(true)
    expect(p.slice(PHOTO_PREFIX.length, -'.jpg'.length)).toHaveLength(21)
  })

  it('carries no userId and no groupId — decision D-F', () => {
    // A pathname is public and pasteable. The only thing in it is randomness.
    const p = newPhotoPathname()
    expect(p).toMatch(/^photos\/[A-Za-z0-9_-]{21}\.jpg$/)
  })

  it('does not collide across 5000 draws', () => {
    const seen = new Set(Array.from({ length: 5000 }, newPhotoPathname))
    expect(seen.size).toBe(5000)
  })
})

describe('PHOTO_REQUEST_PATHNAME_RE', () => {
  it('accepts a freshly minted pathname', () => {
    expect(PHOTO_REQUEST_PATHNAME_RE.test('photos/Uk-igSGzS6rpPd1sRM9iz.jpg')).toBe(true)
  })

  it.each([
    ['path traversal', 'photos/../../etc/passwd.jpg'],
    ['a nested directory', 'photos/nested/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['another prefix', 'avatars/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['no prefix', 'Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['a leading slash', '/photos/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['the wrong extension', 'photos/Uk-igSGzS6rpPd1sRM9iz.heic'],
    ['no extension', 'photos/Uk-igSGzS6rpPd1sRM9iz'],
    ['a double extension', 'photos/Uk-igSGzS6rpPd1sRM9iz.jpg.js'],
    ['too short an id', 'photos/short.jpg'],
    ['too long an id', 'photos/Uk-igSGzS6rpPd1sRM9izXXXX.jpg'],
    ['a symbol outside the alphabet', 'photos/Uk-igSGzS6rpPd1sRM9i%.jpg'],
    ['a query string', 'photos/Uk-igSGzS6rpPd1sRM9iz.jpg?x=1'],
    ['the stored form, which the client must not request', REAL_STORED],
  ])('rejects %s', (_label, pathname) => {
    expect(PHOTO_REQUEST_PATHNAME_RE.test(pathname)).toBe(false)
  })
})

describe('PHOTO_STORED_PATHNAME_RE', () => {
  it('accepts the pathname the live store actually returned', () => {
    expect(PHOTO_STORED_PATHNAME_RE.test(REAL_STORED)).toBe(true)
  })

  it('tolerates a suffix length other than the 30 we measured', () => {
    // Vercel owns this suffix. Pinning its exact length would make their change
    // our outage, so the bound is loose on purpose.
    const id = 'Uk-igSGzS6rpPd1sRM9iz'
    expect(PHOTO_STORED_PATHNAME_RE.test(`photos/${id}-${'a'.repeat(16)}.jpg`)).toBe(true)
    expect(PHOTO_STORED_PATHNAME_RE.test(`photos/${id}-${'a'.repeat(64)}.jpg`)).toBe(true)
  })

  it.each([
    ['a suffix-less pathname (nothing legitimate lacks one)', 'photos/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['path traversal', 'photos/../secrets-aaaaaaaaaaaaaaaaaaaa.jpg'],
    ['a nested directory', 'photos/x/Uk-igSGzS6rpPd1sRM9iz-aaaaaaaaaaaaaaaaaaaa.jpg'],
    ['another prefix', 'avatars/Uk-igSGzS6rpPd1sRM9iz-aaaaaaaaaaaaaaaaaaaa.jpg'],
    ['the wrong extension', 'photos/Uk-igSGzS6rpPd1sRM9iz-aaaaaaaaaaaaaaaaaaaa.png'],
    ['an absurd suffix', `photos/Uk-igSGzS6rpPd1sRM9iz-${'a'.repeat(200)}.jpg`],
  ])('rejects %s', (_label, pathname) => {
    expect(PHOTO_STORED_PATHNAME_RE.test(pathname)).toBe(false)
  })

  it('is anchored at both ends, so no prefix or suffix smuggling', () => {
    expect(PHOTO_STORED_PATHNAME_RE.source.startsWith('^')).toBe(true)
    expect(PHOTO_STORED_PATHNAME_RE.source.endsWith('$')).toBe(true)
    expect(PHOTO_REQUEST_PATHNAME_RE.source.startsWith('^')).toBe(true)
    expect(PHOTO_REQUEST_PATHNAME_RE.source.endsWith('$')).toBe(true)
  })

  it('has no global flag — a stateful lastIndex would make every other call fail', () => {
    expect(PHOTO_STORED_PATHNAME_RE.global).toBe(false)
    expect(PHOTO_REQUEST_PATHNAME_RE.global).toBe(false)
  })
})
