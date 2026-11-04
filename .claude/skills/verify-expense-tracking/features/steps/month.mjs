// /m/<month>: the month list (total, "N catatan · M item", day headers, one row per expense).
// "Bulan sebelumnya" steps back a month; tapping a row opens /e/<id>.
// args: [month YYYY-MM] [title of a row to open in the previous month]
const steps = async ({ page, base, shot, log, args }) => {
  const month = args[0] ?? new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7) // Jakarta
  await page.goto(`${base}/m/${month}`, { waitUntil: 'networkidle' })
  await page.getByText(/\d+ catatan · \d+ item/).waitFor()
  log(`${month}: ${await page.getByText(/\d+ catatan · \d+ item/).innerText()}`)
  await shot('month')
  await page
    .getByRole('link', { name: /^Bulan sebelumnya/ })
    .or(page.getByRole('button', { name: /^Bulan sebelumnya/ }))
    .first()
    .click()
  await page.waitForURL((u) => !u.pathname.endsWith(month))
  await page.getByText(/\d+ catatan · \d+ item/).waitFor()
  await page.waitForLoadState('networkidle')
  log(
    `${new URL(page.url()).pathname}: ${await page.getByText(/\d+ catatan · \d+ item/).innerText()}`,
  )
  await shot('previous')
  if (args[1]) {
    await page.getByRole('link').filter({ hasText: args[1] }).first().click()
    await page.waitForURL(/\/e\/[0-9A-Za-z_-]{12}$/)
    await page.getByText('Total').first().waitFor()
    await shot('detail')
    log(`opened ${new URL(page.url()).pathname}`)
  }
}
export default steps
