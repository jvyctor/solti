// Ending a terminal ends its whole process tree; the error log and the diagnostics report.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const proc = req('../electron/proc.cjs')
const errlog = req('../electron/errlog.cjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

test('taskkill arguments: tree + force, one /PID per process, junk dropped', () => {
  assert.deepEqual(proc.taskkillArgs([12, 34]), ['/T', '/F', '/PID', '12', '/PID', '34'])
})

test('descendants from a ps listing: whole tree below the roots, nothing else, cycles safe', () => {
  const ps = ['1 0', '10 1', '11 10', '12 11', '13 11', '20 1', '21 20', '  30   12  ', 'garbage', '40 40'].join('\n')
  assert.deepEqual(proc.descendants(ps, [10]).sort((a, b) => a - b), [11, 12, 13, 30])
  assert.deepEqual(proc.descendants(ps, [20]), [21])
  assert.deepEqual(proc.descendants(ps, [99]), [])
  assert.deepEqual(proc.descendants(ps, [40]), [], 'a process listed as its own parent does not loop')
})

test('killTreesSync ends a shell, the command it runs in its own process group, and that command\'s child', { skip: process.platform === 'win32' && 'POSIX process groups' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-proc-'))
  const pidFile = join(dir, 'pids')
  // An interactive-like shell with job control (set -m): the background job gets its own process group,
  // like an agent CLI does in a real terminal, and starts a grandchild (its "MCP server").
  const shell = spawn('/bin/sh', ['-c', `set -m; sh -c 'sleep 300 & echo $$ $! > "${pidFile}"; wait' & wait`], { stdio: 'ignore', detached: true })
  let pids = []
  for (let i = 0; i < 60 && pids.length < 2; i++) { await sleep(100); try { pids = readFileSync(pidFile, 'utf8').trim().split(/\s+/).map(Number) } catch {} }
  assert.equal(pids.length, 2, 'job and grandchild started')
  assert.ok(pids.every(alive))
  proc.killTreesSync([shell.pid])
  await sleep(300)
  assert.equal(alive(shell.pid), false, 'shell ended')
  assert.deepEqual(pids.map(alive), [false, false], 'job and grandchild ended')
})

test('killTreesSync ends a process and the program it started', { skip: process.platform !== 'win32' && 'Windows process tree' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-proc-'))
  const pidFile = join(dir, 'child.pid')
  // A parent that starts a long-lived child (like an agent CLI starting an MCP server) and records its pid.
  // Plain Node on both levels: starts in milliseconds even on a slow CI machine (PowerShell can take many seconds).
  const keep = 'setInterval(() => {}, 1000)'
  const parentCode = `const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(keep)}], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); ${keep}`
  const parent = spawn(process.execPath, ['-e', parentCode], { stdio: 'ignore', windowsHide: true })
  let child = 0
  try {
    for (let i = 0; i < 200 && !child; i++) { await sleep(100); try { child = Number(readFileSync(pidFile, 'utf8').trim()) } catch {} }
    assert.ok(child > 0 && alive(child), 'child started')
    proc.killTreesSync([parent.pid, 0, 'x'])
    await sleep(500)
    assert.equal(alive(parent.pid), false, 'parent ended')
    assert.equal(alive(child), false, 'child ended with the tree')
  } finally {
    // Never leave processes behind: they would hold the test file open until its timeout.
    for (const p of [parent.pid, child]) if (p && alive(p)) try { execFileSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
})

test('node-pty spawn-helper without the execute bit is fixed (macOS/Linux "posix_spawnp failed")', { skip: process.platform === 'win32' && 'POSIX file modes' }, async () => {
  const { chmodSync, mkdirSync, statSync: st } = await import('node:fs')
  const fixPty = req('../build/fix-node-pty.cjs')
  const root = mkdtempSync(join(tmpdir(), 'ac-pty-'))
  mkdirSync(join(root, 'prebuilds', 'darwin-arm64'), { recursive: true })
  const f = join(root, 'prebuilds', 'darwin-arm64', 'spawn-helper')
  writeFileSync(f, '')
  chmodSync(f, 0o644)
  assert.deepEqual(fixPty.fix(root), [f])
  assert.equal(st(f).mode & 0o777, 0o755)
  assert.deepEqual(fixPty.fix(root), [], 'already executable: nothing to do')
})

test('error log rotates at 1 MB; the report has versions, agents and the recent log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-log-'))
  errlog.init(dir)
  errlog.write('uncaught', 'TypeError: Object has been destroyed\n    at main.cjs:289')
  assert.match(readFileSync(errlog.file(), 'utf8'), /\[uncaught\] TypeError: Object has been destroyed\n {4}    at main\.cjs:289/)
  writeFileSync(errlog.file(), 'x'.repeat(1024 * 1024 + 10))
  errlog.write('renderer', 'depois da rotação')
  assert.ok(statSync(errlog.file()).size < 1000)
  assert.ok(statSync(join(dir, 'logs', 'main.1.log')).size > 1024 * 1024)
  const r = errlog.report({ version: '9.9.9', electron: '44', diag: [{ label: 'Claude Code', installed: true, version: '3.0', authenticated: true, mcp: false }, { label: 'Codex', installed: false }], settings: { language: 'pt', approval: 'spawn' } })
  assert.match(r, /Agent Canvas 9\.9\.9/)
  assert.match(r, /Claude Code: instalado 3\.0, login sim, canvas não registrado/)
  assert.match(r, /Codex: não instalado/)
  assert.match(r, /depois da rotação/)
})
