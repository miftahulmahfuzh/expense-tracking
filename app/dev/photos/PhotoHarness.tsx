'use client'

import { useState } from 'react'

import { PhotoGallery, PhotoManager, PhotoPicker } from '@/components/photos'
import { Card } from '@/components/ui'
import { formatBytes } from '@/lib/photos/format'
import type { PhotoDTO, StagedPhoto } from '@/lib/photos/types'

/**
 * The interactive half of /dev/photos. NOT SHIPPABLE UI — see ./page.tsx.
 *
 * Everything on this screen is a real production code path: the same PhotoPicker F05 will
 * render, the same PhotoManager F07 will render, and the same read-only PhotoGallery F09
 * will render. Only the page around them is scaffolding.
 */
export function PhotoHarness({ groupId, photos }: { groupId: string; photos: PhotoDTO[] }) {
  const [staged, setStaged] = useState<StagedPhoto[]>([])
  const [busy, setBusy] = useState(false)

  /**
   * Staged photos have no expense_photos row, so they have no id or sortOrder. Synthesising
   * both lets the gallery and lightbox be exercised on /new-style photos — which is how the
   * orientation gate (R-29) gets checked at full-screen size before F05 exists.
   */
  const stagedAsDto: PhotoDTO[] = staged.map((p, i) => ({
    id: p.blobPathname,
    blobUrl: p.blobUrl,
    blobPathname: p.blobPathname,
    width: p.width,
    height: p.height,
    sizeBytes: p.sizeBytes,
    sortOrder: i,
  }))

  return (
    <main className="space-y-6 pt-safe-header px-safe pb-16">
      <header>
        <p className="eyebrow">F06 · QA harness</p>
        <h1 className="mt-1 text-title">Foto</h1>
        <p className="mt-1 text-body text-ink-2">
          Halaman dev. Jalankan tabel QA di docs/plans/F06-photos.md di sini.
        </p>
      </header>

      {/* ── staged: what /new will do (F05) ───────────────────────────────────────── */}
      <Card as="section" className="space-y-3">
        <div>
          <p className="eyebrow">mode staged</p>
          <p className="mt-1 text-body text-ink-2">
            Unggah tanpa grup, seperti di /new. Simpan menunggu {busy ? 'unggahan' : '—'}.
          </p>
        </div>

        <PhotoPicker mode="staged" value={staged} onChange={setStaged} onBusyChange={setBusy} />

        {/* R-31 in action: this is the button F05 must disable, and this is the channel. */}
        <button
          type="button"
          disabled={busy}
          className="h-btn w-full press rounded-field border border-ink bg-ink font-mono text-btn tracking-[0.16em] text-paper uppercase disabled:opacity-50"
        >
          {busy ? 'Menunggu foto…' : `Simpan (${staged.length})`}
        </button>

        {staged.length > 0 && (
          <>
            <p className="eyebrow">galeri dari staged</p>
            <PhotoGallery photos={stagedAsDto} />
            <ul className="space-y-1">
              {staged.map((p) => (
                <li key={p.blobPathname} className="font-mono text-meta text-ink-3">
                  {p.width}×{p.height} · {formatBytes(p.sizeBytes)}
                  {/* The orientation gate reads off these two numbers: a portrait source
                      MUST come back taller than it is wide. */}
                  {p.height > p.width ? ' · portrait' : ' · landscape'}
                </li>
              ))}
            </ul>
            <p className="font-mono text-meta break-all text-ink-3">
              {staged.map((p) => p.blobUrl).join('\n')}
            </p>
          </>
        )}
      </Card>

      {/* ── attached: what /e/[id] will do (F07) ──────────────────────────────────── */}
      <Card as="section" className="space-y-3">
        <div>
          <p className="eyebrow">mode attached</p>
          <p className="mt-1 text-body text-ink-2">
            Langsung tersimpan ke grup <span className="font-mono text-meta">{groupId}</span>.
            Galeri di bawah dibaca dari database.
          </p>
        </div>

        <PhotoPicker mode="attached" groupId={groupId} existingCount={photos.length} />

        <p className="eyebrow">galeri pemilik ({photos.length})</p>
        {/* PhotoManager, not PhotoGallery: this is the owner view, and it is the module that
            carries deletePhoto (R-26). Tap a photo, then Hapus, to exercise §10. */}
        <PhotoManager photos={photos} hideWhenEmpty={false} />
        {photos.length === 0 && <p className="text-body text-ink-3">Belum ada foto tersimpan.</p>}
      </Card>
    </main>
  )
}
