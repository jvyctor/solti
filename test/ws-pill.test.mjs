// Regression: switching workspaces must leave exactly one name pill (it used to stack old pills).
// Runs the built app (npm run build first) in a throwaway profile and drives it over CDP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('workspace pill shows only the active workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-pill-'))
  const ws = (id, name) => ({ id, name, nodes: [], edges: [] })
  writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ list: [ws('w1', 'SAT'), ws('w2', 'consulta TCE')], active: 'w1' }))
  const app = spawn(electron, ['.', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page') } catch {}
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
    app.kill()
  }
})
