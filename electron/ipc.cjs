// Everything else the window asks the main process for: settings, diagnostics, routines, the phone remote, git,
// history, restore points, approvals, costs, workspaces and saved terminal screens.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app, ipcMain, shell, dialog } = require('electron')
const QRCode = require('qrcode')
const S = require('./state.cjs')
const settings = require('./settings.cjs')
const activity = require('./activity.cjs')
const backup = require('./backup.cjs')
const ledger = require('./ledger.cjs')
const errlog = require('./errlog.cjs')
const remote = require('./remote.cjs')
const routines = require('./routines.cjs')
const terminals = require('./terminals.cjs')
const gitx = require('./git.cjs')
const i18n = require('./i18n.cjs')
const { diagnose, CLIS } = require('./diagnose.cjs')
const { tr } = i18n

// ---- Diagnostics: are the agent CLIs installed, logged in and wired to the canvas?
const runOut = (cmd) => new Promise((res, rej) => require('child_process').exec(cmd, { timeout: 8000, windowsHide: true }, (e, out) => (e ? rej(e) : res(String(out)))))
const runDiag = () => diagnose({ commands: settings.get().commands, which: require('./register.cjs').has, run: runOut })

// ---- Scheduled routines (see routines.cjs)
let routinesInst
const getRoutines = () => routinesInst ||= routines.create({
  dir: app.getPath('userData'),
  run: async (r) => {
    const name = S.nameOf(r.target.id) || r.target.id
    if (r.target.type === 'pipeline') {
      if (!S.win) throw new Error(tr('janela fechada'))
      S.toRenderer('routine:pipeline', { id: r.target.id })
      activity.record({ kind: 'routine', from: r.name, to: tr('fluxo'), text: tr('iniciou o fluxo'), outcome: 'ok' })
      return tr('fluxo iniciado')
    }
    const t = S.ptys.get(r.target.id)
    if (!t) throw new Error(tr('agente não está rodando (abra o workspace dele)'))
    S.typeInto(t, r.prompt)
    activity.record({ kind: 'routine', from: r.name, to: name, toId: r.target.id, text: r.prompt, outcome: 'ok' })
    return tr('enviado a {0}', [name])
  },
})

// ---- Phone remote (see remote.cjs): everything it may touch goes through this small host object.
let remoteError = ''
let remoteInst
const getRemote = () => remoteInst ||= remote.create({
  dir: path.join(app.getPath('userData'), 'remote'),
  version: app.getVersion(),
  host: {
    terminals: () => [...S.ptys].map(([id, e]) => {
      const n = S.graph.nodes.find((x) => x.id === id)
      return { id, name: n?.name || id, wsName: S.graph.wsNames?.[n?.ws] || '', cols: e.cols, rows: e.rows, last: e.last }
    }),
    buffer: (id) => S.ptys.get(id)?.buf || '',
    write: (id, data, enter) => { terminals.write(id, data, tr('celular')); if (enter) setTimeout(() => terminals.write(id, '\r', tr('celular')), 300) },
    onOutput: (cb) => { S.outputListeners.add(cb); return () => S.outputListeners.delete(cb) },
    interrupt: (id) => S.interruptId(id),
    activity,
    assets: {
      html: fs.readFileSync(path.join(__dirname, 'remote-ui', 'index.html'), 'utf8'),
      xtermJs: fs.readFileSync(require.resolve('@xterm/xterm/lib/xterm.js')),
      xtermCss: fs.readFileSync(require.resolve('@xterm/xterm/css/xterm.css')),
    },
  },
})
async function applyRemote() {
  const s = settings.get()
  remoteError = ''
  if (s.remoteEnabled) {
    try { await getRemote().start(s.remotePort, { allowHttp: s.remoteHttp }) } catch (e) {
      remoteError = e.code === 'EADDRINUSE' ? tr('Porta {0} em uso. Escolha outra.', [s.remotePort]) : e.message
      await getRemote().stop()
      settings.set({ remoteEnabled: false })
      S.toRenderer('settings', settings.get())
    }
  } else await getRemote().stop()
}
async function restartRemote() { await getRemote().stop(); await applyRemote() }

