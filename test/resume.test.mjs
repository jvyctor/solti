// A terminal that ran before resumes its conversation when the app reopens. The agent command is
// replaced by `echo`, so the typed command line is what we read back from the screen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(prof, port, body) {
  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 100 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) })
    const stat = () => ev(`document.querySelector('.thead .stat')?.textContent || ''`).then((r) => r.result.value)
    const screen = () => ev(`document.querySelector('.xterm-rows')?.textContent || ''`).then((r) => r.result.value)
    await body(screen, stat)
    await sleep(1200) // let the workspace autosave land
    cdp.close()
  } finally {
    treeKill(app)
    await sleep(500)
  }
}

test('first start assigns a session id; the next start resumes it', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-resume-'))
  const node = { id: 'n1', type: 'terminal', position: { x: 50, y: 50 }, style: { width: 700, height: 300 }, data: { name: 'x', preset: 'claude' } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [node], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ sendBriefing: false, commands: { claude: 'echo CMD' } }))

  await session(prof, 9390, async (screen, stat) => {
    for (let i = 0; i < 100 && !/--session-id/.test(await screen()); i++) await sleep(300)
    assert.match(await screen(), /CMD --session-id/)
    for (let i = 0; i < 100 && (await stat()) !== 'Ocioso'; i++) await sleep(300) // output settled at a plain prompt
    assert.equal(await stat(), 'Ocioso')
  })
  const sid = JSON.parse(readFileSync(join(prof, 'workspace.json'), 'utf8')).list[0].nodes[0].data.sid
  assert.match(sid, /^[0-9a-f-]{36}$/)

  await session(prof, 9391, async (screen) => {
    for (let i = 0; i < 100 && !new RegExp(`--resume ${sid}`).test(await screen()); i++) await sleep(300)
    assert.match(await screen(), new RegExp(`CMD --resume ${sid}`))
  })
})
