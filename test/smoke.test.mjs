// Cross-platform smoke test (Windows, macOS, Linux — CI runs it on all three): the built app opens, a terminal
// starts the system shell, the `canvas` CLI inside it reaches the app, and quitting ends the shell's processes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
// Windows PowerShell's `>` writes UTF-16 with a BOM; POSIX shells write UTF-8.
const readText = (f) => {
  const b = readFileSync(f)
  return (b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString('utf16le') : b.toString('utf8')).replace(/^﻿/, '')
}

test('app opens, the shell runs `canvas`, quitting ends the terminal\'s processes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-smoke-'))
  const prof = join(root, 'profile')
  const nodes = [
    { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 640, height: 300 }, data: { name: 'sh', preset: 'shell' } },
    { id: 'n1', type: 'note', position: { x: 0, y: 340 }, style: { width: 240, height: 160 }, data: { text: 'nota-de-fumaça' } },
  ]
  mkdirSync(prof)
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [{ id: 'e', source: 't1', target: 'n1', type: 'floating' }] }], active: 'w1' }))
  const app = await launch(prof)
  try {
    // Any prompt will do (PowerShell, bash, zsh): wait for the shell's first output, then a moment for it to settle.
    await app.until(`(document.querySelector('.xterm-rows')?.textContent || '').trim().length > 0`, 'shell output', 200)
    await sleep(2500)
    const out = join(root, 'peers.txt').replace(/\\/g, '/')
    const pidFile = join(root, 'shell.pid').replace(/\\/g, '/')
    // `>` works in PowerShell, bash and zsh alike; $PID (PowerShell) / $$ (POSIX) is the shell's own pid.
    const cmd = process.platform === 'win32' ? `canvas peers > '${out}'; $PID > '${pidFile}'` : `canvas peers > '${out}'; echo $$ > '${pidFile}'`
    await app.ev(`window.api.write('t1', ${JSON.stringify(cmd)})`)
    await sleep(500)
    await app.ev(`window.api.write('t1', '\\r')`)
    let text = ''
    for (let i = 0; i < 80 && !/nota-n1/.test(text); i++) { await sleep(250); try { text = readText(out) } catch {} }
    assert.match(text, /nota-n1 \[note\]/, 'canvas CLI reached the app and listed the roped note')
    let shellPid = 0
    for (let i = 0; i < 40 && !shellPid; i++) { await sleep(100); try { shellPid = Number(readText(pidFile).trim()) } catch {} }
    assert.ok(shellPid > 0 && alive(shellPid), 'shell running')
    // Quit from the page (window.close -> window-all-closed -> killAll) and check the shell is gone.
    app.ev('window.close()').catch(() => {}) // no answer comes back from a page that closes
    for (let i = 0; i < 40 && alive(shellPid); i++) await sleep(250)
    assert.equal(alive(shellPid), false, 'quitting ended the terminal')
    assert.ok(existsSync(join(prof, 'workspace.json')))
  } finally {
    app.close()
  }
})
