/**
 * `/f/[token]`'s Indonesian — F12 §4.
 *
 * A copy.ts even though the page is almost wordless, for the same reason the other four routes
 * have one: the not-found page and the metadata must agree, and the ONE thing this page must
 * never say is anything about whether a token used to exist.
 */

/** The browser tab / share preview for a live link. Deliberately says nothing about the photo. */
export const METADATA_TITLE = 'Foto'

/**
 * An unknown token and a revoked one produce the SAME words. "Tautan ini sudah dihapus" would
 * confirm that the token was once real, which is exactly the fact the 404 exists to withhold.
 */
export const NOT_FOUND_METADATA_TITLE = 'Tidak ditemukan'
export const NOT_FOUND_TITLE = 'Foto tidak ditemukan'
export const NOT_FOUND_BODY = 'Tautan ini tidak berlaku.'

export const FOOTER_LABEL = 'Expense Tracking'
