import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/auth/safeNext'

/**
 * `next` reaches `safeNext` straight from the query string of a URL anyone can hand out, and
 * it ends up in `signIn({ redirectTo })`. An open redirect here is a phishing primitive on our
 * own domain, one hop after the user typed a Google password — so the guard gets its own test
 * rather than riding along on the page's.
 */
describe('safeNext', () => {
  it('keeps same-origin paths, query string and all', () => {
    expect(safeNext('/new')).toBe('/new')
    expect(safeNext('/m/2026-08')).toBe('/m/2026-08')
    expect(safeNext('/e/abc123def456')).toBe('/e/abc123def456')
    expect(safeNext('/stats?month=2026-08')).toBe('/stats?month=2026-08')
    expect(safeNext('/')).toBe('/')
  })

  it('rejects absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('http://evil.com/new')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('data:text/html,<script>')).toBe('/')
  })

  it('rejects protocol-relative URLs, which a browser reads as a host', () => {
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('//evil.com/m/2026-08')).toBe('/')
  })

  it('rejects backslashes, which some URL parsers fold into a slash', () => {
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('/\\\\evil.com')).toBe('/')
  })

  it('rejects anything that is not a string', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    // Next hands back string[] when a query key is repeated: `?next=/a&next=/b`.
    expect(safeNext(['/new', '/stats'])).toBe('/')
    expect(safeNext(42)).toBe('/')
  })
})
