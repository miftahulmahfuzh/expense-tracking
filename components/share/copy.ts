/**
 * Every string F09 renders on the owner's side, in one file — the convention
 * `app/(bare)/e/[id]/copy.ts` set.
 *
 * `Dibagikan lewat expensetracking.online` is canonical (design R-40); it is in
 * `app/(bare)/s/[token]/copy.ts` with the rest of the public page's strings, because the
 * public page must not import anything from the owner's side.
 *
 * The revoke copy is long on purpose. A generic "Yakin?" would be a lie by omission: revoke
 * kills a URL the user has already handed to another person, and re-sharing does not bring
 * it back. F09 §2.4.
 */

export const SHARE_CTA = 'Bagikan'

export const SHARE_PANEL_HEADING = 'Tautan publik'
export const SHARE_PANEL_ACTIVE =
  'Tautan aktif. Siapa pun yang punya tautan ini bisa melihat pengeluaran ini tanpa masuk.'

export const REVOKE_CTA = 'Batalkan tautan'
export const REVOKE_CONFIRM_TITLE = 'Batalkan tautan?'
export const REVOKE_CONFIRM_BODY =
  'Tautan yang sudah kamu kirim akan langsung mati. Kalau nanti kamu bagikan lagi, tautannya baru — yang lama tidak akan hidup lagi.'
/**
 * The honest sentence from F09 §7. Photos live at public Vercel Blob URLs that are
 * unguessable but permanent and independent of the share link: revoke kills the page, not
 * the bytes. Saying so here is the whole mitigation we have.
 */
export const REVOKE_CONFIRM_PHOTOS =
  'Foto yang sudah sempat dibuka bisa saja masih tersimpan di sisi mereka.'
export const REVOKE_CONFIRM_YES = 'Ya, batalkan'
export const REVOKE_CONFIRM_NO = 'Jangan jadi'
export const REVOKING = 'Membatalkan…'

export const SHARE_COPIED_TOAST = 'Tersalin'
export const REVOKED_TOAST = 'Tautan dibatalkan'
export const SHARE_FAILED = 'Gagal membuat tautan. Coba lagi ya.'
export const REVOKE_FAILED = 'Gagal membatalkan tautan. Coba lagi ya.'

export const MANUAL_COPY_TITLE = 'Salin tautannya sendiri'
export const MANUAL_COPY_BODY = 'Tekan lama tautannya, lalu pilih Salin.'
export const CLOSE_CTA = 'Tutup'
