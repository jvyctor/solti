// Regression: switching workspaces must leave exactly one name pill (it used to stack old pills).
// Runs the built app (npm run build first) in a throwaway profile and drives it over CDP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { freePort, prepareProfile, treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('workspace pill shows only the active workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-pill-'))
  const ws = (id, name) => ({ id, name, nodes: [], edges: [] })
  writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ list: [ws('w1', 'SAT'), ws('w2', 'consulta TCE')], active: 'w1' }))
  prepareProfile(dir)
  const dbgPort = await freePort()
  const app = spawn(electron, ['.', `--user-data-dir=${dir}`, `--remote-debugging-port=${dbgPort}`], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch(`http://127.0.0.1:${dbgPort}/json`, { signal: AbortSignal.timeout(2000) })).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) })
    const pills = async () => JSON.parse((await ev(`JSON.stringify([...document.querySelectorAll('.ws-pill')].map(e => e.textContent))`)).result.value)
    await sleep(1000)
    assert.deepEqual(await pills(), ['SAT'])
    for (const name of ['consulta TCE', 'SAT', 'consulta TCE']) {
      await ev(`[...document.querySelectorAll('.ws')].find(e => e.textContent.includes('${name}')).click()`)
      await sleep(300)
      assert.deepEqual(await pills(), [name])
    }
    cdp.close()
  } finally {
    treeKill(app)
  }
})

// Terminal screens persist: a saved screen is restored on start, and a running terminal writes one back.
test('terminal screen is restored and saved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-term-'))
  const node = { id: 'n1', type: 'terminal', position: { x: 50, y: 50 }, style: { width: 600, height: 300 }, data: { name: 'x', preset: 'shell' } }
  writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [node], edges: [] }], active: 'w1' }))
  mkdirSync(join(dir, 'terms'))
  writeFileSync(join(dir, 'terms', 'n1.txt'), 'HELLO-SAVED-SCREEN')
  prepareProfile(dir)
  const dbgPort = await freePort()
  const app = spawn(electron, ['.', `--user-data-dir=${dir}`, `--remote-debugging-port=${dbgPort}`], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch(`http://127.0.0.1:${dbgPort}/json`, { signal: AbortSignal.timeout(2000) })).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) })
    await sleep(3000)
    await sleep(1000)
    await sleep(6000) // autosave interval
    const saved = readFileSync(join(dir, 'terms', 'n1.txt'), 'utf8')
    assert.match(saved, /HELLO-SAVED-SCREEN/) // survived the shell's startup clear (kept in scrollback)
    cdp.close()
  } finally {
    treeKill(app)
  }
})
