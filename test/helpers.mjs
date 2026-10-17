// Shared by the UI tests: start the built app in a throwaway profile and talk to it over CDP.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import electron from 'electron'

// A port nobody is listening on right now. Fixed ports collide with apps a crashed run left behind
// (a listener of a dead process keeps accepting connections and never answers).
export const freePort = () => new Promise((resolve, reject) => {
  const s = createServer()
  s.once('error', reject)
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

// The page target of an app started with --remote-debugging-port, or null after ~20 s. Every request has a timeout.
export async function findPage(port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await sleep(500)
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) })).json()).find((t) => t.type === 'page')
      if (page) return page
    } catch {}
  }
  return null
}

// CDP call with a timeout, so a page that stopped answering fails the test instead of hanging it.
export function cdpCall(cdp, pending, id, method, params, ms = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { delete pending[id]; reject(new Error(`CDP ${method} timed out`)) }, ms)
    pending[id] = (r) => { clearTimeout(t); delete pending[id]; resolve(r) }
    cdp.send(JSON.stringify({ id, method, params }))
  })
}

// electron.exe leaves renderer/GPU children behind a plain kill(); they slow down the next launch.
export function treeKill(app) {
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { app.kill() }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Marks the first-run welcome as seen (it would cover the UI) and pins Portuguese labels, keeping any settings the test wrote.
export function prepareProfile(prof, { onboarded = true } = {}) {
  const sf = join(prof, 'settings.json')
  let s = {}
  try { s = JSON.parse(readFileSync(sf, 'utf8')) } catch {}
  writeFileSync(sf, JSON.stringify({ ...s, ...(onboarded && s.onboarded === undefined ? { onboarded: true } : {}), ...(s.language === undefined ? { language: 'pt' } : {}) }))
}

// `_port` is kept for the callers' signature; a free port is always picked.
export async function launch(prof, _port, { onboarded = true, env } = {}) {
  prepareProfile(prof, { onboarded })
  const port = await freePort()
  // Linux CI: Electron from node_modules has no setuid sandbox helper.
  const extra = process.platform === 'linux' ? ['--no-sandbox'] : []
  const app = spawn(electron, ['.', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, ...extra], { stdio: 'ignore', ...(env ? { env: { ...process.env, ...env } } : {}) })
  const page = await findPage(port)
  if (!page) { treeKill(app); throw new Error('app window did not open') }
  const cdp = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { cdp.onopen = r; setTimeout(() => j(new Error('CDP connection timed out')), 10000) })
  let n = 0
  const pending = {}
  cdp.onmessage = (e) => { const m = JSON.parse(e.data); pending[m.id]?.(m.result) }
  const send = (method, params) => cdpCall(cdp, pending, ++n, method, params)
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
