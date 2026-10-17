const { app, BrowserWindow, ipcMain, powerSaveBlocker, shell, dialog, webContents, Menu } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const pty = require('node-pty')
const activity = require('./activity.cjs')
const backup = require('./backup.cjs')
const remote = require('./remote.cjs')
const routines = require('./routines.cjs')
const { diagnose, CLIS } = require('./diagnose.cjs')
const i18n = require('./i18n.cjs')
const { tr } = i18n
const QRCode = require('qrcode')
const portal = require('./portal.cjs')

const TOKEN = crypto.randomBytes(16).toString('hex')
const ptys = new Map() // id -> { p, buf }
let graph = { nodes: [], edges: [], knowledge: {} } // knowledge: workspace id -> shared project notes
let win
let bridgePort = 0

// Files inside app.asar cannot be executed; scripts in bin/ are unpacked next to it.
const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
const wsFile = () => path.join(app.getPath('userData'), 'workspace.json')
const nameOf = (id) => graph.nodes.find((n) => n.id === id)?.name
// Peers = edge neighbours. The workspace's maestro also reaches every terminal there, and vice versa.
const peersOf = (id) => {
  const me = graph.nodes.find((n) => n.id === id)
  if (!me) return []
  const ids = new Set(
    graph.edges.filter((e) => e.source === id || e.target === id).map((e) => (e.source === id ? e.target : e.source)),
  )
  for (const n of graph.nodes) {
    if (n.ws !== me.ws || n.id === id) continue
    if (me.maestro || n.maestro) ids.add(n.id)
  }
  return graph.nodes.filter((n) => ids.has(n.id))
}

const portals = new Map() // portal node id -> webContents id of its <webview>

// What a connected node holds, as the agent sees it: terminal output, note text, page text, folder listing, diff.
async function readNode(n, j) {
  const cap = Math.min(Math.max(Number(j.bytes) || 8000, 200), 100000)
  if (n.type === 'terminal') return { type: 'terminal', output: (ptys.get(n.id)?.buf || '').slice(-(j.bytes || 4000)) }
  if (['note', 'text', 'knowledge'].includes(n.type)) return { type: n.type, title: n.name, text: (n.text || '').slice(0, cap) }
  if (n.type === 'files') {
    const root = n.path || ''
    const dir = path.resolve(root, j.path || '')
    if (!root || path.relative(root, dir).startsWith('..')) throw new Error('path outside the connected folder')
    const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 300).map((e) => e.name + (e.isDirectory() ? '/' : ''))
    return { type: 'files', path: dir, entries }
  }
  if (n.type === 'portal') {
    const wc = portals.has(n.id) ? webContents.fromId(portals.get(n.id)) : null
    if (!wc || wc.isDestroyed()) return { type: 'portal', url: n.url, note: 'page not loaded yet' }
    const text = await wc.executeJavaScript('document.body ? document.body.innerText : ""')
    const links = await wc.executeJavaScript('[...document.querySelectorAll("a[href]")].slice(0, 40).map(a => ({ text: a.innerText.trim().slice(0, 80), href: a.href }))')
    return { type: 'portal', url: wc.getURL(), title: wc.getTitle(), text: String(text).slice(0, cap), links }
  }
  if (n.type === 'diff') {
    const ids = graph.edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => (e.source === n.id ? e.target : e.source))
    const agent = graph.nodes.find((x) => ids.includes(x.id) && x.git?.worktree)
    if (!agent) return { type: 'diff', note: 'not connected to an agent working in a worktree' }
    const files = await gitx.changes(agent.cwd, agent.git.base)
    const patches = {}
    for (const f of files.slice(0, 6)) patches[f.file] = (await gitx.patch(agent.cwd, agent.git.base, f.file, f.status === 'N')).slice(0, 4000)
    return { type: 'diff', branch: agent.git.branch, base: agent.git.base, files, patches }
  }
  return { type: n.type, name: n.name }
}

const outputListeners = new Set() // phone remote: live terminal output
const waiting = new Map() // asker id -> { from (target id), resolve, timer }

// TUIs (Claude, Codex…) treat one fast write as a paste: a trailing \r is then a newline, not "submit".
// Send the text first and Enter separately, after the paste settles.
function typeInto(entry, text) {
  entry.p.write(text.replace(/\r?\n/g, ' '))
  setTimeout(() => entry.p.write('\r'), 300)
}