// Terminal screens (serialized xterm buffer) survive app restarts.
const termDir = () => path.join(app.getPath('userData'), 'terms')
const termFile = (id) => path.join(termDir(), String(id).replace(/[^\w-]/g, '_') + '.txt')

function register() {
  // Diagnostics and error reports
  ipcMain.handle('diag:run', () => runDiag())
  ipcMain.handle('diag:fix', async (_e, id) => {
    const bin = CLIS[id]?.bin
    if (!bin) return runDiag()
    await require('./register.cjs').registerOne(bin)
    try { require('./skills.cjs').installSkills() } catch {}
    return runDiag()
  })
  // "Copiar diagnóstico": versions, agent checks and the recent error log, as plain text for a bug report.
  ipcMain.handle('diag:report', async () => errlog.report({ version: app.getVersion(), electron: process.versions.electron, diag: await runDiag().catch(() => []), settings: settings.get() }))
  ipcMain.on('log:error', (_e, msg) => errlog.write('renderer', String(msg).slice(0, 4000)))
  ipcMain.on('app:open-logs', () => { fs.mkdirSync(path.dirname(errlog.file()), { recursive: true }); shell.openPath(path.dirname(errlog.file())) })
  ipcMain.on('win:focus', () => require('./window.cjs').show())

  // Routines
  ipcMain.handle('routines:list', () => getRoutines().list())
  ipcMain.handle('routines:save', (_e, list) => getRoutines().save(Array.isArray(list) ? list : []))
  ipcMain.handle('routines:run', (_e, id) => getRoutines().runNow(String(id)))

  // Phone remote
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

  // Usage and cost. cwd: Codex sessions are found by folder; the node's saved folder works for agents not running.
  ipcMain.handle('usage:get', () => { try { return require('./usage.cjs').getUsage() } catch { return null } })
  ipcMain.handle('usage:agent', (_e, id, preset, sid, cwd) => require('./agentusage.cjs').agentTokens({ preset, sid, cwd: S.ptys.get(id)?.cwd || cwd }, settings.get().prices))
  ipcMain.handle('pricing:defaults', () => require('./pricing.cjs').PRICES)
  ipcMain.on('costs:tick', (_e, agents) => Array.isArray(agents) && ledger.tick(agents))
  ipcMain.handle('costs:series', (_e, ws, days) => ledger.series(String(ws || ''), Math.min(Math.max(Number(days) || 14, 1), 120)))

  // Files and folders
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(S.win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('fs:list', (_e, dir) => {
    const d = dir || os.homedir()
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)).slice(0, 500)
      return { dir: d, entries }
    } catch (e) {
      return { dir: d, error: String(e.message) }
    }
  })

  // Settings and app info
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:set', (_e, patch) => {
    const s = settings.set(patch)
    if ('language' in patch) i18n.init(s.language, app.getLocale())
    terminals.applyPower()
    if ('remoteHttp' in patch) restartRemote()
    else if ('remoteEnabled' in patch || 'remotePort' in patch) applyRemote()
    S.toRenderer('settings', s)
    return s
  })
  ipcMain.handle('settings:reset', () => {
    const s = settings.reset()
    terminals.applyPower()
    S.toRenderer('settings', s)
    return s
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, dataDir: app.getPath('userData'), platform: process.platform }))
  ipcMain.on('app:open-data', () => shell.openPath(app.getPath('userData')))

  // Activity, history and approvals
  ipcMain.handle('activity:list', () => activity.list())
  ipcMain.handle('history:query', (_e, o) => activity.query(o || {}))
  // The renderer logs what only it sees (budgets, pipeline runs). Kinds are fixed so a page cannot forge agent actions.
  ipcMain.on('activity:record', (_e, e) => {
    if (!['budget', 'pipeline', 'prompt', 'point'].includes(e?.kind)) return
    activity.record({ kind: e.kind, from: String(e.from || ''), fromId: e.fromId || '', to: String(e.to || ''), toId: e.toId || '', text: String(e.text || ''), outcome: 'ok', ...(Number.isFinite(e.cost) ? { cost: e.cost } : {}) })
  })
  ipcMain.on('approval:answer', (_e, id, ok) => activity.answer(id, ok))
  // A pipeline's "wait for my OK" step: same dialog (and phone) as agent approvals, with the step's own timeout.
  ipcMain.handle('approval:ask', async (_e, { key, from, text, timeoutMs }) => {
    const info = { kind: 'approval', from: String(from || ''), to: tr('você'), text: String(text || ''), key: String(key || '') }
    const ok = await activity.request(info, { timeout: Math.min(Math.max(Number(timeoutMs) || 3600000, 1000), 24 * 3600000) })
    activity.record({ ...info, outcome: ok ? 'ok' : 'denied' })
    return ok
  })
  ipcMain.on('approval:cancel', (_e, key) => activity.cancel(String(key || '')))

  // Restore points (backups/point-*.json): before pipelines, before restoring, or on request.
  ipcMain.handle('points:list', () => backup.pointList(S.wsFile()))
  ipcMain.handle('points:create', (_e, label, data) => {
    try {
      const id = backup.pointCreate(S.wsFile(), label, data)
      activity.record({ kind: 'point', from: 'Agent Canvas', text: String(label || ''), outcome: 'ok' })
      return { id }
    } catch (e) { return { error: e.message } }
  })
  ipcMain.handle('points:load', (_e, id) => { try { return { data: backup.pointLoad(S.wsFile(), id) } } catch (e) { return { error: e.message } } })

  // The canvas graph, portals and workspaces
  ipcMain.on('portal:register', (_e, id, wcId) => S.portals.set(id, wcId))
  ipcMain.on('graph:update', (_e, g) => (S.graph = g))
  ipcMain.handle('ws:load', () => {
    const file = S.wsFile()
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch {
      if (!fs.existsSync(file)) return null
      // Unreadable file: keep it aside and fall back to the newest good backup instead of starting empty.
      try { fs.copyFileSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`)) } catch {}
      const r = backup.restore(file)
      if (r) errlog.write('restore', `workspace.json was unreadable; restored ${r.name}`)
      return r ? r.data : null
    }
  })
  ipcMain.on('app:open-backups', () => { fs.mkdirSync(backup.dirOf(S.wsFile()), { recursive: true }); shell.openPath(backup.dirOf(S.wsFile())) })
  ipcMain.handle('ws:export', async (_e, data) => {
    const r = await dialog.showSaveDialog(S.win, { defaultPath: 'agent-canvas-workspaces.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled) return { canceled: true }
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2))
    return { path: r.filePath }
  })
  ipcMain.handle('ws:import', async () => {
    const r = await dialog.showOpenDialog(S.win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled) return { canceled: true }
    try { return { data: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) } } catch { return { error: tr('Não foi possível ler o arquivo.') } }
  })
  ipcMain.on('ws:save', (_e, data) => {
    try { backup.rotate(S.wsFile()); backup.writeAtomic(S.wsFile(), JSON.stringify(data)) } catch {}
    // Drop saved screens of terminals that no longer exist.
    try {
      const live = new Set((data.list || []).flatMap((w) => w.nodes.map((n) => n.id + '.txt')))
      for (const f of fs.readdirSync(termDir())) if (!live.has(f)) fs.unlinkSync(path.join(termDir(), f))
    } catch {}
  })
  ipcMain.on('term:save', (_e, id, text) => { try { fs.mkdirSync(termDir(), { recursive: true }); fs.writeFileSync(termFile(id), text) } catch {} })
  ipcMain.handle('term:load', (_e, id) => { try { return fs.readFileSync(termFile(id), 'utf8') } catch { return '' } })
}

module.exports = { register, applyRemote, startRoutines: () => getRoutines().start() }
