// Phone remote inside the real app: pair with the QR token, list terminals, type into a real shell, load the page and xterm.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

const call = (port, method, path, { cred, body } = {}) => new Promise((resolve, reject) => {
  const r = https.request({ host: '127.0.0.1', port, path, method, rejectUnauthorized: false, headers: { ...(cred ? { authorization: 'Bearer ' + cred } : {}), 'content-type': 'application/json' } }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString(), json: () => JSON.parse(Buffer.concat(chunks).toString()) }))
  })
  r.on('error', reject)
  r.end(body ? JSON.stringify(body) : '')
})

test('remote: pair, list, type into a real terminal', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-remapp-'))
  const term = { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 700, height: 260 }, data: { name: 'agente-x', preset: 'shell' } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'SAT', nodes: [term], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ remoteEnabled: true, remotePort: 0 }))
  const app = await launch(prof, 9450)
  try {
    await app.ready()
    const st = await app.ev(`window.api.remoteStatus()`)
    assert.equal(st.listening, true)
    assert.ok(st.port > 0 && st.fingerprint, 'listening with a certificate')

    const pair = await app.ev(`window.api.remotePair()`)
    if (pair.error) return console.log('skipped (no LAN interface on this machine):', pair.error)
    assert.match(pair.qr, /^data:image\/png/)
    const token = /#pair=([0-9a-f]+)/.exec(pair.urls[0])[1]

    const page = await call(st.port, 'GET', '/')
    assert.match(page.text, /Agent Canvas/)
    assert.ok((await call(st.port, 'GET', '/xterm.js')).text.length > 100000, 'real xterm bundle served')

    const r = await call(st.port, 'POST', '/api/pair', { body: { token, name: 'teste' } })
    assert.equal(r.status, 200)
    const cred = r.json().credential
    assert.equal((await app.ev(`window.api.remoteStatus()`)).devices.length, 1)

    const state = (await call(st.port, 'GET', '/api/state', { cred })).json()
    const t = state.terminals.find((x) => x.name === 'agente-x')
    assert.ok(t, 'terminal listed')
    assert.equal(t.wsName, 'SAT')
    assert.ok(t.cols > 10 && t.rows > 3)

    const out = join(prof, 'from-phone.txt')
    await call(st.port, 'POST', `/api/term/${t.id}/input`, { cred, body: { data: `'viaCelular' | Out-File -Encoding ascii '${out}'`, enter: true } })
    for (let i = 0; i < 40 && !existsSync(out); i++) await sleep(250)
    assert.match(readFileSync(out, 'utf8'), /viaCelular/)

    // revoking from the desktop cuts the phone off
    await app.ev(`window.api.remoteRevoke(${JSON.stringify(state.activity.length ? (await app.ev('window.api.remoteStatus()')).devices[0].id : '')})`)
    assert.equal((await call(st.port, 'GET', '/api/state', { cred })).status, 401)
  } finally {
    app.close()
  }
})
