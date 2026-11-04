// /stats ("Simpulan"): the month total, the 4-month chart, the category breakdown and the three
// summary sections. The summary is written by z.ai on a view when the data or the calendar moved
// (1 call), and served from expense_insights otherwise (0 calls).
// args: [month YYYY-MM] (default: the current month)
const steps = async ({ page, base, shot, log, args }) => {
  await page.goto(`${base}/stats${args[0] ? `?m=${args[0]}` : ''}`, { waitUntil: 'networkidle' })
  await page.getByText('Rincian Kategori').waitFor()
  await shot('top')
  // The summary streams in after the aggregates: wait for its section, not for the page to settle.
  await page.getByText('Simpulan 2 Bulan Terakhir').last().waitFor({ timeout: 60_000 })
  await page.getByText('Simpulan Minggu Ini').last().scrollIntoViewIfNeeded()
  await shot('summary')
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  log(`stats: ${text.slice(0, 600)}`)
}
export default steps
