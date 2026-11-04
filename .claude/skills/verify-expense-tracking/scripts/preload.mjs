// Loaded into every Node process a verify run starts (NODE_OPTIONS=--import <this file>): the
// `next dev` server and its workers, and doctor's egress probe. Inert unless ET_VERIFY_STANDIN is
// set, which only verify.sh does.
//
// Three jobs on globalThis.fetch (Node's fetch ignores HTTP(S)_PROXY, so a dead proxy cannot stop
// it; Next wraps fetch after this preload, so the guard stays underneath), plus a guard on
// node:http and node:https:
//
// 1. Route the hosted services to the run's stand-in. The run's DATABASE_URL names the host
//    pg.etverify.invalid, so `neon()` POSTs to https://api.etverify.invalid/sql: rewritten to the
//    stand-in's /sql. URLs of the run's fake Blob store (https://<store>.public.blob.vercel-storage.com,
//    which next/image's optimizer fetches) are rewritten to the stand-in's /files. The Blob API
//    itself needs no rewrite: VERCEL_BLOB_API_URL already points at the stand-in on loopback.
//
// 2. The paid-call budget. A fetch to the configured LLM host (z.ai, pool `llm`) first takes one
//    call from the stand-in's counter; when the pool is empty, or the run is still seeding, the
//    fetch rejects as a network error, which is how the app sees a vendor outage (parseExpense
//    falls back to its regex parser, /stats shows no summary).
//
// 3. Egress control. Every other host that is not loopback and not on ET_VERIFY_ALLOW_HOSTS is
//    refused and logged ("et-verify: egress BLOCKED"): every other Blob store (production's),
//    Neon, Google, Vercel, GitHub. Best effort: a native addon, a raw net.connect or undici's own
//    dispatcher is not covered (@vercel/blob's server calls go through undici, but only ever to
//    VERCEL_BLOB_API_URL, which is the stand-in).
import http from 'node:http'
import https from 'node:https'

const standin = process.env.ET_VERIFY_STANDIN
if (standin) {
  const list = (v) =>
    (v ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
  const store = process.env.ET_VERIFY_STORE_HOST
  const allow = new Set(list(process.env.ET_VERIFY_ALLOW_HOSTS))
  const paid = new Map(list(process.env.ET_VERIFY_PAID_HOSTS).map((e) => e.split('=')))
  const loopback = (h) =>
    h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0'
  const real = globalThis.fetch

  globalThis.fetch = async function verifyFetch(input, init) {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    let url
    try {
      url = new URL(href)
    } catch {
      return real(input, init)
    }
    const method = init?.method || (typeof input === 'object' && input?.method) || 'GET'
    if (url.hostname.endsWith('.etverify.invalid') && url.pathname === '/sql')
      return real(`${standin}/sql`, init)
    if (store && url.hostname === store) {
      // A Request input carries its own method/headers; a blob read is always a plain GET.
      return real(
        `${standin}/files${url.pathname}`,
        typeof input === 'object' && !(input instanceof URL) ? { method } : init,
      )
    }
    if (
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      loopback(url.hostname) ||
      allow.has(url.hostname)
    )
      return real(input, init)
    const pool = paid.get(url.hostname)
    if (pool) {
      const res = await real(
        `${standin}/budget/take?pool=${pool}&what=${encodeURIComponent(method + ' ' + url.pathname)}`,
        { method: 'POST' },
      )
      if (res.ok) return real(input, init)
      const why = (await res.json().catch(() => ({}))).why ?? res.status
      console.error(`et-verify: paid call REFUSED ${method} ${url.origin}${url.pathname}: ${why}`)
      throw new TypeError(`et-verify: paid call refused (${why})`)
    }
    console.error(`et-verify: egress BLOCKED ${method} ${url.origin}${url.pathname}`)
    throw new TypeError(`et-verify: egress to ${url.host} is blocked in a verify run`)
  }

  // request(url[, options][, cb]) | request(options[, cb]): find the host either way.
  const hostOf = (a, b) => {
    if (typeof a === 'string' || a instanceof URL) {
      try {
        return new URL(a).hostname
      } catch {
        return ''
      }
    }
    const o = a ?? b ?? {}
    return String(o.hostname ?? o.host ?? 'localhost').replace(/:\d+$/, '')
  }
  for (const [name, mod] of [
    ['http', http],
    ['https', https],
  ]) {
    // `get` is wrapped on its own: it does not go through the exported `request`.
    for (const fn of ['request', 'get']) {
      const orig = mod[fn]
      mod[fn] = function guarded(a, b, c) {
        const host = hostOf(a, b)
        if (loopback(host) || allow.has(host)) return orig.call(this, a, b, c)
        console.error(`et-verify: egress BLOCKED ${name}.${fn} ${host}`)
        throw new Error(`et-verify: egress to ${host} is blocked in a verify run`)
      }
    }
  }
}
