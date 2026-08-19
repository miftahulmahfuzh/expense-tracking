import { ButtonLink } from '@/components/ui'
import { currentMonthKey } from '@/lib/format'

/**
 * Reached when the id is malformed, the group was deleted, or the group belongs to somebody
 * else. All three render this page and nothing distinguishes them — a 403 for the third case
 * would confirm that an id exists, which is an enumeration oracle over other people's data.
 *
 * `/e/[id]` is in `(bare)`, so this supplies its own way out.
 */
export default function ExpenseNotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-safe text-center">
      <p className="eyebrow">Pengeluaran tidak ditemukan</p>
      <p className="max-w-[28ch] text-item text-pretty text-ink-2">Mungkin sudah dihapus.</p>
      <ButtonLink href={`/m/${currentMonthKey()}`} variant="secondary" className="mt-3">
        Ke bulan ini
      </ButtonLink>
    </main>
  )
}
