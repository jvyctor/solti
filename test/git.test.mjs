// Worktree helpers against throwaway repos (no network, no Electron).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const g = createRequire(import.meta.url)('../electron/git.cjs')
const sh = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).trim()

function makeRepo() {
  const dir = join(mkdtempSync(join(tmpdir(), 'ac-git-')), 'proj')
  mkdirSync(dir)
  sh(dir, 'init', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'a')
  sh(dir, 'add', '.')
  sh(dir, 'commit', '-m', 'init')
  sh(dir, 'branch', 'dev')
  return dir
}

test('info: repo vs plain folder', async () => {
  const repo = makeRepo()
  const i = await g.info(repo)
  assert.equal(i.isRepo, true)
  assert.equal(i.branch, 'main')
  assert.deepEqual(i.branches.sort(), ['dev', 'main'])
  assert.equal((await g.info(mkdtempSync(join(tmpdir(), 'ac-plain-')))).isRepo, false)
})

test('prepare: each agent gets its own worktree and branch from the base', async () => {
  const repo = makeRepo()
  const a = await g.prepare({ dir: repo, base: 'dev', isolate: true, agent: 'veloz-falcao' })
  const b = await g.prepare({ dir: repo, base: 'dev', isolate: true, agent: 'calmo-lince' })
  assert.notEqual(a.cwd, b.cwd)
  assert.equal(a.git.branch, 'canvas/veloz-falcao')
  assert.ok(existsSync(join(a.cwd, 'a.txt')))
  assert.equal(sh(a.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), 'canvas/veloz-falcao')
  // same agent again (app restart) reuses the folder
  assert.equal((await g.prepare({ dir: repo, base: 'dev', isolate: true, agent: 'veloz-falcao' })).cwd, a.cwd)
})

test('prepare without isolation checks out the chosen branch in place', async () => {
  const repo = makeRepo()
  const r = await g.prepare({ dir: repo, base: 'dev', isolate: false, agent: 'x' })
  assert.equal(realpathSync.native(r.cwd).toLowerCase(), realpathSync.native(repo).toLowerCase())
  assert.equal(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'dev')
  assert.equal(r.git.worktree, false)
})

test('removeWorktree: keeps dirty folders, removes clean ones, branch survives', async () => {
  const repo = makeRepo()
  const w = await g.prepare({ dir: repo, isolate: true, agent: 'rm-me' })
  writeFileSync(join(w.cwd, 'new.txt'), 'x')
  assert.deepEqual(await g.removeWorktree(w.cwd), { removed: false, reason: 'dirty' })
  assert.ok(existsSync(w.cwd))
  sh(w.cwd, 'add', '.')
  sh(w.cwd, 'commit', '-m', 'work')
  assert.deepEqual(await g.removeWorktree(w.cwd), { removed: true })
  assert.ok(!existsSync(w.cwd))
  assert.match(sh(repo, 'branch', '--list', 'canvas/rm-me'), /canvas\/rm-me/)
})

test('clone: first time clones, second time reuses; lists remote branches', async () => {
  const origin = makeRepo()
  const dest = mkdtempSync(join(tmpdir(), 'ac-clone-'))
  assert.deepEqual((await g.remoteBranches(origin)).sort(), ['dev', 'main'])
  const c1 = await g.clone(origin, dest)
  assert.ok(existsSync(join(c1, 'a.txt')))
  assert.equal(await g.clone(origin, dest), c1)
  const w = await g.prepare({ url: origin, dest, base: 'dev', isolate: true, agent: 'cloned' })
  assert.equal(w.git.base, 'dev')
  assert.ok(existsSync(join(w.cwd, 'a.txt')))
})
