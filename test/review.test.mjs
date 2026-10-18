// Diff node, end to end with a real repository: two agents in worktrees change the same file -> conflict warning;
// a line comment is written and sent -> it is typed into the agent's terminal with file:line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('review comments reach the agent and overlapping worktrees are flagged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-review-'))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  const git = (args, cwd = repo) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  writeFileSync(join(repo, 'app.txt'), 'one\ntwo\nthree\n')
  git(['add', '.'])
  git(['commit', '-qm', 'base'])
  const wt = (name) => {
    const dir = join(root, name)
    git(['worktree', 'add', '-q', '-b', `canvas/${name}`, dir, 'main'])
    writeFileSync(join(dir, 'app.txt'), `one\ntwo changed by ${name}\nthree\n`)
    return dir
  }
  const a = wt('dev'), b = wt('rev')
  const term = (id, name, cwd, x) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 520, height: 280 }, data: { name, preset: 'shell', cwd, git: { repo, branch: `canvas/${name}`, base: 'main', worktree: true } } })
  const prof = mkdtempSync(join(tmpdir(), 'ac-review-prof-'))
  const nodes = [term('a', 'dev', a, 0), term('b', 'rev', b, 600), { id: 'd', type: 'diff', position: { x: 0, y: 340 }, style: { width: 640, height: 420 }, data: {} }]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w', name: 'W', nodes, edges: [{ id: 'e', source: 'a', target: 'd', type: 'floating' }] }], active: 'w' }))
  const app = await launch(prof)
  try {
    await app.until(`!!document.querySelector('.diff-conflict')`, 'conflict banner', 120)
    assert.match(await app.ev(`document.querySelector('.diff-conflict').textContent`), /rev.*app\.txt/)
    assert.ok(await app.ev(`!!document.querySelector('.diff-files li.clash')`))
    await app.ev(`document.querySelector('.diff-files li.clash').click()`)
    await app.until(`[...document.querySelectorAll('.dl.add')].length > 0`, 'patch lines')
    await app.ev(`document.querySelector('.dl.add').click()`)
    await app.until(`!!document.querySelector('.dl-draft textarea')`, 'comment box')
    // React-controlled textarea: set the value through the native setter so onChange fires.
    await app.ev(`(() => { const t = document.querySelector('.dl-draft textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'say why it changed'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await app.ev(`document.querySelector('.dl-draft .primary').click()`)
    await app.until(`!!document.querySelector('.dl-comment')`, 'saved comment')
    assert.equal(await app.ev(`document.querySelector('.diff-count').textContent`), '1')
    await app.ready()
    await app.ev(`[...document.querySelectorAll('.diff-review button')].find(b => b.classList.contains('primary')).click()`)
    await app.until(`(document.querySelector('.react-flow__node[data-id="a"] .xterm-rows')?.textContent || '').includes('app.txt:2')`, 'comment typed into the agent', 60)
    assert.ok(!(await app.ev(`!!document.querySelector('.dl-comment')`)), 'comments cleared after sending')
  } finally {
    app.close()
    await sleep(500)
  }
})
