// Token badge: a Claude agent's usage is read from its session log (fake HOME) and flagged when over the limit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'
import { prepareProfile, treeKill } from './helpers.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('token badge shows usage and turns red over the limit', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-tok-'))
  const prof = join(home, 'profile')
  mkdirSync(prof)
  const sid = '11111111-2222-3333-4444-555555555555'
  mkdirSync(join(home, '.claude', 'projects', 'C--x'), { recursive: true })
  writeFileSync(join(home, '.claude', 'projects', 'C--x', sid + '.jsonl'), JSON.stringify({ message: { id: 'm1', usage: { input_tokens: 10, cache_creation_input_tokens: 4000, output_tokens: 990 } } }) + '\n')
  const node = { id: 'n1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 600, height: 300 }, data: { name: 'x', preset: 'claude', sid, ran: true } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [node], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ sendBriefing: false, tokenLimit: 1000, commands: { claude: 'echo CMD' } }))

  prepareProfile(prof)

  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, '--remote-debugging-port=9398'], { stdio: 'ignore', env: { ...process.env, USERPROFILE: home, HOME: home } })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch('http://127.0.0.1:9398/json')).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) }).then((r) => r.result.value)
    let text = ''
    for (let i = 0; i < 40 && !text; i++) { await sleep(250); text = await ev(`document.querySelector('.thead .tok')?.textContent || ''`) }
    assert.equal(text, '5k tok')
    assert.equal(await ev(`document.querySelector('.thead .tok').classList.contains('over')`), true)
    cdp.close()
  } finally {
    treeKill(app)
  }
})
