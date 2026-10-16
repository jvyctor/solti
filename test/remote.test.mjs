// Phone remote server against a fake host: pairing, auth, permissions, approvals, streaming, rate limit, revocation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const { create } = req('../electron/remote.cjs')
const activity = req('../electron/activity.cjs')

function call(port, method, path, { cred, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw ?? (body ? JSON.stringify(body) : '')
    const r = https.request({ host: '127.0.0.1', port, path, method, rejectUnauthorized: false, headers: { ...(cred ? { authorization: 'Bearer ' + cred } : {}), 'content-type': 'application/json' } }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve({ status: res.statusCode, body: b, json: () => JSON.parse(b) }))
    })
    r.on('error', reject)
    r.end(data)
  })
}

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ac-remote-'))
  activity.init(dir, () => {})
  const writes = []
  const outputs = new Set()
  const interrupted = []
  const host = {
    terminals: () => [{ id: 't1', name: 'dev', wsName: 'SAT', cols: 100, rows: 30, last: Date.now() }],
    buffer: () => 'hello',
    write: (id, data, enter) => writes.push({ id, data, enter }),
    onOutput: (cb) => { outputs.add(cb); return () => outputs.delete(cb) },
    interrupt: (id) => interrupted.push(id ?? 'all'),
    activity,
    assets: { html: '<h1>page</h1>', xtermJs: 'x', xtermCss: 'c' },
  }
  const srv = create({ dir, host, version: '9.9.9' })
  const { port } = await srv.start(0)
  const pair = async (name = 'phone') => {
    const { token } = srv.startPairing()
    const r = await call(port, 'POST', '/api/pair', { body: { token, name } })
    return { r, token }
  }
  return { dir, srv, port, writes, outputs, interrupted, pair }
}

test('page and assets are public; the API is not', async () => {
  const t = await setup()
  try {
    assert.equal((await call(t.port, 'GET', '/')).body, '<h1>page</h1>')
    assert.equal((await call(t.port, 'GET', '/api/state')).status, 401)
    assert.equal((await call(t.port, 'GET', '/api/state', { cred: 'a'.repeat(64) })).status, 401)
    assert.equal((await call(t.port, 'GET', '/api/state', { cred: 'not-hex' })).status, 401)
  } finally { await t.srv.stop() }
})

test('pairing is single use, the credential is stored hashed, and it works', async () => {
  const t = await setup()
  try {
    assert.equal((await call(t.port, 'POST', '/api/pair', { body: { token: 'nope' } })).status, 401) // no pairing started
    const { r, token } = await t.pair('meu celular')
    assert.equal(r.status, 200)
    const cred = r.json().credential
    assert.match(cred, /^[0-9a-f]{64}$/)
    assert.equal((await call(t.port, 'POST', '/api/pair', { body: { token } })).status, 401) // reused
    assert.ok(!readFileSync(join(t.dir, 'devices.json'), 'utf8').includes(cred), 'credential must not be stored in clear')
    const s = (await call(t.port, 'GET', '/api/state', { cred })).json()
    assert.equal(s.version, '9.9.9')
    assert.equal(s.terminals[0].name, 'dev')
    assert.equal(t.srv.devices()[0].name, 'meu celular')
    assert.equal(t.srv.devices()[0].hash, undefined)
  } finally { await t.srv.stop() }
})

test('input, interrupt and approvals work; unknown terminals and oversized input do not', async () => {
  const t = await setup()
  try {
    const cred = (await t.pair()).r.json().credential
    assert.equal((await call(t.port, 'POST', '/api/term/t1/input', { cred, body: { data: 'ls', enter: true } })).status, 200)
    assert.deepEqual(t.writes, [{ id: 't1', data: 'ls', enter: true }])
    assert.equal((await call(t.port, 'POST', '/api/term/zz/input', { cred, body: { data: 'x' } })).status, 404)
    assert.equal((await call(t.port, 'POST', '/api/term/t1/input', { cred, body: { data: 'x'.repeat(5000) } })).status, 400)
    await assert.rejects(call(t.port, 'POST', '/api/term/t1/input', { cred, raw: 'y'.repeat(200000) })) // a huge body gets the connection cut
    await call(t.port, 'POST', '/api/term/t1/interrupt', { cred })
    await call(t.port, 'POST', '/api/interrupt-all', { cred })
    assert.deepEqual(t.interrupted, ['t1', 'all'])

    const asked = activity.request({ kind: 'spawn', from: 'maestro', to: 'x', text: 'criar x' })
    const pending = (await call(t.port, 'GET', '/api/state', { cred })).json().approvals
    assert.equal(pending.length, 1)
    assert.equal((await call(t.port, 'POST', `/api/approval/${pending[0].id}`, { cred, body: { ok: true } })).status, 200)
    assert.equal(await asked, true)
    assert.equal((await call(t.port, 'POST', `/api/approval/${pending[0].id}`, { cred, body: { ok: false } })).status, 404) // already answered
    assert.ok(activity.list().some((e) => e.kind === 'remote' && /permitiu/.test(e.text)), 'phone actions are logged')
    // nothing outside the whitelist exists
    for (const p of ['/api/settings', '/api/spawn', '/api/term/t1/kill']) assert.equal((await call(t.port, 'POST', p, { cred })).status, 404, p)
  } finally { await t.srv.stop() }
})

test('terminal stream sends the buffer, then live output', async () => {
  const t = await setup()
  try {
    const cred = (await t.pair()).r.json().credential
    const got = []
    await new Promise((resolve, reject) => {
      const r = https.request({ host: '127.0.0.1', port: t.port, path: '/api/term/t1/stream', rejectUnauthorized: false, headers: { authorization: 'Bearer ' + cred } }, (res) => {
        res.on('data', (c) => {
          for (const part of String(c).split('\n\n').filter(Boolean)) got.push(JSON.parse(part.replace(/^data: /, '')))
          if (got.length === 1) [...t.outputs].forEach((cb) => cb('t1', 'live!'))
          if (got.length === 2) { r.destroy(); resolve() }
        })
      })
      r.on('error', (e) => (e.code === 'ECONNRESET' ? resolve() : reject(e)))
      r.end()
    })
    assert.equal(got[0].type, 'init')
    assert.equal(Buffer.from(got[0].data, 'base64').toString(), 'hello')
    assert.equal(got[0].cols, 100)
    assert.equal(Buffer.from(got[1].data, 'base64').toString(), 'live!')
  } finally { await t.srv.stop() }
})

test('revoked devices lose access; repeated failures get the address blocked', async () => {
  const t = await setup()
  try {
    const { r } = await t.pair()
    const cred = r.json().credential
    t.srv.revoke(t.srv.devices()[0].id)
    assert.equal((await call(t.port, 'GET', '/api/state', { cred })).status, 401)
    let last
    for (let i = 0; i < 12; i++) last = await call(t.port, 'GET', '/api/state', { cred: 'b'.repeat(64) })
    assert.equal(last.status, 429)
    const fresh = await t.pair() // even a valid pairing is refused while blocked
    assert.equal(fresh.r.status, 429)
  } finally { await t.srv.stop() }
})
