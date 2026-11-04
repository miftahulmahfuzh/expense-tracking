// node ui.mjs <base-url> <steps.mjs> <evidence-dir> <cookie-value|-> <standin-url> <store-host> <tools-dir> [width] [theme] [tag]
// Steps module: `export default async ({ page, base, shot, log, fixture, args, allow }) => { ... }`.
//   args           the words after `--` on the verify.sh ui command line
//   shot(name)     viewport screenshot into evidence (every screen is a phone column)
//   log(text)      line into the run's ui transcript
//   fixture(name)  absolute path of a file under the skill's features/fixtures/
//   allow(regex)   a console error this journey causes on purpose (a revoked link's 404)
// Signed in as the run's user (the cookie verify.sh minted), or signed out when the cookie is `-`.
// Records a video of the whole drive and a final screenshot, pass or fail. Fails on a page error,
// a console error, a signed-in drive ending on the sign-in screen, or horizontal scroll.
//
// The browser's network is fenced like the server's: loopback passes, the run's fake Blob store
// (https://<store-host>/...) is served from the stand-in, and every other host is aborted and
// logged. No permission is granted (clipboard, notifications), so the share sheet takes its
// manual-copy fallback. The browser runs in Asia/Jakarta, the zone every date in the app is in.
// Playwright comes from the harness's own tool dir, never from the app's node_modules.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { appendFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

const [
  base,
  stepsPath,
  evidence,
  cookie,
  standin,
  storeHost,
  tools,
  width = '390',
  theme = 'light',
  tagArg,
] = process.argv.slice(2)
if (!base || !stepsPath || !evidence || !cookie || !standin || !storeHost || !tools) {
  console.error(
    'usage: node ui.mjs <base> <steps.mjs> <evidence> <cookie|-> <standin> <store-host> <tools> [width] [theme] [tag]',
  )
  process.exit(2)
}

const require = createRequire(path.join(tools, 'package.json'))
const { chromium } = require('playwright')

const n = readdirSync(evidence).filter(
  (f) => /^\d\d-.*\.txt$/.test(f) && !f.startsWith('00-'),
).length
const tag = tagArg || `${String(n + 1).padStart(2, '0')}-ui-${path.basename(stepsPath, '.mjs')}`
const transcript = path.join(evidence, `${tag}.txt`)
const log = (text) => {
  appendFileSync(transcript, `${text}\n`)
  console.log(text)
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: Number(width), height: 844 },
  colorScheme: theme === 'dark' ? 'dark' : 'light',
  timezoneId: 'Asia/Jakarta',
  locale: 'id-ID',
  recordVideo: { dir: path.join(evidence, '.video'), size: { width: Number(width), height: 844 } },
  permissions: [],
  // The stand-in's browser-facing Blob listener has a per-run self-signed certificate. This
  // context reaches nothing but loopback and the fake store anyway (see the route below).
  ignoreHTTPSErrors: true,
})
const anon = cookie === '-'
if (!anon) {
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: cookie,
      domain: new URL(base).hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

const blocked = new Set()
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
  if (url.hostname === storeHost) {
    const res = await fetch(`${standin}/files${url.pathname}`)
    return route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: Buffer.from(await res.arrayBuffer()),
    })
  }
  if (!blocked.has(url.host)) {
    blocked.add(url.host)
    log(`egress BLOCKED (browser) ${route.request().method()} ${url.origin}`)
  }
  return route.abort('blockedbyclient')
})

// Next's dev-tools badge (<nextjs-portal>) exists only under `next dev` and sits over the bottom
// of the screen, where the tab bar is, swallowing clicks. Hide it; the app is untouched.
await context.addInitScript(() => {
  const hide = () => {
    const st = document.createElement('style')
    st.textContent = 'nextjs-portal { display: none !important; }'
    document.head.appendChild(st)
  }
  if (document.head) hide()
  else document.addEventListener('DOMContentLoaded', hide)
})
const page = await context.newPage()
page.setDefaultTimeout(30_000)
const problems = []
const allowed = []
const allow = (re) => allowed.push(re)
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // The aborted off-allowlist requests above surface as console errors; they are logged as egress.
  if (/ERR_BLOCKED_BY_CLIENT/.test(m.text())) return
  if (allowed.some((re) => re.test(m.text()))) {
    log(`console.error (allowed): ${m.text()}`)
    return
  }
  problems.push(m.text())
  log(`console.error: ${m.text()}`)
})
// The console only says "Failed to load resource"; this names the URL.
page.on('requestfailed', (r) => {
  if (r.failure()?.errorText === 'net::ERR_BLOCKED_BY_CLIENT') return
  log(`request failed: ${r.method()} ${r.url().slice(0, 200)} ${r.failure()?.errorText ?? ''}`)
})
page.on('pageerror', (e) => {
  problems.push(e.message)
  log(`pageerror: ${e.message}`)
})
let shots = 0
const shot = async (name) => {
  const file = path.join(evidence, `${tag}-${++shots}-${name}.png`)
  // caret: 'initial' -- the default hides the caret by injecting a style, which races hydration
  // and is reported as a hydration mismatch the app does not have.
  await page.screenshot({ path: file, caret: 'initial' })
  log(`screenshot: ${file}`)
}
const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../features/fixtures',
)
const fixture = (name) => path.join(fixtureDir, name)

let failed = null
try {
  log(`steps: ${stepsPath}  (${width}px, ${theme}, ${anon ? 'signed out' : 'signed in'})`)
  const { default: steps } = await import(pathToFileURL(stepsPath).href)
  await steps({
    page,
    base,
    shot,
    log,
    fixture,
    allow,
    args: JSON.parse(process.env.ET_VERIFY_ARGS ?? '[]'),
  })
  if (!anon && (await page.getByRole('button', { name: /lanjut dengan google/i }).count()) > 0) {
    throw new Error('ended on the sign-in screen: the session was rejected')
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0)
    throw new Error(`horizontal scroll: ${overflow}px wider than the ${width}px viewport`)
  if (problems.length) throw new Error(`${problems.length} console/page error(s)`)
  log('result: PASS')
} catch (err) {
  failed = err
  log(`result: FAIL ${err?.stack ?? err}`)
} finally {
  await shot(failed ? 'failure' : 'final').catch(() => {})
  const video = page.video()
  await context.close()
  await browser.close()
  if (video) {
    const file = path.join(evidence, `${tag}.webm`)
    renameSync(await video.path(), file)
    rmSync(path.join(evidence, '.video'), { recursive: true, force: true })
    log(`video: ${file}`)
  }
  console.error(`[evidence: ${transcript}]`)
}
process.exit(failed ? 1 : 0)
