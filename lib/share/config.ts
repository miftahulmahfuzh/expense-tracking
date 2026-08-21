/**
 * Share-link policy — F09 §2, the constants half.
 *
 * Everything here is a PRODUCT decision, not an implementation detail. Each value has a
 * reason written beside it; read the reason before changing the value.
 *
 * CLIENT-SAFE ON PURPOSE. `ShareControl` is a `'use client'` component and imports this
 * module, so nothing here may touch `lib/env.ts` (which carries `server-only`) or read
 * `process.env` — a server-only variable read from a client bundle does not fail, it
 * silently evaluates to `undefined`, which is how a share sheet ends up sending someone a
 * `localhost` URL. The origin is resolved server-side in `lib/share/origin.ts` and passed
 * down as a prop; `shareUrl` therefore takes it as an argument rather than reaching for it.
 */

/**
 * Put the rupiah total in the WhatsApp preview card?
 *
 * false (default) — the card reads "6 item · Selasa, 18 Agustus 2026". The number stays
 * behind the tap.
 * true            — a nicer card, but WhatsApp renders it inside the chat: in the bubble,
 * in the recipient's chat-list snippet, on their lock screen, to every member of a group
 * chat and in every forward of that message. The URL is the secret; the card is not.
 *
 * F09 §2.6. Open question 3 — worth showing the user both before locking it.
 */
export const SHARE_PREVIEW_SHOWS_TOTAL = false

/**
 * Show the owner's display name on the public page?
 *
 * false (default) — the recipient already knows who sent it, because they received it in a
 * WhatsApp thread from that person. A name adds nothing for the intended reader and adds
 * identity to a leaked one. The email address is never rendered under any setting; the
 * `SharedGroup` projection carries `ownerName` and nothing else about the owner.
 *
 * F09 §2.5.
 */
export const SHARE_SHOWS_OWNER_NAME = false

/**
 * Publish the group's note?
 *
 * true (default, F09 Open question 1). It is the owner's own text about this group and it
 * sits on the screen they are looking at when they tap Bagikan, so sharing it is an
 * informed act — but it is the one free-text field whose contents we cannot predict, so the
 * switch exists.
 */
export const SHARE_SHOWS_NOTE = true

/**
 * How many times `createShareLink` will re-draw a token after a primary-key collision
 * before giving up. It will never run: at 72 bits a collision is ~1e-10 across a million
 * links (lib/id.ts). The cap exists so the loop cannot be silent and infinite — a thrown
 * error is a worse outcome than one retry and a better one than a hung request.
 */
export const SHARE_MINT_ATTEMPTS = 3

/**
 * The canonical public URL for a token. The ONE place this string is built, so a change of
 * path shape cannot land in the share sheet but not the OG tags.
 *
 * @param origin absolute, no trailing slash — from `shareOrigin()` on the server, or the
 *               `origin` prop on the client.
 */
export function shareUrl(origin: string, token: string): string {
  return `${origin}/s/${token}`
}

/**
 * The canonical public URL for a PHOTO token — F12 §4.
 *
 * A sibling of `shareUrl` above, and separate rather than parameterised so the two paths cannot
 * be swapped by passing the wrong flag: `/s/<token>` publishes a whole expense group, `/f/<token>`
 * publishes one image and nothing else. Those are different privacy decisions, so they get
 * different functions and the call sites read as what they are.
 *
 * `/f` for *foto*, and short because the URL is pasted into WhatsApp by hand.
 *
 * @param origin absolute, no trailing slash — from `shareOrigin()` on the server.
 */
export function photoShareUrl(origin: string, token: string): string {
  return `${origin}/f/${token}`
}
