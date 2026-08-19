/**
 * Every string the public page renders. Nothing here may be imported by the owner's side,
 * and nothing from the owner's side may be imported here — `/s/[token]` is served to people
 * with no account, and the smaller its module graph, the smaller the surface to reason about.
 *
 * `Dibagikan lewat expensetracking.online` is canonical (design R-40). Note "lewat", not
 * "via": the roadmap's §5 wording predates the design pass.
 */

export const ITEM_HEADING = 'Item'
export const TOTAL_LABEL = 'Total'
export const PHOTO_HEADING = 'Foto'
export const OWNER_PREFIX = 'oleh'

export const FOOTER_LABEL = 'Dibagikan lewat expensetracking.online'

/**
 * ONE not-found message, for an unknown token AND for a revoked one.
 *
 * Never "tautan ini sudah dibatalkan". That confirms the token once existed, turns the route
 * into an oracle, and tells whoever found an old link that there is something worth going
 * looking for. F09 §7.
 */
export const NOT_FOUND_TITLE = 'Tautan tidak ditemukan'
export const NOT_FOUND_BODY = 'Tautan ini tidak berlaku. Coba minta tautan baru ke pengirimnya.'
export const NOT_FOUND_METADATA_TITLE = 'Tautan tidak ditemukan'
