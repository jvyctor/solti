// Phone remote: a small HTTPS server (self-signed certificate) serving a mobile page and a token-authenticated API.
// Off unless the user turns it on. Pairing = a one-time token (2 min) shown as a QR code; it is exchanged for a long
// random device credential that is stored only as a SHA-256 hash and can be revoked. The remote can watch terminals,
// type into them, answer approval requests and interrupt agents. It cannot change settings or create/delete anything.
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { tr } = require('./i18n.cjs')

const PAIR_TTL = 2 * 60 * 1000
const MAX_FAILS = 10 // per address, per window
const FAIL_WINDOW = 10 * 60 * 1000
const MAX_BODY = 16 * 1024
const MAX_STREAMS = 12

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const rand = (n = 32) => crypto.randomBytes(n).toString('hex')
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address)
  return out
}

// host: { terminals(), buffer(id), write(id, data), onOutput(cb), interrupt(id?), activity, assets: { html, xtermJs, xtermCss } }
function create({ dir, host, version = '' }) {
  fs.mkdirSync(dir, { recursive: true })
  const devFile = path.join(dir, 'devices.json')
  const certFile = path.join(dir, 'cert.json')
  let devices = []
  try { devices = JSON.parse(fs.readFileSync(devFile, 'utf8')) } catch {}
  const saveDevices = () => fs.writeFileSync(devFile, JSON.stringify(devices))

  let pairing = null // { hash, expires }
  const fails = new Map() // address -> [timestamps]
  const streams = new Set()
  let server = null
  let port = 0
  let plain = null // optional HTTP server (no encryption), for phones whose browser refuses the self-signed certificate
  let plainPort = 0
  let fingerprint = ''

  const limited = (addr) => (fails.get(addr) || []).filter((t) => Date.now() - t < FAIL_WINDOW).length >= MAX_FAILS
  const fail = (addr) => fails.set(addr, [...(fails.get(addr) || []).filter((t) => Date.now() - t < FAIL_WINDOW), Date.now()])

  // iOS Safari refuses certificates that lack a subjectAltName for the address it connects to, are valid for more than
  // ~13 months, or have no serverAuth usage. So: SAN with every LAN IP, 1 year, proper usages; regenerated when the
  // network addresses change or the certificate is about to expire.
  async function cert() {
    const ips = ['127.0.0.1', ...lanAddresses()]
    try {
      const c = JSON.parse(fs.readFileSync(certFile, 'utf8'))
      const fresh = c.version === 2 && c.expires - Date.now() > 30 * 24 * 3600 * 1000 && ips.every((ip) => c.ips.includes(ip))
      if (fresh) return c
    } catch {}
    const selfsigned = require('selfsigned')
    const notAfterDate = new Date(Date.now() + 365 * 24 * 3600 * 1000)
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'Agent Canvas' }], {
      keySize: 2048,
      algorithm: 'sha256',
      notAfterDate,
      extensions: [
        { name: 'basicConstraints', cA: false, critical: true },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...ips.map((ip) => ({ type: 7, ip }))] },
      ],
    })
    const c = { version: 2, key: pems.private, cert: pems.cert, fingerprint: pems.fingerprint, ips, expires: notAfterDate.getTime() }
    fs.writeFileSync(certFile, JSON.stringify(c))
    return c
  }

  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }
  const readBody = (req) => new Promise((resolve, reject) => {
    let b = ''
    req.on('data', (c) => { b += c; if (b.length > MAX_BODY) { reject(new Error('too large')); req.destroy() } })
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}) } catch { reject(new Error('bad json')) } })
  })
  const sse = (res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    const ka = setInterval(() => res.write(': keepalive\n\n'), 20000)
    const stream = { send, close: () => { clearInterval(ka); streams.delete(stream) } }
    streams.add(stream)
    res.on('close', stream.close)
    return stream
  }

  const authed = (req) => {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '')
    if (!m) return null
    const h = sha(m[1])
    const d = devices.find((x) => same(x.hash, h))
    if (d) d.lastSeen = Date.now()
    return d || null
  }

  const state = () => ({ version, terminals: host.terminals(), approvals: host.activity.pendingList(), activity: host.activity.list().slice(-60) })

  async function handle(req, res) {
    const addr = req.socket.remoteAddress
    const url = new URL(req.url, 'https://x')
    const p = url.pathname

    // Static page and xterm assets need no credential (they hold no data).
    if (req.method === 'GET' && p === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" }); return res.end(host.assets.html) }
    if (req.method === 'GET' && p === '/xterm.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(host.assets.xtermJs) }
    if (req.method === 'GET' && p === '/xterm.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(host.assets.xtermCss) }

    if (limited(addr)) return json(res, 429, { error: 'too many failed attempts; try again later' })

    if (req.method === 'POST' && p === '/api/pair') {
      let b
      try { b = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
      const ok = pairing && Date.now() < pairing.expires && typeof b.token === 'string' && same(sha(b.token), pairing.hash)
      if (!ok) { fail(addr); return json(res, 401, { error: 'invalid or expired pairing code' }) }
      pairing = null // single use
      const cred = rand(32)
      const device = { id: rand(6), name: String(b.name || 'celular').slice(0, 40), hash: sha(cred), created: Date.now(), lastSeen: Date.now() }
      devices.push(device)
      saveDevices()
      host.activity.record({ kind: 'remote', from: device.name, to: '', text: tr('celular pareado'), outcome: 'ok' })
      return json(res, 200, { credential: cred, device: { id: device.id, name: device.name } })
    }

    const dev = authed(req)
    if (!dev) { fail(addr); return json(res, 401, { error: 'unauthorized' }) }

    try {
      if (req.method === 'GET' && p === '/api/state') return json(res, 200, state())

      if (req.method === 'GET' && p === '/api/events') {
        if (streams.size >= MAX_STREAMS) return json(res, 429, { error: 'too many streams' })
        const s = sse(res)
        const offs = [
          host.activity.on('entry', (e) => s.send({ type: 'activity', entry: e })),
          host.activity.on('request', (r) => s.send({ type: 'approval', request: r })),
          host.activity.on('closed', (id) => s.send({ type: 'approval-closed', id })),
        ]
        res.on('close', () => offs.forEach((o) => o()))
        return s.send({ type: 'hello' })
      }

      const m = /^\/api\/term\/([\w-]+)\/(stream|input|interrupt)$/.exec(p)
      if (m) {
        const [, id, action] = m
        const t = host.terminals().find((x) => x.id === id)
        if (!t) return json(res, 404, { error: 'terminal not running' })
        if (req.method === 'GET' && action === 'stream') {
          if (streams.size >= MAX_STREAMS) return json(res, 429, { error: 'too many streams' })
          const s = sse(res)
          s.send({ type: 'init', cols: t.cols, rows: t.rows, data: Buffer.from(host.buffer(id)).toString('base64') })
          const off = host.onOutput((tid, data) => { if (tid === id) s.send({ type: 'data', data: Buffer.from(data).toString('base64') }) })
          res.on('close', off)
          return
        }
        if (req.method === 'POST' && action === 'input') {
          const b = await readBody(req)
          if (typeof b.data !== 'string' || !b.data || b.data.length > 4000) return json(res, 400, { error: 'bad input' })
          host.write(id, b.data, !!b.enter) // enter: sent apart from the text so TUIs do not take it for a paste
          host.activity.record({ kind: 'remote', from: dev.name, to: t.name, text: b.data.replace(/[\x00-\x1f]/g, ' ').slice(0, 200), outcome: 'ok' })
          return json(res, 200, { ok: true })
        }
        if (req.method === 'POST' && action === 'interrupt') {
          host.interrupt(id)
          host.activity.record({ kind: 'remote', from: dev.name, to: t.name, text: tr('interrompeu'), outcome: 'ok' })
          return json(res, 200, { ok: true })
        }
      }

      const a = /^\/api\/approval\/(\d+)$/.exec(p)
      if (req.method === 'POST' && a) {
        const b = await readBody(req)
        const id = Number(a[1])
        const info = host.activity.pendingList().find((x) => x.id === id)
        if (!info) return json(res, 404, { error: 'request already answered' })
        host.activity.answer(id, !!b.ok)
        host.activity.record({ kind: 'remote', from: dev.name, to: info.from, text: (b.ok ? tr('permitiu: ') : tr('negou: ')) + (info.text || info.kind), outcome: b.ok ? 'ok' : 'denied' })
        return json(res, 200, { ok: true })
      }

      if (req.method === 'POST' && p === '/api/interrupt-all') {
        host.interrupt()
        host.activity.record({ kind: 'remote', from: dev.name, to: '', text: tr('interrompeu todos os agentes'), outcome: 'ok' })
        return json(res, 200, { ok: true })
      }
    } catch (e) {
      return json(res, 400, { error: e.message })
    }
    json(res, 404, { error: 'not found' })
  }

  return {
    // allowHttp: also listen without TLS on wantedPort + 1 (opt-in, trusted networks only).
    async start(wantedPort, { allowHttp = false } = {}) {
      if (server) return this.status()
      const c = await cert()
      fingerprint = c.fingerprint
      const onReq = (req, res) => { handle(req, res).catch(() => { try { json(res, 500, { error: 'internal' }) } catch {} }) }
      server = https.createServer({ key: c.key, cert: c.cert }, onReq)
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(wantedPort, '0.0.0.0', resolve) })
      port = server.address().port
      if (allowHttp) {
        plain = http.createServer(onReq)
        await new Promise((resolve, reject) => { plain.once('error', reject); plain.listen(wantedPort ? wantedPort + 1 : 0, '0.0.0.0', resolve) })
        plainPort = plain.address().port
      }
      return this.status()
    },
    stop() {
      for (const s of [...streams]) s.close()
      pairing = null
      const all = [server, plain].filter(Boolean)
      server = plain = null
      plainPort = 0
      return Promise.all(all.map((s) => new Promise((r) => s.close(() => r()))))
    },
    // Called before pairing: if the Wi-Fi/IP changed since the server started, issue a certificate that covers the new address.
    async refreshCert() {
      if (!server) return
      const c = await cert()
      fingerprint = c.fingerprint
      server.setSecureContext({ key: c.key, cert: c.cert })
    },
    status: () => ({ listening: !!server, port, httpPort: plain ? plainPort : 0, addresses: lanAddresses(), fingerprint }),
    // One-time pairing code: shown as a QR code on the desktop.
    startPairing() {
      const token = rand(16)
      pairing = { hash: sha(token), expires: Date.now() + PAIR_TTL }
      return { token, expires: pairing.expires }
    },
    devices: () => devices.map(({ hash, ...d }) => d),
    revoke(id) {
      devices = devices.filter((d) => d.id !== id)
      saveDevices()
    },
  }
}

module.exports = { create, sha }
