// /e/<id>: add a photo (browser compression -> /api/photos/upload token -> direct Blob PUT to the
// run's stand-in -> attachPhoto), open it in the lightbox, then "Bagikan foto". Headless Chromium
// lets a focused page write the clipboard without any permission grant, so the end state is the
// "Tautan disalin" pill; if the clipboard refuses, the manual-copy field holds the link instead.
// Read the token back with: sql --value "select token from photo_share_links ...".
// args: <groupId> [fixture name, default receipt.jpg]
const steps = async ({ page, base, shot, log, fixture, args }) => {
  const [id, name = 'receipt.jpg'] = args
  if (!id) throw new Error('usage: photo.mjs -- <groupId> [fixture]')
  await page.goto(`${base}/e/${id}`, { waitUntil: 'networkidle' })
  const before = await page.getByRole('button', { name: /^Buka foto \d+ dari \d+$/ }).count()
  await page.locator('input[type="file"]').setInputFiles(fixture(name))
  // The gallery's own signal: one more "Buka foto N dari M" thumbnail once attachPhoto lands.
  await page
    .getByRole('button', { name: `Buka foto ${before + 1} dari ${before + 1}` })
    .waitFor({ timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  await shot('attached')
  log(`photos: ${before} -> ${before + 1}`)
  await page.getByRole('button', { name: `Buka foto ${before + 1} dari ${before + 1}` }).click()
  await page.getByRole('button', { name: 'Bagikan foto' }).click()
  const manual = page.getByRole('textbox', { name: 'Salin manual' })
  await page.getByText('Tautan disalin').or(manual).waitFor({ timeout: 30_000 })
  await shot('shared')
  log(
    (await manual.count())
      ? `photo share link (manual copy): ${await manual.inputValue()}`
      : 'photo share link copied to the clipboard ("Tautan disalin")',
  )
}
export default steps
