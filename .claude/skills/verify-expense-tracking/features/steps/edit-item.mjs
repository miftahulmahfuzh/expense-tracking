// /e/<id>: tap an item row -> "Ubah item" sheet -> new Jumlah -> Simpan; the row and the Total
// re-render with the new amount. With --add semantics (args[1] === '+'), "+ Tambah Item" opens a
// blank "Item baru" sheet instead and the new row appears.
// args: <groupId> <itemName> <amount>        edit an existing item's amount
//       <groupId> + <newName> <amount>       add an item
const steps = async ({ page, base, shot, log, args }) => {
  const [id, which, a, b] = args
  if (!id || !which)
    throw new Error(
      'usage: edit-item.mjs -- <groupId> <itemName> <amount> | <groupId> + <name> <amount>',
    )
  const adding = which === '+'
  const name = adding ? a : which
  const amount = adding ? b : a
  await page.goto(`${base}/e/${id}`, { waitUntil: 'networkidle' })
  const total = async () =>
    (
      await page
        .getByText(/^Total/)
        .first()
        .locator('..')
        .innerText()
    ).replace(/\s+/g, ' ')
  log(`before: ${await total()}`)
  if (adding) {
    await page.getByRole('button', { name: '+ Tambah Item' }).click()
    await page.getByText('Item baru').filter({ visible: true }).waitFor()
    // The sheet opens blank on every add (bb919b3): a stale Nama here is a regression.
    const stale = await page.getByRole('textbox', { name: 'Nama' }).inputValue()
    if (stale) throw new Error(`"Item baru" opened with Nama = ${JSON.stringify(stale)}`)
    await page.getByRole('textbox', { name: 'Nama' }).fill(name)
  } else {
    // The row is a button whose text is the item; the "Hapus <name>" button beside it has none.
    await page.getByRole('button').filter({ hasText: name }).first().click()
    await page.getByText('Ubah item').filter({ visible: true }).waitFor()
  }
  await page.getByRole('textbox', { name: 'Jumlah' }).fill(String(amount))
  await shot('sheet')
  await page.getByRole('button', { name: 'Simpan', exact: true }).filter({ visible: true }).click()
  await page
    .getByText('Ubah item')
    .or(page.getByText('Item baru'))
    .filter({ visible: true })
    .waitFor({ state: 'detached' })
    .catch(() => {})
  await page.getByRole('button').filter({ hasText: name }).first().waitFor()
  await page.waitForLoadState('networkidle')
  await shot('saved')
  log(
    `row: ${(await page.getByRole('button').filter({ hasText: name }).first().innerText()).replace(/\s+/g, ' ')}`,
  )
  log(`after: ${await total()}`)
}
export default steps
