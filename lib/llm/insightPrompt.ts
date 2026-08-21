import type Anthropic from '@anthropic-ai/sdk'

import type { WindowItemRow } from '@/lib/db/queries'
import type { InsightWindows } from '@/lib/insights/freshness'

/**
 * The prompt behind `/stats`'s three summaries — F12 §7.3.
 *
 * Type-only SDK import and no `server-only`, so the tests (and a schema inspector) can read it
 * without an API key or an RSC graph — the same arrangement `prompt.ts` uses and for the same
 * reason.
 *
 * ═══ DO NOT TRIM THIS PROMPT TO SAVE TOKENS. ═══
 *
 * `lib/llm/COST.md` closed that question with measurements: z.ai caches the prompt by itself,
 * with no `cache_control` from us, so a warm request bills ~60 uncached tokens against ~4,350
 * cached ones. A prompt edit costs exactly one full-price request and is then free again.
 * Length is not the cost lever it looks like; being explicit is what keeps the money bug away.
 */

export const INSIGHT_TOOL_NAME = 'record_insight'

/**
 * Three short Indonesian paragraphs.
 *
 * NO `strict: true`, NO `cache_control` — both are Claude-side features that portable
 * Anthropic-compatible servers do not implement, and a silently-ignored one is worse than a
 * rejected one because it looks like it worked (F04 §0.1). Zod is the enforcement layer.
 *
 * `maxLength` is in the schema AND in Zod. The schema's copy is advice the model usually
 * follows; Zod's is the one that decides. Both exist because a 900-character paragraph is not a
 * validation failure worth rejecting a whole response over — it is a layout problem — so the
 * limits are generous and the prompt does the real shaping.
 */
export const RECORD_INSIGHT_TOOL: Anthropic.Tool = {
  name: INSIGHT_TOOL_NAME,
  description:
    'Record the three spending summaries for this user. Call this exactly once. ' +
    'Never reply with prose outside the tool call.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['minggu', 'bulan', 'dua_bulan'],
    properties: {
      minggu: {
        type: 'string',
        minLength: 1,
        maxLength: 700,
        description:
          'Ringkasan MINGGU INI (Senin sampai Minggu, batas ada di prompt). Bandingkan ' +
          'hari-hari dalam minggu itu, sebut nama warung/toko yang terlihat berulang, dan ' +
          'tutup dengan satu saran konkret. 2-4 kalimat.',
      },
      bulan: {
        type: 'string',
        minLength: 1,
        maxLength: 700,
        description:
          'Ringkasan BULAN INI. Bandingkan minggu-minggu di dalam bulan itu, dan rata-rata ' +
          'per warung kalau ada polanya. Tutup dengan satu saran konkret. 2-4 kalimat.',
      },
      dua_bulan: {
        type: 'string',
        minLength: 1,
        maxLength: 700,
        description:
          'Bandingkan BULAN INI dengan BULAN LALU. Sebut pos yang naik atau turun paling ' +
          'jelas — tagihan, bensin, parkir, makan. Tutup dengan satu saran konkret. ' +
          '2-4 kalimat.',
      },
    },
  },
}

/**
 * ONE CALL, THREE SECTIONS. Not three calls: the system prompt and the tool schema are ~4,400
 * tokens that would be resent verbatim each time, the three sections read the same 62 days of
 * rows, and three separate responses can contradict each other about the same week.
 */
export function buildInsightPrompt(w: InsightWindows): string {
  return `Anda menganalisis catatan pengeluaran pribadi seorang pengguna di Indonesia.
Tulis TIGA ringkasan singkat dalam bahasa Indonesia yang santai tapi padat, lalu panggil
${INSIGHT_TOOL_NAME} tepat satu kali.

TANGGAL HARI INI: ${w.todayISO} (zona waktu Asia/Jakarta)

BATAS TIAP RINGKASAN — patuhi persis, jangan digeser:
- MINGGU INI       : ${w.weekStartISO} sampai ${w.weekEndISO} (Senin sampai Minggu)
- BULAN INI        : ${w.thisMonth}
- BULAN LALU       : ${w.previousMonth} (hanya untuk perbandingan di ringkasan ketiga)

CARA MEMBACA DATA:
- Setiap baris adalah satu barang: TANGGAL | NAMA | JUMLAH | KATEGORI.
- JUMLAH adalah RUPIAH BULAT sebagai bilangan bulat. 25000 berarti Rp 25.000, bukan Rp 25.
  Jangan pernah mengalikan atau membagi dengan 1000. Jangan menambah desimal.
- Tulis angka dengan format Indonesia: Rp 25.000, bukan Rp 25,000 dan bukan 25k.
- Data hanya mencakup ${w.windowStartISO} sampai ${w.todayISO}. Apa pun di luar itu tidak
  Anda ketahui.
- BULAN INI mungkin belum selesai. Kalau membandingkan dengan bulan lalu yang sudah penuh,
  KATAKAN bahwa bulan ini masih berjalan — jangan melaporkan penurunan palsu.

YANG MEMBUAT RINGKASAN INI BERGUNA:
- SEBUT NAMA yang Anda lihat di data. Kalau ada "Nasi Cordoba" tiga kali seminggu, sebut
  Cordoba dan bandingkan harganya antar hari. Nama warung jauh lebih berguna daripada kata
  "makanan".
- Cari POLA, bukan daftar. "Makan siang stabil, makan malam yang naik" lebih berguna daripada
  mengulang tiap baris.
- Satu SARAN konkret di akhir tiap ringkasan. Saran yang bisa dikerjakan, bukan "hemat lebih
  banyak".

ATURAN KERAS:
- JANGAN mengarang angka, tanggal, atau nama yang tidak ada di data.
- JANGAN menghitung total yang tidak Anda yakini; lebih baik menyebut arah ("naik", "turun")
  daripada angka yang salah.
- Kalau sebuah periode tidak punya data sama sekali, katakan begitu dalam satu kalimat. Jangan
  mengisi dengan tebakan.
- 2 sampai 4 kalimat per ringkasan. Tanpa judul, tanpa bullet, tanpa markdown.`
}

/**
 * The rows, as the model reads them.
 *
 * A PIPE-DELIMITED TABLE, not JSON. ~600 rows of `{"occurredOn":"2026-08-18","name":…}` spends
 * roughly twice the tokens on repeated key names, and the model has no more trouble with columns
 * than with objects. The header line is what makes the columns unambiguous.
 *
 * Amounts are printed as bare integers — no `Rp`, no separators — because that is exactly what
 * the column IS, and formatting them here would invite the model to read a formatted number back
 * out at a different magnitude. The prompt states the unit once, loudly.
 */
export function formatInsightRows(rows: ReadonlyArray<WindowItemRow>): string {
  if (rows.length === 0) return '(tidak ada pengeluaran tercatat pada periode ini)'
  const lines = rows.map((r) => `${r.occurredOn} | ${r.name} | ${r.amountIdr} | ${r.category}`)
  return ['TANGGAL | NAMA | JUMLAH | KATEGORI', ...lines].join('\n')
}
