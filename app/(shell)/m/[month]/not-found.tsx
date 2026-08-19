import { ButtonLink } from '@/components/ui'
import { currentMonthKey } from '@/lib/format'

/**
 * Reached when the `[month]` segment is not a real month key (`/m/2026-13`, `/m/agustus`,
 * `/m/1899-01`). The tab bar is still rendered by the `(shell)` layout, so this page only has
 * to explain itself and offer the one obvious way out.
 */
export default function MonthNotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-safe text-center">
      <p className="eyebrow">Bulan tidak ditemukan</p>
      <p className="max-w-[28ch] text-item text-pretty text-ink-2">
        Alamatnya harus berbentuk <span className="font-mono">/m/2026-08</span>.
      </p>
      <ButtonLink href={`/m/${currentMonthKey()}`} variant="secondary" className="mt-3">
        Ke bulan ini
      </ButtonLink>
    </main>
  )
}
