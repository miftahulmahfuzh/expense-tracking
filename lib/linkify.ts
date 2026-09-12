/**
 * #18 — splits a note's text into plain and URL segments, so the note's read-only view can
 * render a `http(s)://` or bare `www.` token as a real link without touching the rest of the
 * text.
 *
 * A run of trailing punctuation (a sentence's closing period, a wrapping paren or quote) is
 * peeled off the match and kept as plain text, so a URL at the end of a sentence doesn't
 * swallow the period into the link. This is a heuristic, not a URL parser: a token whose actual
 * path ends in one of these characters (rare in practice) loses it to the trailing plain text
 * instead.
 */
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/

export type LinkifySegment =
  { type: 'text'; value: string } | { type: 'link'; text: string; href: string }

export function linkify(text: string): LinkifySegment[] {
  const segments: LinkifySegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, start) })

    let token = match[0]
    let trailing = ''
    const trimmed = token.match(TRAILING_PUNCTUATION)
    if (trimmed) {
      trailing = trimmed[0]
      token = token.slice(0, -trailing.length)
    }

    // A bare `www.` token has no scheme to open; a plain http:// prefix is the one Next's own
    // <a> element needs to treat it as a navigation rather than a same-document reference.
    if (token)
      segments.push({
        type: 'link',
        text: token,
        href: token.startsWith('www.') ? `https://${token}` : token,
      })
    if (trailing) segments.push({ type: 'text', value: trailing })

    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) })

  return segments
}