// Local bridge: agents inside terminals call this via `canvas` CLI (bin/canvas.cjs).
function startBridge() {
  const srv = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    // Token travels in the path so env filters that drop *TOKEN* vars (e.g. Gemini CLI) still work.
    if (!req.url.startsWith('/' + TOKEN)) return reply(401, { error: 'bad token' })
    req.url = req.url.slice(TOKEN.length + 1)
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let j = {}
      try { j = body ? JSON.parse(body) : {} } catch { return reply(400, { error: 'bad json' }) }
      const from = j.from
      const go = () => {
      if (req.url === '/peers') return reply(200, { peers: peersOf(from).map((n) => ({ id: n.id, name: n.name, type: n.type || 'terminal', role: n.role })) })
      if (req.url === '/send' || req.url === '/ask') {
        const target = peersOf(from).find((n) => n.id === j.to || n.name === j.to)
        if (!target) return reply(403, { error: 'target not connected to caller' })
        const t = ptys.get(target.id)
        if (!t) return reply(404, { error: 'target terminal not running' })
        const me = nameOf(from) || from
        const comm = (kind) => win?.webContents.send('comm', { kind, a: from, b: target.id })
        if (req.url === '/send') {
          // A reply to someone blocked in canvas_ask goes straight to their tool call, not their prompt.
          const w = waiting.get(target.id)
          if (w && w.from === from) {
            clearTimeout(w.timer)
            waiting.delete(target.id)
            w.resolve({ reply: j.text, from: me })
            comm('pulse')
            return reply(200, { ok: true, delivered: 'to waiting canvas_ask' })
          }
          typeInto(t, `[from ${me}] ${j.text}`)
          comm('pulse')
          return reply(200, { ok: true })
        }
        // /ask: deliver, then hold the HTTP response until the peer answers with canvas_send (or timeout).
        const secs = Math.min(Math.max(Number(j.timeout) || 50, 5), 600)
        const prev = waiting.get(from)
        if (prev) { clearTimeout(prev.timer); prev.resolve({ replaced: true }) }
        comm('start')
        waiting.set(from, {
          from: target.id,
          resolve: (r) => { comm('end'); reply(200, r) },
          timer: setTimeout(() => {
            waiting.delete(from)
            comm('end')
            reply(200, { timeout: true, note: `sem resposta em ${secs}s; se chegar depois, aparece no seu terminal` })
          }, secs * 1000),
        })
        typeInto(t, `[from ${me}] ${j.text} (Responda usando a ferramenta canvas_send para "${me}".)`)
        return
      }
      if (req.url === '/read') {
        const target = peersOf(from).find((n) => n.id === j.to || n.name === j.to)
        if (!target) return reply(404, { error: 'target not found or not connected to you (see canvas_peers)' })
        return readNode(target, j).then((r) => reply(200, r), (e) => reply(500, { error: e.message }))
      }
      if (req.url === '/spawn') {
        const me = graph.nodes.find((n) => n.id === from)
        if (!me?.maestro) return reply(403, { error: 'only the maestro can create agents' })
        const taken = new Set(graph.nodes.filter((n) => n.ws === me.ws).map((n) => n.name))
        let name = String(j.name || 'agente').trim().slice(0, 40) || 'agente'
        for (let i = 2; taken.has(name); i++) name = `${j.name || 'agente'}-${i}`
        // Reserve the name now so two quick spawns do not collide before the renderer reports back.
        graph.nodes.push({ id: 'pending-' + name, ws: me.ws, name })
        win?.webContents.send('spawn', { from, name, preset: j.preset, instructions: j.instructions })
        return reply(200, { ok: true, name, note: 'agent created and connected to you; message it with canvas_send/canvas_ask' })
      }
      if (req.url === '/knowledge') {
        const me = graph.nodes.find((n) => n.id === from)
        return reply(200, { text: (me && graph.knowledge?.[me.ws]) || '' })
      }
      if (req.url === '/remember') {
        const me = graph.nodes.find((n) => n.id === from)
        if (!me || !String(j.text || '').trim()) return reply(400, { error: 'empty text or unknown caller' })
        const line = `- ${String(j.text).trim()}`
        graph.knowledge = { ...graph.knowledge, [me.ws]: ((graph.knowledge?.[me.ws] || '') + '\n' + line).trim() }
        win?.webContents.send('knowledge', { from, text: line })
        return reply(200, { ok: true })
      }
      if (req.url === '/portal') {
        const target = peersOf(from).find((n) => (n.id === j.to || n.name === j.to) && n.type === 'portal')
        if (!target) return reply(404, { error: 'portal not found or not connected to you (see canvas_peers)' })
        const wc = portals.has(target.id) ? webContents.fromId(portals.get(target.id)) : null
        if (!wc || wc.isDestroyed()) return reply(404, { error: 'portal page not loaded yet' })
        return portal.act(wc, j).then(
          (r) => {
            if (!r.png) return reply(200, r)
            const dir = path.join(app.getPath('userData'), 'shots')
            fs.mkdirSync(dir, { recursive: true })
            const f = path.join(dir, `${target.id}-${Date.now()}.png`)
            fs.writeFileSync(f, r.png)
            for (const old of fs.readdirSync(dir).sort().slice(0, -20)) fs.rmSync(path.join(dir, old), { force: true }) // keep the newest 20
            reply(200, { ok: true, path: f, url: r.url, image: r.png.toString('base64') })
          },
          (e) => reply(500, { error: e.message }),
        )
      }
      if (req.url === '/done') {
        const summary = String(j.summary || '').trim() || '(sem resumo)'
        activity.record({ kind: 'done', from: nameOf(from) || from, to: '', text: summary, outcome: 'ok' })
        win?.webContents.send('agent:done', { from, name: nameOf(from) || from, summary, t: Date.now() })
        return reply(200, { ok: true })
      }
      if (req.url === '/note') {
        win?.webContents.send('note', { from, text: j.text })
        return reply(200, { ok: true })
      }
      reply(404, { error: 'unknown route' })
      }
      // Timeline + approval gate for actions where one agent acts on another (or on the browser).
      const kind = { '/send': 'send', '/ask': 'ask', '/spawn': 'spawn', '/portal': 'portal' }[req.url]
      if (!kind) return go()
      const info = { kind, from: nameOf(from) || from, to: j.to || j.name || '', text: j.text || j.instructions || [j.action, j.url, j.selector, j.value, j.key].filter(Boolean).join(' ') }
      if (activity.needsApproval(settings.get().approval, kind)) {
        return activity.request(info).then((ok) => {
          activity.record({ ...info, outcome: ok ? 'ok' : 'denied' })
          ok ? go() : reply(403, { error: 'denied by the user' })
        })
      }
      activity.record({ ...info, outcome: 'ok' })
      go()
    })
  })
  srv.listen(0, '127.0.0.1', () => (bridgePort = srv.address().port))
}

