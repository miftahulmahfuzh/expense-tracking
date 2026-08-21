/**
 * The month screen's fullscreen preference: one cookie, and the pure codec for it.
 *
 * WHY A COOKIE AND NOT `localStorage`. The preference decides whether the month header and
 * the tab bar are on screen at FIRST PAINT. `localStorage` is only readable from the client,
 * so a stored preference can only be applied after hydration — the header paints at full
 * height and then collapses a frame later, which is a visible jump on every single load. A
 * cookie arrives with the request, so `(shell)/layout.tsx` renders the collapsed state
 * directly and there is nothing to correct. The alternative flash-free route is a
 * render-blocking inline `<script>` in `<head>`; this is the same result without one.
 *
 * NOT `httpOnly`, on purpose. The toggle writes it from the client with `document.cookie` so
 * flipping it costs no server round trip, and there is nothing to protect: the value is
 * "does this person want a big header", readable and writable by its owner either way.
 *
 * NOT KEYED PER USER, unlike the `/new` draft (see `app/(bare)/new/draftStorage.ts`). That
 * key exists because a draft is CONTENT — one person's paste must never surface in another
 * person's compose screen on a shared iPad. This is a display preference for the browser it
 * was set in, with nothing in it to leak, and keying it per user would mean the cookie can
 * only be written once the client knows the user id.
 */

export const FULLSCREEN_COOKIE = 'et-fullscreen'

/** The only value that means "on". Anything else — including absent — means off. */
export const FULLSCREEN_ON = '1'

/** One year. The preference is sticky by design: it ends when the user ends it. */
export const FULLSCREEN_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Reads the cookie value.
 *
 * A whitelist rather than a truthiness check, because a cookie is attacker-writable in the
 * sense that the user's own devtools can put anything there, and a value from a future
 * version of this code is the realistic case. Anything unrecognised must degrade to "off" —
 * the state that has an escape hatch on screen — never to "on".
 */
export function isFullscreenValue(value: string | undefined | null): boolean {
  return value === FULLSCREEN_ON
}

/**
 * Builds the `document.cookie` assignment string.
 *
 * `secure` is a parameter rather than a `location.protocol` read so this stays pure and
 * testable; the caller passes it. It matters: Safari silently DISCARDS a `Secure` cookie set
 * over plain http, which would make the preference fail to persist on `localhost` only —
 * the worst class of bug to find, because production would be fine.
 *
 * Turning it off deletes rather than storing `0`. `max-age=0` is the delete instruction, and
 * the read above already treats absent as off, so there is no second "off" value to keep in
 * sync.
 */
export function fullscreenCookie({ on, secure }: { on: boolean; secure: boolean }): string {
  const parts = [
    `${FULLSCREEN_COOKIE}=${on ? FULLSCREEN_ON : ''}`,
    'path=/',
    `max-age=${on ? FULLSCREEN_MAX_AGE : 0}`,
    // lax, not strict: the preference must survive arriving from an external link, which is
    // how the app is opened from the home screen shortcut.
    'samesite=lax',
  ]
  if (secure) parts.push('secure')
  return parts.join('; ')
}
