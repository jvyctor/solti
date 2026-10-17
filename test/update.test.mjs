// Update flow against a local fake feed (AC_UPDATE_URL): toast -> download -> "install" button.
// The fake installer is never executed. Needs `npm run build` first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { prepareProfile, treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(version, port, body) {
  const exe = Buffer.alloc(2_000_000, 7)
  const yml = `version: ${version}\nfiles:\n  - url: fake.exe\n    sha512: ${createHash('sha512').update(exe).digest('base64')}\n    size: ${exe.length}\npath: fake.exe\nsha512: ${createHash('sha512').update(exe).digest('base64')}\nreleaseDate: '2026-01-01T00:00:00.000Z'\nreleaseNotes: 'Notas de teste'\n`
  const feed = createServer((req, res) => {
    if (req.url.startsWith('/latest.yml')) return res.end(yml)
    if (req.url.startsWith('/fake.exe')) return res.end(exe)
    res.statusCode = 404; res.end()
  })
  await new Promise((r) => feed.listen(0, '127.0.0.1', r))
  const dir = mkdtempSync(join(tmpdir(), 'ac-upd-'))
  writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [], edges: [] }], active: 'w1' }))
  prepareProfile(dir)
  const app = spawn(electron, ['.', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', env: { ...process.env, AC_UPDATE_URL: `http://127.0.0.1:${feed.address().port}` } })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })) })
    const until = async (expr, ms = 15000) => {
      for (let t = 0; t < ms; t += 250) { if ((await ev(expr)).result.value) return true; await sleep(250) }
      return false
    }
    await body({ ev, until })
    cdp.close()
  } finally {
    treeKill(app)
    feed.close()
  }
}

test('new version: toast, download, install button', async () => {
  await run('9.9.9', 9340, async ({ ev, until }) => {
    assert.ok(await until(`document.querySelector('.toast')?.textContent.includes('9.9.9')`), 'toast with version did not appear')
    await ev(`document.querySelector('.toast-main').click()`)
    const ok = await until(`[...document.querySelectorAll('.dlg.upd button')].some(b => b.textContent === 'Instalar e reiniciar')`)
    assert.ok(ok, 'download did not finish: ' + (await ev(`window.api.updateState().then(s => JSON.stringify(s))`)).result.value)
  })
})

test('same version: no toast', async () => {
  await run('0.1.0', 9341, async ({ ev, until }) => {
    await sleep(6000) // let the startup check finish
    assert.equal((await ev(`!!document.querySelector('.toast')`)).result.value, false)
  })
})
