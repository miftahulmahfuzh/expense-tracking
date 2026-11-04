// /new: paste a note, Rapikan (the real z.ai parse, 1 call), review, Simpan -> /e/<id>.
// args: [pasted text] (default: a three-line note the seed does not hold).
const DEFAULT = 'jajan verify\nkopi susu 25\nnasi goreng 18k\nparkir 5000'

const steps = async ({ page, base, shot, log, args }) => {
  const text = args[0] ?? DEFAULT
  await page.goto(`${base}/new`, { waitUntil: 'networkidle' }) // let it hydrate
  await page.locator('textarea').fill(text)
  await shot('pasted')
  await page.getByRole('button', { name: 'Rapikan' }).click()
  // The review stage's own signal: the save button appears once the parse lands.
  const save = page.getByRole('button', { name: 'Simpan', exact: true })
  await save.waitFor({ timeout: 60_000 })
  await shot('review')
  log(`review: ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  await save.click()
  await page.waitForURL(/\/e\/[0-9A-Za-z_-]{12}$/, { timeout: 60_000 })
  await page.getByText('Total').first().waitFor()
  await shot('saved')
  log(`saved ${new URL(page.url()).pathname}`)
}
export default steps
