// Signed out (run with --anon): a protected URL bounces to the sign-in page with ?next=, which
// shows "Lanjut dengan Google". The button is never pressed: Google is outside every run.
// args: [protected path, default /stats]
const steps = async ({ page, base, shot, log, args }) => {
  const target = args[0] ?? '/stats'
  await page.goto(`${base}${target}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Lanjut dengan Google/ }).waitFor()
  const u = new URL(page.url())
  log(`landed on ${u.pathname}${u.search}`)
  if (u.pathname !== '/' || u.searchParams.get('next') !== target)
    throw new Error(`expected /?next=${target}, got ${u.pathname}${u.search}`)
  await shot('signin')
}
export default steps