const briefs = require('./briefs.cjs')
// Each CLI takes its startup prompt differently.
const settings = require('./settings.cjs')
const { launchCommand } = require('./launch.cjs')

// Keep the machine awake per the "Impedir a suspensão" setting.
let blockerId = null
function applyPower() {
  const mode = settings.get().powerSave
  const want = mode === 'always' || (mode === 'agents' && ptys.size > 0)
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  if (!want && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null }
}
function writeBrief(id, name, maestro, instructions, knowledge) {
  const f = path.join(app.getPath('userData'), 'briefs', id + '.md')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const extra = instructions ? `\n\n## Instruções específicas do maestro\n${instructions}\n` : ''
  const know = `\n\n## Conhecimento compartilhado do projeto\nTodos os agentes deste workspace compartilham estas anotações. Consulte com \`canvas_knowledge\` e registre fatos duradouros (decisões, comandos, armadilhas) com \`canvas_remember\`.\n${knowledge ? '\n' + knowledge + '\n' : '\n(vazio por enquanto)\n'}`
  fs.writeFileSync(f, (maestro ? briefs.maestro : briefs.agent)(name || id) + extra + know, 'utf8')
  return f
}
// ASCII only: this line is typed into a PowerShell prompt.
const briefLine = (f) => `Leia e siga o briefing de papel em ${f}`

