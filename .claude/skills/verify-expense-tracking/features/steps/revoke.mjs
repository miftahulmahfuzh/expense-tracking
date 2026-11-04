// /e/<id> with an active link: "Batalkan tautan" -> confirm "Ya, batalkan" -> "Tautan dibatalkan".
// The old /s/<token> must then be dead (prove it with `api --anon GET /s/<token>`).
// args: <groupId>
const steps = async ({ page, base, shot, log, args }) => {
  const [id] = args
  if (!id) throw new Error('usage: revoke.mjs -- <groupId>')
  await page.goto(`${base}/e/${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Batalkan tautan' }).click()
  await page.getByRole('button', { name: 'Ya, batalkan' }).click()
  await page.getByText('Tautan dibatalkan').waitFor({ timeout: 30_000 })
  await shot('revoked')
  await page.reload({ waitUntil: 'networkidle' })
  if (await page.getByText('Tautan Publik').count())
    throw new Error('panel still shown after revoke')
  log('revoked: toast shown, panel gone after reload')
}
export default steps
