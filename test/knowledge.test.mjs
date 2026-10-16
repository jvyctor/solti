// Shared knowledge: an agent's `canvas remember` lands in the workspace's Conhecimento node and `canvas knowledge` reads it back.
// Uses the real CLI inside a real terminal. Needs `npm run build`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('canvas remember / knowledge round trip', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-know-'))
  const term = { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 800, height: 300 }, data: { name: 'ag', preset: 'shell' } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [term], edges: [] }], active: 'w1' }))

  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, '--remote-debugging-port=9396'], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch('http://127.0.0.1:9396/json')).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) }).then((r) => r.result.value)
    const until = async (expr, what, tries = 60) => { for (let i = 0; i < tries; i++) { if (await ev(expr)) return; await sleep(250) } assert.fail('timeout: ' + what + ' :: ' + await ev(`document.querySelector('.xterm-rows')?.textContent.slice(-300)`)) }

    await sleep(7000) // shell up, graph registered with the bridge
    await ev(`window.api.write('t1', 'canvas remember Usamos pnpm no projeto\\r')`)
    await until(`document.querySelector('.note.knowledge textarea')?.value.includes('Usamos pnpm')`, 'knowledge node filled')

    // Read back through the CLI into a file (the terminal screen is not a reliable place to assert on).
    const out = join(prof, 'out.txt')
    await ev(`window.api.write('t1', ${JSON.stringify(`canvas knowledge | Out-File -Encoding utf8 '${out}'`)})`)
    await sleep(500) // Enter apart from the text, or PSReadLine treats the burst as a paste
    await ev(`window.api.write('t1', '\\r')`)
    for (let i = 0; i < 40 && !existsSync(out); i++) await sleep(250)
    assert.match(readFileSync(out, 'utf8'), /- Usamos pnpm no projeto/)
    cdp.close()
  } finally {
    treeKill(app)
  }
})
