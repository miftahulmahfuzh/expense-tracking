// /e/<id>: "Bagikan" mints (or returns) the group's public /s/<token> link. Headless Chromium has
// no navigator.share and lets a focused page write the clipboard without a grant, so the end
// state is the "Tersalin" toast (the manual-copy sheet if the clipboard refuses). After a reload
// the detail page shows the "Tautan Publik" panel with its revoke button.
// args: <groupId>
const steps = async ({ page, base, shot, log, args }) => {
  const [id] = args
  if (!id) throw new Error('usage: share.mjs -- <groupId>')
  await page.goto(`${base}/e/${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Bagikan', exact: true }).click()
  // The manual-copy sheet's heading is always in the DOM, hidden: wait for what is visible.
  const manual = page.getByText('Salin tautannya sendiri').filter({ visible: true })
  await page
    .getByText('Tersalin', { exact: true })
    .or(manual)
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 30_000 })
  await shot('shared')
  log((await manual.count()) ? 'share: manual-copy sheet' : 'share: copied ("Tersalin")')
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Tautan Publik').waitFor()
  await page.getByRole('button', { name: 'Batalkan tautan' }).waitFor()
  await shot('panel')
  log('panel: "Tautan Publik" with "Batalkan tautan"')
}
export default steps
