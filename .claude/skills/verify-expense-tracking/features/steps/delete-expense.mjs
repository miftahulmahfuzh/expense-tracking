// /e/<id>: the trash button ("Hapus pengeluaran") -> confirm "Hapus" -> back on /m/<month>, the
// group gone from the list. Its items, photos and share links cascade; its blobs are deleted
// from the store (read both back with `sql` and `blobs`).
// args: <groupId>
const steps = async ({ page, base, shot, log, args }) => {
  const [id] = args
  if (!id) throw new Error('usage: delete-expense.mjs -- <groupId>')
  await page.goto(`${base}/e/${id}`, { waitUntil: 'networkidle' })
  const title = await page.getByRole('textbox', { name: 'Judul' }).inputValue()
  await page.getByRole('button', { name: 'Hapus pengeluaran' }).click()
  await page.getByText('Semua item dan foto di dalamnya ikut terhapus.').waitFor()
  await shot('confirm')
  await page.getByRole('button', { name: 'Hapus', exact: true }).filter({ visible: true }).click()
  await page.waitForURL(/\/m\/\d{4}-\d{2}$/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await shot('month')
  if (await page.getByText(title, { exact: true }).count())
    throw new Error(`"${title}" still listed`)
  log(`deleted "${title}"; now on ${new URL(page.url()).pathname}`)
}
export default steps