function spawnPty(id, { preset, name, maestro, instructions, cwd, cols, rows, resume, sid, knowledge }) {
  if (ptys.has(id)) return
  const shell = settings.get().shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash')
  const binDir = unpacked(path.join(__dirname, '..', 'bin'))
  const p = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.env.USERPROFILE || process.env.HOME,
    env: {
      ...process.env,
      PATH: binDir + path.delimiter + process.env.PATH,
      CANVAS_URL: `http://127.0.0.1:${bridgePort}/${TOKEN}`,
      CANVAS_ID: id,
      CANVAS_NODE: process.execPath, // lets bin/canvas.cmd run on the app's own runtime
    },
  })
  const entry = { p, buf: '', cwd: cwd || process.env.USERPROFILE || process.env.HOME, cols: cols || 80, rows: rows || 24, last: 0 }
  ptys.set(id, entry)
  applyPower()
  p.onData((d) => {
    entry.buf = (entry.buf + d).slice(-200000)
    entry.last = Date.now()
    outputListeners.forEach((cb) => cb(id, d))
    win?.webContents.send('pty:data', id, d)
  })
  p.onExit(() => {
    if (ptys.get(id) === entry) ptys.delete(id) // a reload may already have respawned this id
    applyPower()
    win?.webContents.send('pty:exit', id)
  })
  if (settings.get().commands[preset]) {
    if (settings.get().sendBriefing) try { require('./skills.cjs').installSkills() } catch {} // idempotent; skills must exist before the agent starts
    const line = settings.get().sendBriefing ? briefLine(writeBrief(id, name, maestro, instructions, knowledge)) : ''
    setTimeout(() => p.write(launchCommand(settings.get(), preset, line, { resume, sid }) + '\r'), 400)
  }
}

ipcMain.handle('pty:spawn', (_e, id, opts) => {
  spawnPty(id, opts)
  const e = ptys.get(id)
  return { buf: e?.buf || '', cwd: e?.cwd || '' }
})
// ---- Diagnostics: are the agent CLIs installed, logged in and wired to the canvas?
const runOut = (cmd) => new Promise((res, rej) => require('child_process').exec(cmd, { timeout: 8000, windowsHide: true }, (e, out) => (e ? rej(e) : res(String(out)))))
const runDiag = () => diagnose({ commands: settings.get().commands, which: require('./register.cjs').has, run: runOut })
ipcMain.handle('diag:run', () => runDiag())
ipcMain.handle('diag:fix', async (_e, id) => {
  const bin = CLIS[id]?.bin
  if (!bin) return runDiag()
  await require('./register.cjs').registerOne(bin)
  try { require('./skills.cjs').installSkills() } catch {}
  return runDiag()
})

// ---- Scheduled routines (see routines.cjs)
let routinesInst
const getRoutines = () => routinesInst ||= routines.create({
  dir: app.getPath('userData'),
  run: async (r) => {
    const name = nameOf(r.target.id) || r.target.id
    if (r.target.type === 'pipeline') {
      if (!win) throw new Error(tr('janela fechada'))
      win.webContents.send('routine:pipeline', { id: r.target.id })
      activity.record({ kind: 'routine', from: r.name, to: tr('fluxo'), text: tr('iniciou o fluxo'), outcome: 'ok' })
      return tr('fluxo iniciado')
    }
    const t = ptys.get(r.target.id)
    if (!t) throw new Error(tr('agente não está rodando (abra o workspace dele)'))
    typeInto(t, r.prompt)
    activity.record({ kind: 'routine', from: r.name, to: name, text: r.prompt, outcome: 'ok' })
    return tr('enviado a {0}', [name])
  },
})
ipcMain.handle('routines:list', () => getRoutines().list())
ipcMain.handle('routines:save', (_e, list) => getRoutines().save(Array.isArray(list) ? list : []))
ipcMain.handle('routines:run', (_e, id) => getRoutines().runNow(String(id)))

