/**
 * Every string `/e/[id]` renders, in one file.
 *
 * The canonical ones come from design R-40, which fixed wording that had been `TBD` across
 * five plans: `Judul`, `Nama`, `Jumlah`, `Foto`, `Total`, `Ubah item`, `Pilih kategori`,
 * `Item dihapus`, `Urungkan`, `Hapus pengeluaran`, `Simpan`, `+ Tambah item`. Do not reword
 * them here — the same strings appear on /new, and two vocabularies for one action is how an
 * app starts feeling like two apps.
 *
 * The failure copy is deliberately identical across causes. R-94 (OQ-4) recorded why: Next
 * redacts Server Action error messages in production, so a failed write cannot be told apart
 * from another failed write at the client. Pretending otherwise would mean inventing a
 * distinction the runtime does not give us. Precise copy needs the actions to return
 * `{ ok, code }`, which is a change to F05's `createExpense` too.
 */

export const DETAIL_LABEL = 'Detail'
export const BACK_LABEL = 'Kembali ke daftar bulan'

export const TITLE_LABEL = 'Judul'
export const DATE_LABEL = 'Tanggal'
export const NOTE_LABEL = 'Catatan (opsional)'
export const ITEM_HEADING = 'Item'
export const TOTAL_LABEL = 'Total'

export const ADD_ITEM_CTA = '+ Tambah item'
export const SAVE_CTA = 'Simpan'
export const CANCEL_CTA = 'Batal'
export const DELETE_CTA = 'Hapus'

export const ITEM_SHEET_EDIT = 'Ubah item'
export const ITEM_SHEET_ADD = 'Item baru'
export const ITEM_NAME_LABEL = 'Nama'
export const ITEM_NAME_PLACEHOLDER = 'roti buaya'
export const ITEM_AMOUNT_LABEL = 'Jumlah'
export const ITEM_AMOUNT_INVALID = 'Jumlah tidak dikenali'

export const ITEM_DELETED_TOAST = 'Item dihapus'
export const UNDO_LABEL = 'Urungkan'
/** The undo window. Longer than the 5s default: 5s is not enough to read, decide and reach. */
export const UNDO_DURATION_MS = 7_000

export const SAVE_FAILED = 'Gagal menyimpan. Coba lagi ya.'
export const DELETE_FAILED = 'Gagal menghapus. Coba lagi ya.'
export const UNDO_FAILED = 'Gagal mengurungkan. Coba lagi ya.'

export const DELETE_GROUP_CTA = 'Hapus pengeluaran'
export const DELETE_GROUP_CONFIRM =
  'Semua item dan foto di dalamnya ikut terhapus. Tidak bisa dibatalkan.'
export const DELETING = 'Menghapus…'
