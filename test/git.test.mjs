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

test('review: changes, patch, commit and merge back into the base', async () => {
  const repo = makeRepo()
  const w = await g.prepare({ dir: repo, base: 'main', isolate: true, agent: 'reviewer' })
  writeFileSync(join(w.cwd, 'a.txt'), 'changed')
  writeFileSync(join(w.cwd, 'b.txt'), 'brand new')
  const files = await g.changes(w.cwd, 'main')
  assert.deepEqual(files.map((f) => f.status + f.file).sort(), ['Ma.txt', 'Nb.txt'])
  assert.match(await g.patch(w.cwd, 'main', 'a.txt', false), /\+changed/)
  assert.match(await g.patch(w.cwd, 'main', 'b.txt', true), /\+brand new/)

  assert.deepEqual(await g.commit(w.cwd, 'agent work'), { committed: true })
  assert.deepEqual(await g.commit(w.cwd, 'nothing left'), { committed: false })
  assert.equal((await g.changes(w.cwd, 'main')).length, 2) // committed changes still show against the base

  assert.deepEqual(await g.merge(repo, 'main', w.git.branch), { merged: true })
  assert.equal(sh(repo, 'show', 'main:a.txt'), 'changed')
})

test('merge refuses a dirty main checkout and aborts on conflict', async () => {
  const repo = makeRepo()
  const w = await g.prepare({ dir: repo, base: 'main', isolate: true, agent: 'conflict' })
  writeFileSync(join(w.cwd, 'a.txt'), 'from agent')
  await g.commit(w.cwd, 'agent edit')
  writeFileSync(join(repo, 'a.txt'), 'dirty main')
  await assert.rejects(g.merge(repo, 'main', w.git.branch), /alterações não salvas/)
  sh(repo, 'commit', '-am', 'main edit') // now clean, but both sides changed a.txt
  await assert.rejects(g.merge(repo, 'main', w.git.branch), /Conflitos/)
  assert.equal(sh(repo, 'status', '--porcelain'), '') // aborted cleanly
})

test('pushForPr builds the GitHub compare URL', async () => {
  const bare = join(mkdtempSync(join(tmpdir(), 'ac-bare-')), 'r.git')
  sh(tmpdir(), 'init', '--bare', '-b', 'main', bare)
  const repo = makeRepo()
  sh(repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git')
  sh(repo, 'remote', 'set-url', '--push', 'origin', bare) // push goes to the local bare repo
  sh(repo, 'branch', 'canvas/x')
  const r = await g.pushForPr(repo, 'main', 'canvas/x')
  assert.equal(r.url, 'https://github.com/o/r/compare/main...canvas%2Fx?expand=1')
})