// ---- Phone remote (see remote.cjs): everything it may touch goes through this small host object.
let remoteError = ''
let remoteInst
const getRemote = () => remoteInst ||= remote.create({
  dir: path.join(app.getPath('userData'), 'remote'),
  version: app.getVersion(),
  host: {
    terminals: () => [...ptys].map(([id, e]) => {
      const n = graph.nodes.find((x) => x.id === id)
      return { id, name: n?.name || id, wsName: graph.wsNames?.[n?.ws] || '', cols: e.cols, rows: e.rows, last: e.last }
    }),
    buffer: (id) => ptys.get(id)?.buf || '',
    write: (id, data, enter) => { const e = ptys.get(id); if (!e) return; e.p.write(data); if (enter) setTimeout(() => e.p.write('\r'), 300) },
    onOutput: (cb) => { outputListeners.add(cb); return () => outputListeners.delete(cb) },
    interrupt: (id) => (id ? ptys.has(id) && interrupt(ptys.get(id)) : [...ptys.values()].forEach(interrupt)),
    activity,
    assets: {
      html: fs.readFileSync(path.join(__dirname, 'remote-ui', 'index.html'), 'utf8'),
      xtermJs: fs.readFileSync(require.resolve('@xterm/xterm/lib/xterm.js')),
      xtermCss: fs.readFileSync(require.resolve('@xterm/xterm/css/xterm.css')),
    },
  },
})
async function applyRemote() {
  const S = settings.get()
  remoteError = ''
  if (S.remoteEnabled) {
    try { await getRemote().start(S.remotePort, { allowHttp: S.remoteHttp }) } catch (e) {
      remoteError = e.code === 'EADDRINUSE' ? tr('Porta {0} em uso. Escolha outra.', [S.remotePort]) : e.message
      await getRemote().stop()
      settings.set({ remoteEnabled: false })
      win?.webContents.send('settings', settings.get())
    }
  } else await getRemote().stop()
}
async function restartRemote() { await getRemote().stop(); await applyRemote() }
ipcMain.handle('remote:status', () => ({ ...getRemote().status(), error: remoteError, devices: getRemote().devices() }))
ipcMain.handle('remote:revoke', (_e, id) => { getRemote().revoke(id); return getRemote().devices() })
ipcMain.handle('remote:pair', async () => {
  const st = getRemote().status()
  if (!st.listening) return { error: tr('Ative o controle remoto primeiro.') }
  await getRemote().refreshCert()
  const { token, expires } = getRemote().startPairing()
  const urls = st.addresses.flatMap((ip) => [...(st.httpPort ? [`http://${ip}:${st.httpPort}/#pair=${token}`] : []), `https://${ip}:${st.port}/#pair=${token}`])
  if (!urls.length) return { error: tr('Nenhuma rede local encontrada (conecte o computador ao Wi-Fi).') }
  return { urls, qr: await QRCode.toDataURL(urls[0], { margin: 1, width: 320 }), expires }
})

