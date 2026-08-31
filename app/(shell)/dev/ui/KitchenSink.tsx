'use client'

import * as React from 'react'
import { CATEGORY_LIST, type Category } from '@/lib/categories'
import {
  Button,
  ButtonLink,
  Card,
  CategoryCode,
  CategoryPicker,
  Chip,
  EmptyState,
  Field,
  Input,
  Money,
  MoneyInput,
  Sheet,
  TextArea,
  useToast,
  ChevronRightIcon,
  CloseIcon,
} from '@/components/ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-4 pb-7">
      <h2 className="mb-3 eyebrow">{title}</h2>
      {children}
    </section>
  )
}

export function KitchenSink() {
  const toast = useToast()
  const [amount, setAmount] = React.useState<number | null>(38500)
  const [category, setCategory] = React.useState<Category>('meals')
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [closeableOpen, setCloseableOpen] = React.useState(false)
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [clearable, setClearable] = React.useState('tanamera draft white caramel')
  const [clearableAmount, setClearableAmount] = React.useState<number | null>(45000000)

  return (
    <main className="px-gutter pt-safe-header">
      <h1 className="text-title">Kitchen sink</h1>
      <p className="mt-1 mb-6 text-meta text-ink-3">
        Dev only. Force a scheme from the console with{' '}
        <code>document.documentElement.dataset.theme = &apos;dark&apos;</code>, or delete the key to
        follow the OS.
      </p>

      {/* ---------------------------------------------------------------- money rail */}
      <Section title="The money rail — the alignment test">
        <Card>
          <div className="rail">
            <span className="text-item">Alignment test</span>
            <Money value={1111111} size="md" />
          </div>
          <div className="rail">
            <span className="text-item">Alignment test</span>
            <Money value={8888888} size="md" />
          </div>
          <div className="rail">
            <span className="text-item">Alignment test</span>
            <Money value={266350} size="md" />
          </div>
        </Card>
        <p className="mt-3 text-body text-ink-2">
          Every digit position must line up vertically, not just the right edge. If the 1s are
          narrower than the 8s, tabular figures did not take.
        </p>
      </Section>

      <Section title="Money — every size and tone">
        <div className="flex flex-col items-end gap-2">
          <Money value={12345678} size="hero" />
          <Money value={266350} size="lg" />
          <Money value={266350} size="md" />
          <Money value={38500} size="sm" />
          <Money value={38500} size="sm" tone="muted" />
          <Money value={-45000} size="md" tone="danger" signed />
          <Money value={45000} size="md" tone="success" signed />
          <Money value={38500} size="sm" showPrefix={false} />
        </div>
        <p className="mt-3 text-body text-ink-2">
          The hero is 8 digits — it must fit one line at 414px. The signed pair is F08&apos;s
          month-over-month delta: red for spending more, green for less.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- buttons */}
      <Section title="Button — variants, sizes, states">
        <div className="flex flex-col gap-2.5">
          <Button fullWidth>Simpan</Button>
          <Button fullWidth variant="secondary">
            Bagikan
          </Button>
          <Button fullWidth variant="ghost">
            Ulangi dari teks
          </Button>
          <Button fullWidth variant="destructive">
            Hapus pengeluaran
          </Button>
          <Button fullWidth loading>
            Merapikan
          </Button>
          <Button fullWidth disabled>
            Nonaktif
          </Button>
          <div className="flex gap-2.5">
            <Button size="md" variant="secondary">
              Kecil
            </Button>
            <Button size="md" variant="secondary" disabled>
              Nonaktif
            </Button>
            <ButtonLink size="md" variant="ghost" href="/dev/ui">
              Tautan
            </ButtonLink>
          </div>
          <Button
            fullWidth
            variant="secondary"
            leadingIcon={<span className="text-input font-semibold">G</span>}
          >
            Lanjut dengan Google
          </Button>
        </div>
        <p className="mt-3 text-body text-ink-2">
          Loading must not change the button&apos;s size. Tap and hold any of them: no grey flash, a
          slight scale down, and back.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- categories */}
      <Section title="Chip — all eight, unselected and selected">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_LIST.map((m) => (
            <Chip key={m.id} category={m.id} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORY_LIST.map((m) => (
            <Chip key={m.id} category={m.id} selected />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Chip category={category} size="md" onClick={() => setPickerOpen(true)} />
          <span className="text-meta text-ink-3">interactive · opens the picker</span>
        </div>
        <p className="mt-3 text-body text-ink-2">
          All sixteen must be legible in both themes and still tell each other apart. The code is
          the identity; the colour is redundant.
        </p>
      </Section>

      <Section title="Item rows — CategoryCode in a dense list">
        <Card padded="rows">
          <ul className="divide-y divide-rule">
            {[
              ['roti buaya', 38500, 'meals'],
              ['kungfu soccer', 49000, 'entertainment'],
              ['fan fries plaza blok m', 58850, 'meals'],
              ['sewa unit 12F yang judulnya sengaja dibuat sangat panjang', 2100000, 'housing'],
            ].map(([name, value, cat]) => (
              <li key={name as string} className="flex min-h-row items-center gap-2 py-1">
                <span className="min-w-0 flex-1 truncate text-item">{name as string}</span>
                <CategoryCode category={cat as Category} />
                <Money value={value as number} size="sm" tone="muted" />
                <button
                  type="button"
                  aria-label={`Hapus ${name as string}`}
                  className="grid size-touch shrink-0 press place-items-center text-ink-3"
                >
                  <CloseIcon size="xs" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-3 text-body text-ink-2">
          The long title must ellipsis and must NOT push the amount off the rail. The delete target
          is a full 44×44.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- fields */}
      <Section title="Field, Input, MoneyInput, TextArea">
        <div className="flex flex-col gap-4">
          <Field label="Judul">
            <Input defaultValue="bakar duit tuesday" />
          </Field>

          <Field label="Nama item" error="Nama tidak boleh kosong">
            <Input defaultValue="" placeholder="mis. roti buaya" />
          </Field>

          {/*
            F17's clearable input, exactly as /new's item rows ship it. The mark appears only
            once there is text, and the field goes back to its normal 14px right inset when
            emptied — measured at 414x896: a 44x50 button whose right edge lands ON the field's,
            a 14px glyph 14px in. What this gallery CANNOT show is the pair that made it
            delicate: the 22px destructive delete outside the well, which exists only on /new.
          */}
          <Field
            label="Nama item, bisa dikosongkan"
            hint="Tombol kosongkan muncul begitu ada teks, dan fokus tetap di field."
          >
            <Input
              value={clearable}
              placeholder="mis. roti buaya"
              onChange={(event) => setClearable(event.target.value)}
              onClear={() => setClearable('')}
              clearLabel="Kosongkan nama item"
            />
          </Field>

          <Field label="Jumlah" hint="45k, 1,5jt dan Rp 38.500 semuanya bisa ditempel.">
            <MoneyInput
              value={amount}
              onValueChange={(v) => {
                setAmount(v)
                setParseError(null)
              }}
              onParseError={setParseError}
            />
          </Field>
          <p className="text-meta text-ink-3">
            value = {amount === null ? 'null' : amount}
            {parseError !== null && ` · onParseError(${JSON.stringify(parseError)})`}
          </p>

          {/*
            F18's clearable Jumlah. The plain one above stays, and that is not duplication:
            IT is the shape `/new`'s review row ships, which passes no `clearLabel` because
            100px of input cannot afford a 44px gutter — see MoneyInput's docblock.

            Seeded at 45.000.000 on purpose. That value measures 91px, and it is the number
            that decided the design: with the button reserving its gutter here there is room
            to spare, while overlaying it on `/new`'s 100px input would have put the ✕ on the
            last digit. Clear it and watch the field go back to its 6px right inset.

            Paste `abc` into it and the ✕ is STILL there — the gate is the displayed text, not
            the value, and an unreadable paste is the state a user is most stuck in.
          */}
          <Field
            label="Jumlah, bisa dikosongkan"
            hint="Tombol kosongkan muncul begitu ada isi — termasuk tempelan yang tak terbaca."
          >
            <MoneyInput
              value={clearableAmount}
              onValueChange={setClearableAmount}
              clearLabel="Kosongkan jumlah"
            />
          </Field>
          <p className="text-meta text-ink-3">
            value = {clearableAmount === null ? 'null' : clearableAmount}
          </p>

          <Field label="Catatan" hideLabel>
            <TextArea
              className="font-medium"
              rows={5}
              placeholder={
                'bakar duit tuesday - 18/8/2026\nroti buaya 38500\nayam sambal hitam 45k'
              }
            />
          </Field>
        </div>
        <p className="mt-3 text-body text-ink-2">
          Focus every one of these on a real iPhone: the page must not zoom. Type 45000 into Jumlah
          and the dots appear as you go. Paste <code>1,5jt</code> and it becomes 1.500.000; type{' '}
          <code>abc</code> and the border goes red without losing your text. On the clearable one,
          check the ✕ never sits on a digit: 999.999.999 measures 100px and the button reserves 44
          of its own, which is the arithmetic that kept it off <code>/new</code>.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- overlays */}
      <Section title="Sheet and CategoryPicker">
        <div className="flex flex-col gap-2.5">
          <Button variant="secondary" fullWidth onClick={() => setPickerOpen(true)}>
            Pilih kategori
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setSheetOpen(true)}>
            Sheet yang panjang
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setCloseableOpen(true)}>
            Sheet dengan tombol tutup
          </Button>
        </div>
        <p className="mt-3 text-body text-ink-2">
          On the long one: scroll to its bottom and keep dragging — the page behind must not move.
          Escape, then reopen: that is the onCancel regression test.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- feedback */}
      <Section title="Toast">
        <div className="flex flex-col gap-2.5">
          <Button
            variant="secondary"
            fullWidth
            onClick={() =>
              toast.show('Item dihapus', {
                action: { label: 'Urungkan', onAction: () => toast.show('Dikembalikan') },
              })
            }
          >
            Toast dengan Urungkan
          </Button>
          <Button variant="secondary" fullWidth onClick={() => toast.show('Tersimpan')}>
            Toast biasa
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => toast.show('Gagal menyimpan pengeluaran', { tone: 'danger' })}
          >
            Toast danger
          </Button>
        </div>
        <p className="mt-3 text-body text-ink-2">
          It must sit above the tab bar, not behind it — that is the{' '}
          <code>:has([data-tabbar])</code> rule doing its job.
        </p>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="Belum ada catatan"
          description="Bulan ini masih kosong. Tempel catatan pertamamu di tab Tambah."
        />
        <div className="mt-3">
          <EmptyState
            title="Belum ada foto"
            description="Foto struk atau makanan bisa ditempel di sini."
            action={
              <Button size="md" variant="secondary">
                Tambah foto
              </Button>
            }
          />
        </div>
      </Section>

      <Section title="Skeleton — the shape of the answer">
        <Card>
          <span className="skeleton h-4 w-[55%]" />
          <span className="skeleton mt-2 h-2.5 w-[32%]" />
          <div className="mt-4 divide-y divide-rule">
            {['52%', '62%', '48%', '66%', '40%'].map((w, i) => (
              <div key={w} className="flex items-center gap-3 py-3.5">
                <span className="skeleton h-3" style={{ flexBasis: w }} />
                <span
                  className="skeleton ml-auto h-3 w-16"
                  style={{ animationDelay: `${0.1 * i}s` }}
                />
              </div>
            ))}
          </div>
        </Card>
        <p className="mt-3 text-body text-ink-2">
          One row per pasted line, with an amount slot on the right, so the wait already says the
          paste was understood. No spinner anywhere in this app.
        </p>
      </Section>

      <CategoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={category}
        onSelect={setCategory}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Sheet yang panjang"
        description="Isi yang panjang, untuk menguji scroll di dalam panel."
        footer={
          <Button fullWidth onClick={() => setSheetOpen(false)}>
            Simpan
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-item text-ink-2">
              {i + 1}. Baris isi untuk menguji scroll di dalam sheet dan overscroll containment di
              belakangnya.
            </p>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={closeableOpen}
        onClose={() => setCloseableOpen(false)}
        title="Ubah item"
        showCloseButton
        footer={
          <Button fullWidth onClick={() => setCloseableOpen(false)}>
            Simpan
          </Button>
        }
      >
        <div className="flex flex-col gap-3.5 pb-2">
          <Field label="Nama">
            <Input className="bg-paper" defaultValue="fan fries plaza blok m" />
          </Field>
          <Field label="Jumlah">
            <MoneyInput className="bg-paper" value={58850} onValueChange={() => {}} />
          </Field>
          <div className="flex items-center gap-2">
            <Chip category={category} selected onClick={() => setPickerOpen(true)} />
            <span className="text-meta text-ink-3">
              ganti <ChevronRightIcon size="inline" />
            </span>
          </div>
        </div>
      </Sheet>
    </main>
  )
}
