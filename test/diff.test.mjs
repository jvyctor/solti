// Review node: roped to an agent's worktree it lists changes, commits on Aprovar and merges back. Needs `npm run build`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import electron from 'electron'
import { treeKill } from './helpers.mjs'

const g = createRequire(import.meta.url)('../electron/git.cjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sh = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim()

test('diff node shows changes, approves and merges', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-diff-'))
  const repo = join(root, 'proj')
  mkdirSync(repo)
  sh(repo, 'init', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-m', 'init')
  const w = await g.prepare({ dir: repo, base: 'main', isolate: true, agent: 'rev' })
  writeFileSync(join(w.cwd, 'feature.txt'), 'hello from agent')

  const prof = join(root, 'profile')
  mkdirSync(prof)
  const term = { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 400, height: 260 }, data: { name: 'rev', preset: 'shell', cwd: w.cwd, git: w.git, sid: 's', ran: true } }
  const diff = { id: 'd1', type: 'diff', position: { x: 450, y: 0 }, style: { width: 560, height: 400 }, data: {} }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [term, diff], edges: [{ id: 'e1', source: 't1', target: 'd1', type: 'floating' }] }], active: 'w1' }))

  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, '--remote-debugging-port=9395'], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch('http://127.0.0.1:9395/json')).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const ev = (expression) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) }).then((r) => r.result.value)
    const until = async (expr, what) => { for (let i = 0; i < 40; i++) { if (await ev(expr)) return; await sleep(250) } assert.fail('timeout: ' + what) }
    const clickBtn = (text) => ev(`[...document.querySelectorAll('.diff-foot button')].find(b => b.textContent.startsWith(${JSON.stringify(text)}))?.click()`)

    await until(`document.querySelector('.diff-files li')?.textContent.includes('feature.txt')`, 'file list')
    await ev(`document.querySelector('.diff-files li').click()`)
    await until(`document.querySelector('.diff-patch')?.textContent.includes('hello from agent')`, 'patch text')

    await clickBtn('Aprovar')
    await until(`document.querySelector('.diff-foot .ok')?.textContent.includes('commit')`, 'commit note')
    assert.match(sh(w.cwd, 'log', '--oneline'), /Alterações do agente/)

    await clickBtn('Merge')
    await until(`document.querySelector('.diff-foot .ok')?.textContent.includes('Merge')`, 'merge note')
    assert.equal(sh(repo, 'show', 'main:feature.txt'), 'hello from agent')
    cdp.close()
  } finally {
    treeKill(app)
  }
})