// Git / worktrees (see git.cjs). Errors come back as { error } so the dialog can show them.
const gitx = require('./git.cjs')
const safe = (fn) => async (_e, ...a) => { try { return await fn(...a) } catch (e) { return { error: e.message } } }
ipcMain.handle('git:info', safe((dir) => gitx.info(dir)))
ipcMain.handle('git:remote-branches', safe(async (url) => ({ branches: await gitx.remoteBranches(url) })))
ipcMain.handle('git:prepare', safe((o) => gitx.prepare({ ...o, dest: o.dest || path.join(app.getPath('documents'), 'AgentCanvas', 'repos') })))
ipcMain.handle('git:remove-worktree', safe((wt) => gitx.removeWorktree(wt)))
ipcMain.handle('git:dirty', safe(async (dir) => ({ dirty: await gitx.dirty(dir) })))
ipcMain.handle('git:changes', safe(async (wt, base) => ({ files: await gitx.changes(wt, base) })))
ipcMain.handle('git:patch', safe(async (wt, base, file, isNew) => ({ patch: await gitx.patch(wt, base, file, isNew) })))
ipcMain.handle('git:commit', safe((wt, msg) => gitx.commit(wt, msg)))
ipcMain.handle('git:merge', safe((repo, base, branch) => gitx.merge(repo, base, branch)))
ipcMain.handle('git:pr', safe(async (repo, base, branch) => { const r = await gitx.pushForPr(repo, base, branch); shell.openExternal(r.url); return r }))
// Search what terminals printed (ANSI stripped). Capped so a chatty agent cannot flood the palette.
ipcMain.handle('terms:search', (_e, q) => {
  const needle = String(q || '').toLowerCase()
  const out = []
  for (const [id, t] of ptys) {
    const name = graph.nodes.find((n) => n.id === id)?.name || id
    const clean = t.buf.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g, '')
    for (const line of clean.split(/\r?\n/).reverse()) {
      if (line.toLowerCase().includes(needle)) { out.push({ id, name, line: line.trim().slice(0, 160) }); if (out.filter((o) => o.id === id).length >= 5) break }
    }
  }
  return out.slice(0, 30)
})
ipcMain.handle('usage:agent', (_e, id, preset, sid) => require('./agentusage.cjs').agentTokens({ preset, sid, cwd: ptys.get(id)?.cwd }))
// Emergency stop: Esc (cancels the current turn in most TUIs) then Ctrl+C, for one agent or all.
const interrupt = (e) => { e.p.write('\x1b'); setTimeout(() => e.p.write('\x03'), 150) }
ipcMain.on('agents:interrupt', (_e, id) => (id ? ptys.has(id) && interrupt(ptys.get(id)) : [...ptys.values()].forEach(interrupt)))
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('pty:brief', (_e, id, { name, maestro, instructions, knowledge }) => { const t = ptys.get(id); if (t) typeInto(t, briefLine(writeBrief(id, name, maestro, instructions, knowledge))) })
ipcMain.handle('fs:list', (_e, dir) => {
  const d = dir || require('os').homedir()
  try {
    const entries = fs
      .readdirSync(d, { withFileTypes: true })
      .map((e) => ({ name: e.name, dir: e.isDirectory() }))
      .sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name))
      .slice(0, 500)
    return { dir: d, entries }
  } catch (e) {
    return { dir: d, error: String(e.message) }
  }
})
ipcMain.on('pty:write',(_e, id, d) => ptys.get(id)?.p.write(d))
ipcMain.on('pty:resize', (_e, id, c, r) => { try { const e = ptys.get(id); e?.p.resize(c, r); if (e) { e.cols = c; e.rows = r } } catch {} })
ipcMain.on('pty:kill', (_e, id) => { ptys.get(id)?.p.kill(); ptys.delete(id); applyPower() })
ipcMain.handle('settings:get', () => settings.get())
ipcMain.handle('settings:set', (_e, patch) => {
  const s = settings.set(patch)
  if ('language' in patch) i18n.init(s.language, app.getLocale())
  applyPower()
  if ('remoteHttp' in patch) restartRemote()
  else if ('remoteEnabled' in patch || 'remotePort' in patch) applyRemote()
  win?.webContents.send('settings', s)
  return s
})
ipcMain.handle('settings:reset', () => {
  const s = settings.reset()
  applyPower()
  win?.webContents.send('settings', s)
  return s
})
ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, dataDir: app.getPath('userData') }))
ipcMain.on('app:open-data', () => shell.openPath(app.getPath('userData')))
ipcMain.handle('usage:get', () => { try { return require('./usage.cjs').getUsage() } catch { return null } })
ipcMain.on('agent:prompt', (_e, id, text) => { const t = ptys.get(id); if (t) typeInto(t, String(text)) })
ipcMain.handle('activity:list', () => activity.list())
ipcMain.on('approval:answer', (_e, id, ok) => activity.answer(id, ok))
ipcMain.on('portal:register', (_e, id, wcId) => portals.set(id, wcId))
ipcMain.on('graph:update', (_e, g) => (graph = g))
ipcMain.handle('ws:load', () => {
  try { return JSON.parse(fs.readFileSync(wsFile(), 'utf8')) } catch {
    if (!fs.existsSync(wsFile())) return null
    // Unreadable file: keep it aside and fall back to the newest good backup instead of starting empty.
    try { fs.copyFileSync(wsFile(), wsFile().replace(/\.json$/, `.corrupt-${Date.now()}.json`)) } catch {}
    const r = backup.restore(wsFile())
    if (r) console.error('workspace.json was unreadable; restored', r.name)
    return r ? r.data : null
  }
})
ipcMain.on('app:open-backups', () => { fs.mkdirSync(backup.dirOf(wsFile()), { recursive: true }); shell.openPath(backup.dirOf(wsFile())) })
ipcMain.handle('ws:export', async (_e, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'agent-canvas-workspaces.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled) return { canceled: true }
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2))
  return { path: r.filePath }
})
ipcMain.handle('ws:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled) return { canceled: true }
  try { return { data: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) } } catch { return { error: tr('Não foi possível ler o arquivo.') } }
})
ipcMain.on('ws:save', (_e, data) => {
  try { backup.rotate(wsFile()); backup.writeAtomic(wsFile(), JSON.stringify(data)) } catch {}
  // Drop saved screens of terminals that no longer exist.
  try {
    const live = new Set((data.list || []).flatMap((w) => w.nodes.map((n) => n.id + '.txt')))
    for (const f of fs.readdirSync(termDir())) if (!live.has(f)) fs.unlinkSync(path.join(termDir(), f))
  } catch {}
})
// Terminal screens (serialized xterm buffer) survive app restarts.
const termDir = () => path.join(app.getPath('userData'), 'terms')
const termFile = (id) => path.join(termDir(), String(id).replace(/[^\w-]/g, '_') + '.txt')
ipcMain.on('term:save', (_e, id, text) => { try { fs.mkdirSync(termDir(), { recursive: true }); fs.writeFileSync(termFile(id), text) } catch {} })
ipcMain.handle('term:load', (_e, id) => { try { return fs.readFileSync(termFile(id), 'utf8') } catch { return '' } })

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows') // a covered window must keep rendering too
app.whenReady().then(() => {
  settings.init(app.getPath('userData'))
  i18n.init(settings.get().language, app.getLocale())
  applyRemote()
  getRoutines().start()
  activity.init(app.getPath('userData'), (ch, d) => win?.webContents.send(ch, d))
  applyPower()
  startBridge()
  // Re-register only when the MCP script location changes.
  const marker = path.join(app.getPath('userData'), 'mcp-registered')
  const mcpPath = unpacked(path.join(__dirname, '..', 'bin', 'canvas-mcp.cjs'))
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== mcpPath)
    require('./register.cjs').registerAll().then((r) => {
      console.log('mcp registered:', r)
      fs.writeFileSync(marker, mcpPath)
    })
  // macOS needs an application menu for Cmd+C / V / Q / W to work at all. Windows and Linux keep none: a menu with
  // Ctrl+C / Ctrl+Z accelerators would swallow keys the terminals and the canvas undo need.
  if (process.platform === 'darwin') {
    const ask = (cmd) => () => win?.webContents.send('menu', cmd)
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: tr('Arquivo'), submenu: [{ label: tr('Configurações…'), accelerator: 'CmdOrCtrl+,', click: ask('settings') }, { label: tr('Paleta de comandos'), click: ask('palette') }, { role: 'close' }] },
      // Undo/redo are ours: the canvas has its own history, text fields keep theirs (the renderer decides).
      { label: tr('Editar'), submenu: [{ label: tr('Desfazer'), accelerator: 'CmdOrCtrl+Z', click: ask('undo') }, { label: tr('Refazer'), accelerator: 'Shift+CmdOrCtrl+Z', click: ask('redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: tr('Versões e downloads'), click: () => shell.openExternal('https://github.com/jvyctor/agent-canvas-releases/releases') }] },
    ]))
  }
  win =new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    // backgroundThrottling off: agents keep running while the window is minimised or covered, and pipelines/status timers live in the renderer.
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, webviewTag: true, backgroundThrottling: false }, // webviewTag: browser portals
  })
  // "Pedir confirmação para sair": ask before closing while agents may be running.
  let confirmed = false
  win.on('close', (e) => {
    if (confirmed || !settings.get().confirmQuit) return
    e.preventDefault()
    dialog
      .showMessageBox(win, { type: 'question', buttons: [tr('Sair'), tr('Cancelar')], defaultId: 1, cancelId: 1, message: tr('Sair do Agent Canvas?'), detail: tr('Os agentes em execução serão encerrados.') })
      .then((r) => { if (r.response === 0) { confirmed = true; win.close() } })
  })
  require('./updater.cjs').init(() => win, { beforeInstall: () => win.removeAllListeners('close') })
  win.webContents.on('console-message', (_e, level, msg, line, src) => level >= 2 && console.error('[renderer]', msg, `${src}:${line}`))
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason))
  if (process.env.DEV) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
})
app.on('window-all-closed', () => {
  for (const { p } of ptys.values()) try { p.kill() } catch {}
  app.quit()
})
