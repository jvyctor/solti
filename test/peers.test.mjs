// An agent can see and read everything roped to it: notes, portals (live page text), file trees.
// Uses the real `canvas` CLI inside a real terminal. Needs `npm run build`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { freePort, prepareProfile, treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('canvas peers/read cover notes, portals and file trees', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-peers-'))
  const prof = join(root, 'profile')
  const folder = join(root, 'proj')
  mkdirSync(prof)
  mkdirSync(folder)
  writeFileSync(join(folder, 'hello.txt'), 'x')
  const page = 'data:text/html,<title>Titulo-X</title><p>conteudo-do-portal</p>'
  const nodes = [
    { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 700, height: 260 }, data: { name: 'ag', preset: 'shell' } },
    { id: 'n1', type: 'note', position: { x: 0, y: 300 }, style: { width: 240, height: 160 }, data: { text: 'segredo-123' } },
    { id: 'p1', type: 'portal', position: { x: 760, y: 0 }, style: { width: 400, height: 300 }, data: { url: page } },
    { id: 'f1', type: 'files', position: { x: 760, y: 340 }, style: { width: 260, height: 200 }, data: { path: folder } },
  ]
  const edges = ['n1', 'p1', 'f1'].map((t) => ({ id: 'e' + t, source: 't1', target: t, type: 'floating' }))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges }], active: 'w1' }))

  prepareProfile(prof)

  const dbgPort = await freePort()
  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, `--remote-debugging-port=${dbgPort}`], { stdio: 'ignore' })
  try {
    let pg
    for (let i = 0; i < 40 && !pg; i++) {
      await sleep(500)
      try { pg = (await (await fetch(`http://127.0.0.1:${dbgPort}/json`, { signal: AbortSignal.timeout(2000) })).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(pg, 'app window did not open')
    const cdp = new WebSocket(pg.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) }).then((r) => r.result.value)
    // Runs a canvas command in the terminal and returns what it printed (via a file; Enter sent apart from the text).
    let k = 0
    const run = async (cmd) => {
      const out = join(root, `out${k++}.txt`)
      await ev(`window.api.write('t1', ${JSON.stringify(`${cmd} | Out-File -Encoding utf8 '${out}'`)})`)
      await sleep(500)
      await ev(`window.api.write('t1', '\\r')`)
      for (let i = 0; i < 40 && !existsSync(out); i++) await sleep(250)
      await sleep(300)
      return readFileSync(out, 'utf8')
    }

    await sleep(6000) // shell, graph registered, webview loaded
    const peers = await run('canvas peers')
    assert.match(peers, /nota-n1 \[note\]/)
    assert.match(peers, /portal-p1 \[portal\]/)
    assert.match(peers, /arquivos-f1 \[files\]/)

    assert.match(await run('canvas read nota-n1'), /segredo-123/)
    const portal = await run('canvas read portal-p1')
    assert.match(portal, /conteudo-do-portal/)
    assert.match(portal, /Titulo-X/)
    assert.match(await run('canvas read arquivos-f1'), /hello\.txt/)
    cdp.close()
  } finally {
    treeKill(app)
  }
})
