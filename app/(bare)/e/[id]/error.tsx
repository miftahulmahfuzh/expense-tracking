'use client'

import { Button, ButtonLink } from '@/components/ui'
import { currentMonthKey } from '@/lib/format'

/**
 * The segment error boundary. It exists because this screen is the only one in the app that
 * writes on nearly every interaction, and a rejected read (Neon cold-start timeout, a dropped
 * connection) would otherwise surface as Next's generic red screen.
 *
 * `error` is deliberately not rendered. Next redacts Server Component and Server Action
 * messages in production (R-94, OQ-4), so the only thing there to show is a digest — a hex
 * string that helps nobody holding the phone.
 */
export default function DetailError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-safe text-center">
      <p className="eyebrow">Gagal memuat pengeluaran</p>
      <p className="max-w-[28ch] text-item text-pretty text-ink-2">
        Sambungannya mungkin terputus. Coba lagi ya.
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="md" onClick={reset}>
          Coba lagi
        </Button>
        <ButtonLink href={`/m/${currentMonthKey()}`} variant="ghost" size="md">
          Ke bulan ini
        </ButtonLink>
      </div>
    </main>
  )
}
