// Shared by the UI tests: start the built app in a throwaway profile and talk to it over CDP.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

// electron.exe leaves renderer/GPU children behind a plain kill(); they slow down the next launch.
export function treeKill(app) {
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { app.kill() }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch(prof, port, { onboarded = true } = {}) {
  // The first-run welcome would cover the UI in every test: mark it as seen unless a test wants it.
  const sf = join(prof, 'settings.json')
  let s = {}
  try { s = JSON.parse(readFileSync(sf, 'utf8')) } catch {}
  if (onboarded && s.onboarded === undefined) writeFileSync(sf, JSON.stringify({ ...s, onboarded: true }))
  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`], { stdio: 'ignore' })
  let page
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500)
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
  }
  if (!page) { app.kill(); throw new Error('app window did not open') }
  const cdp = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (cdp.onopen = r))
  let n = 0
  const pending = {}
  cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
  const send = (method, params) => new Promise((r) => { const id = ++n; pending[id] = r; cdp.send(JSON.stringify({ id, method, params })) })
  const ev = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => r.result.value)
  const until = async (expr, what, tries = 60) => {
    for (let i = 0; i < tries; i++) { if (await ev(expr)) return; await sleep(250) }
    throw new Error('timeout: ' + what)
  }
  // Types a command into terminal `id` (Enter sent apart: PSReadLine treats a fast burst as a paste) and returns what it printed via a file.
  let k = 0
  const run = async (id, cmd, dir) => {
    const out = join(dir, `out${k++}.txt`)
    await ev(`window.api.write(${JSON.stringify(id)}, ${JSON.stringify(`${cmd} 2>&1 | Out-File -Encoding utf8 '${out}'`)})`)
    await sleep(500)
    await ev(`window.api.write(${JSON.stringify(id)}, '\\r')`)
    // Out-File creates the file before the command finishes: wait for content (the BOM alone is 3 bytes).
    for (let i = 0; i < 80 && !(existsSync(out) && readFileSync(out).length > 3); i++) await sleep(250)
    await sleep(300)
    return readFileSync(out, 'utf8')
  }
  // Shell started and showing its prompt; typed input before that is lost.
  const ready = async () => { await until(`/PS [A-Z]:/.test(document.querySelector('.xterm-rows')?.textContent || '')`, 'shell prompt', 120); await sleep(1000) }
  return { send, ev, until, run, ready, close: () => { cdp.close(); treeKill(app) } }
}
