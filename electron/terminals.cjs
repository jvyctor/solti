// Terminals: one pseudo-terminal per terminal node, the agent CLI started in it, and everything that types into it.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { app, ipcMain, powerSaveBlocker } = require('electron')
const pty = require('node-pty')
const S = require('./state.cjs')
const settings = require('./settings.cjs')
const activity = require('./activity.cjs')
const briefs = require('./briefs.cjs')
const proc = require('./proc.cjs')
const inputlog = require('./inputlog.cjs')
const { tr, lang: i18nLang } = require('./i18n.cjs')
const { launchCommand } = require('./launch.cjs')

// macOS and Linux: an app started from the Dock, Finder or a desktop menu gets a minimal PATH, without Homebrew,
// nvm or ~/.local/bin, so `claude`, `codex`… would not be found. Take the PATH your login shell sets up.
function loadLoginPath() {
  if (process.platform === 'win32') return
  try {
    const sh = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const out = execFileSync(sh, ['-ilc', 'printf "__ACPATH__%s__ACPATH__" "$PATH"'], { encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] })
    const login = /__ACPATH__(.*)__ACPATH__/.exec(out)?.[1]
    if (login) process.env.PATH = [...new Set([...login.split(':'), ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':')
  } catch {}
}

// macOS/Linux: node-pty starts shells through its "spawn-helper", which must be executable (see build/fix-node-pty.cjs,
// which fixes it at install time). Last resort at run time, for installs where that did not happen.
let helperChecked = false
function ensureSpawnHelper() {
  if (helperChecked || process.platform === 'win32') return
  helperChecked = true
  try {
    const root = S.unpacked(path.dirname(require.resolve('node-pty/package.json')))
    const fixed = require('../build/fix-node-pty.cjs').fix(root)
    if (fixed.length) require('./errlog.cjs').write('node-pty', `made spawn-helper executable: ${fixed.join(', ')}`)
  } catch (e) { require('./errlog.cjs').write('node-pty', `spawn-helper check failed: ${e.message}`) }
}

// Keep the machine awake per the "Impedir a suspensão" setting.
let blockerId = null
function applyPower() {
  const mode = settings.get().powerSave
  const want = mode === 'always' || (mode === 'agents' && S.ptys.size > 0)
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  if (!want && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null }
}

// The briefing (and the skills) follow the app's language, so agents are instructed in the user's language.
const B = () => briefs.forLang(i18nLang())
function writeBrief(id, name, maestro, instructions, knowledge) {
  const f = path.join(app.getPath('userData'), 'briefs', id + '.md')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const b = B()
  fs.writeFileSync(f, (maestro ? b.maestro : b.agent)(name || id) + (instructions ? b.instructions(instructions) : '') + b.knowledge(knowledge), 'utf8')
  return f
}
const briefLine = (f) => B().readLine(f)

const defaultShell = () => (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'))
// macOS terminals start login shells (that is where Homebrew sets PATH); elsewhere a plain interactive shell.
const shellArgs = (shell) => (process.platform === 'darwin' && /(^|\/)(zsh|bash|sh|fish)$/.test(shell) ? ['-l'] : [])

const BOOT_OK = /^canvas demo (maestro|idle [\w-]{1,30})$/
// boot: a command typed once the shell starts (the demo workspace's simulated agents use it).
function spawnPty(id, { preset, boot, name, maestro, instructions, cwd, cols, rows, resume, sid, knowledge }) {
  if (S.ptys.has(id)) return
  ensureSpawnHelper()
  const shell = settings.get().shell || defaultShell()
  const binDir = S.unpacked(path.join(__dirname, '..', 'bin'))
  // Windows spells it "Path": adding a separate "PATH" key leaves two entries and the shell keeps the original one.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
  const home = process.env.USERPROFILE || process.env.HOME
  let p
  try {
    p = pty.spawn(shell, shellArgs(shell), {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || home,
      env: {
        ...process.env,
        [pathKey]: binDir + path.delimiter + process.env[pathKey],
        CANVAS_URL: `http://127.0.0.1:${S.bridgePort}/${S.TOKEN}`,
        CANVAS_ID: id,
        CANVAS_NODE: process.execPath, // lets bin/canvas(.cmd) run on the app's own runtime
        CANVAS_LANG: i18nLang(), // language of the simulated demo agents
      },
    })
  } catch (e) {
    // Shown in the terminal itself (and logged) instead of an empty terminal that never starts.
    require('./errlog.cjs').write('pty', `${shell}: ${e.stack || e.message}`)
    setTimeout(() => S.toRenderer('pty:data', id, `\r\n\x1b[31mNão foi possível iniciar o terminal (${shell}): ${e.message}\x1b[0m\r\n`), 300)
    return
  }
  const entry = { p, buf: '', cwd: cwd || home, cols: cols || 80, rows: rows || 24, last: 0, preset, line: '', paste: false }
  S.ptys.set(id, entry)
  applyPower()
  p.onData((d) => {
    entry.buf = (entry.buf + d).slice(-200000)
    entry.last = Date.now()
    S.outputListeners.forEach((cb) => cb(id, d))
    S.toRenderer('pty:data', id, d)
  })
  p.onExit(() => {
    if (S.ptys.get(id) === entry) S.ptys.delete(id) // a reload may already have respawned this id
    applyPower()
    S.toRenderer('pty:exit', id)
  })
  // Only the demo agent's own commands: workspace data can come from an imported file, and must not run
  // arbitrary commands just by being opened.
  if (typeof boot === 'string' && BOOT_OK.test(boot)) setTimeout(() => p.write(boot + '\r'), 400)
  else if (settings.get().commands[preset]) {
    if (settings.get().sendBriefing) try { require('./skills.cjs').installSkills(i18nLang()) } catch {} // idempotent; skills must exist before the agent starts
    const line = settings.get().sendBriefing ? briefLine(writeBrief(id, name, maestro, instructions, knowledge)) : ''
    setTimeout(() => p.write(launchCommand(settings.get(), preset, line, { resume, sid }) + '\r'), 400)
  }
}

// ---- What you type into an agent, line by line, for its history (see inputlog.cjs).
// Plain shells are not recorded, nor a line typed right after a password/token prompt.
function trackInput(id, entry, data, source) {
  if (entry.preset === 'shell' || !entry.preset || settings.get().historyInput === false) return
  inputlog.feed(entry, data, (text) => activity.record({ kind: 'input', from: source, to: S.nameOf(id) || id, toId: id, text, outcome: 'ok' }), () => entry.buf)
}

// The phone remote types through this too (source 'celular').
function write(id, data, source) {
  const e = S.ptys.get(id)
  if (!e) return
  e.p.write(data)
  trackInput(id, e, data, source)
}

// Every terminal's whole process tree goes with the app (agents, their MCP servers, dev servers…).
function killAll() {
  const list = [...S.ptys.values()]
  S.ptys.clear()
  proc.killTreesSync(list.map(({ p }) => p.pid))
  for (const { p } of list) try { p.kill() } catch {}
}

function register() {
  ipcMain.handle('pty:spawn', (_e, id, opts) => {
    spawnPty(id, opts)
    const e = S.ptys.get(id)
    return { buf: e?.buf || '', cwd: e?.cwd || '' }
  })
  ipcMain.on('pty:write', (_e, id, d) => write(id, d, tr('você')))
  ipcMain.on('pty:resize', (_e, id, c, r) => { try { const e = S.ptys.get(id); e?.p.resize(c, r); if (e) { e.cols = c; e.rows = r } } catch {} })
  ipcMain.on('pty:kill', (_e, id) => {
    const e = S.ptys.get(id)
    if (e) { proc.killTree(e.p.pid); try { e.p.kill() } catch {} }
    S.ptys.delete(id)
    applyPower()
  })
  ipcMain.on('pty:brief', (_e, id, { name, maestro, instructions, knowledge }) => { const t = S.ptys.get(id); if (t) S.typeInto(t, briefLine(writeBrief(id, name, maestro, instructions, knowledge))) })
  // source: who is prompting (e.g. a pipeline step); recorded so the agent's history shows what it was asked.
  ipcMain.on('agent:prompt', (_e, id, text, source) => {
    const t = S.ptys.get(id)
    if (!t) return
    S.typeInto(t, String(text))
    if (source) activity.record({ kind: 'prompt', from: String(source), to: S.nameOf(id) || id, toId: id, text: String(text), outcome: 'ok' })
  })
  ipcMain.on('agents:interrupt', (_e, id) => S.interruptId(id))
  // Search what terminals printed (ANSI stripped). Capped so a chatty agent cannot flood the palette.
  ipcMain.handle('terms:search', (_e, q) => {
    const needle = String(q || '').toLowerCase()
    const out = []
    for (const [id, t] of S.ptys) {
      const name = S.nameOf(id) || id
      const clean = t.buf.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g, '')
      for (const line of clean.split(/\r?\n/).reverse()) {
        if (line.toLowerCase().includes(needle)) { out.push({ id, name, line: line.trim().slice(0, 160) }); if (out.filter((o) => o.id === id).length >= 5) break }
      }
    }
    return out.slice(0, 30)
  })
}

module.exports = { register, spawnPty, write, killAll, applyPower, loadLoginPath }
