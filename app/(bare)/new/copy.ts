/**
 * Every string F05 authors, in one place.
 *
 * NOTE WHAT IS NOT HERE: copy for server-side parse failures. F04's wire contract promises a
 * user-facing Indonesian `message` on every error response and guarantees it is safe to
 * render verbatim, so F05 renders that rather than maintaining a second vocabulary that
 * would drift out of step with the route's.
 *
 * Wording that design R-40 fixed is used as R-40 spells it: `Rapikan`,
 * `Merapikan catatanmu…`, `Simpan`, `Ulangi dari teks`, `+ Tambah item`, and the field
 * labels `Judul` / `Nama` / `Jumlah` / `Foto` / `Total`.
 */

/** The roadmap §1 canonical example, shown as the placeholder so the format teaches itself. */
export const PLACEHOLDER = `bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k`

export const HEADING = 'Tambah pengeluaran'
export const SUBHEADING = 'Tempel catatan belanjamu apa adanya. Biar kami yang rapikan.'

export const PARSE_CTA = 'Rapikan'
export const PARSE_BUSY = 'Merapikan catatanmu…'
export const MANUAL_CTA = 'isi manual'
export const REPARSE_CTA = 'Ulangi dari teks'
export const ADD_ITEM_CTA = '+ Tambah item'
export const SAVE_CTA = 'Simpan'
export const SAVE_WAITING_PHOTOS = 'Menunggu foto…'

/** The only failures the browser detects by itself — everything else comes from F04. */
export const CLIENT_COPY = {
  offline: 'Tidak ada koneksi. Kami rapikan seadanya di perangkat kamu — silakan cek di bawah.',
  timeout: 'Terlalu lama diproses. Ini hasil sementara, silakan cek dan perbaiki.',
  invalid_response: 'Jawaban dari server tidak bisa dibaca. Kami isi seadanya — silakan cek.',
  server_error: 'Lagi ada gangguan. Kami isi seadanya — silakan cek dan perbaiki.',
} as const

/**
 * Shown when we DID get real data but it is not trustworthy (F04: degraded === true, i.e.
 * the deterministic fallback answered and every category came back `other`). A role="status",
 * not an alert — nothing actually failed.
 */
export const DEGRADED_NOTICE = 'Kami cuma bisa merapikan sebagian. Cek lagi nama & kategorinya ya.'

export const SAVE_FAILED = 'Gagal menyimpan. Cek koneksi lalu coba lagi.'
export const SLOW_HINT = 'masih diproses…'

export const RESTORED_NOTICE = 'Draf sebelumnya dipulihkan.'
export const RESTORED_DISCARD = 'Mulai baru'

export const REPARSE_CONFIRM = 'Perubahan manual di tabel akan tertimpa. Lanjut?'
export const REPARSE_CONFIRM_YES = 'Ya, ulangi'
export const REPARSE_CONFIRM_NO = 'Batal'

export const RAW_DISCLOSURE = 'Teks asli'
export const SIGN_IN_AGAIN = 'Masuk lagi'
