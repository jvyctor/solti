// UI flow: right-click canvas -> Novo Terminal… -> pick a git folder -> terminal opens in its own worktree.
// Needs `npm run build` first. Drives the real app over CDP with real mouse/keyboard events.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sh = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim()

test('new terminal in a git folder gets an isolated worktree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-wt-'))
  const repo = join(root, 'proj')
  mkdirSync(repo)
  sh(repo, 'init', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-m', 'init')
  const prof = join(root, 'profile')
  mkdirSync(prof)
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [], edges: [] }], active: 'w1' }))

  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, '--remote-debugging-port=9380'], { stdio: 'ignore' })
  try {
    let page
    for (let i = 0; i < 40 && !page; i++) {
      await sleep(500)
      try { page = (await (await fetch('http://127.0.0.1:9380/json')).json()).find((t) => t.type === 'page') } catch {}
    }
    assert.ok(page, 'app window did not open')
    const cdp = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (cdp.onopen = r))
    let n = 0
    const pending = {}
    cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
    const send = (method, params) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method, params })) })
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value
    let at = { x: 0, y: 0 }
    const mouse = async (x, y, button = 'left') => {
      // Walk there in steps: Radix submenus close if the pointer jumps across other items.
      for (let s = 1; s <= 8; s++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + ((x - at.x) * s) / 8, y: at.y + ((y - at.y) * s) / 8 })
      at = { x, y }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 })
    }
    // Centre of the first element whose text matches.
    const where = (sel, text) => ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    const clickText = async (sel, text) => {
      let p
      for (let i = 0; i < 20 && !(p = await where(sel, text)); i++) await sleep(150)
      assert.ok(p, `not found: ${text}`)
      await mouse(p.x, p.y)
      await sleep(200)
    }

    await sleep(1500)
    await mouse(700, 500, 'right') // empty canvas
    await sleep(300)
    await clickText('.mi', 'Adicionar')
    await clickText('.mi', 'Terminal')
    await clickText('.mi', 'Novo Terminal')
    await sleep(300)
    await ev(`document.querySelector('.dlg input[placeholder*="projetos"]').focus()`)
    await send('Input.insertText', { text: repo })
    await ev(`document.querySelector('.dlg input[placeholder*="projetos"]').blur()`)
    for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('.dlg label.check input')`)); i++) await sleep(200)
    assert.equal(await ev(`document.querySelector('.dlg label.check input')?.checked`), true, 'worktree on by default: ' + (await ev(`document.querySelector('.dlg')?.innerText + ' / ' + document.querySelector('.dlg input[placeholder*="projetos"]')?.value`)))
    await clickText('.dlg-actions button', 'Criar')
    for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('.tfoot .branch')`)); i++) await sleep(250)
    const branch = await ev(`document.querySelector('.tfoot .branch')?.textContent.trim()`)
    assert.match(branch, /canvas\//)
    const folder = join(root, '.canvas-worktrees')
    assert.ok(existsSync(folder), 'worktree folder created next to the repo')
    assert.match(sh(repo, 'worktree', 'list'), /canvas-worktrees/)
    cdp.close()
  } finally {
    app.kill()
  }
})
