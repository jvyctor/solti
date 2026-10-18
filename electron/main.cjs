// Main process entry: start-up checks, then the pieces —
//   state.cjs (shared state) · terminals.cjs (ptys, input history) · bridge.cjs (agents' local API)
//   window.cjs (window, macOS menu) · ipc.cjs (everything else the window asks for)

// Agent CLIs start bin/canvas-mcp.cjs with the app's own exe plus ELECTRON_RUN_AS_NODE=1. A CLI that drops that
// variable (Gemini CLI does) lands here instead: opening the full app would restore the workspace, start that agent
// again and cascade into several windows. Run the script as plain Node and stay out of the way.
const binScript = process.argv.slice(1).find((a) => /[\\/]bin[\\/]canvas(-mcp)?\.cjs$/i.test(a))
if (binScript) {
  const child = require('child_process').spawn(process.execPath, process.argv.slice(process.argv.indexOf(binScript)), {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
  })
  child.on('exit', (code) => process.exit(code ?? 0))
  child.on('error', () => process.exit(1))
  return
}

const { app } = require('electron')
// Renamed from "Agent Canvas" (0.8.1): keep using the existing data folder, so workspaces, settings, history and
// backups carry over. Must run before anything reads userData (the instance lock below is per data folder).
// Never fatal: some environments cannot resolve appData this early (getPath throws), and then the default stays.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  try {
    const path = require('path')
    const fs = require('fs')
    const appData = app.getPath('appData')
    const old = path.join(appData, 'Agent Canvas')
    if (fs.existsSync(old) && !fs.existsSync(path.join(appData, 'Solti'))) app.setPath('userData', old)
  } catch {}
}
// One app per profile: a second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}
const fs = require('fs')
const path = require('path')
const S = require('./state.cjs')
const errlog = require('./errlog.cjs')
// An error nobody caught is logged and reported in the window, instead of Electron's blocking error dialog.
errlog.init(app.getPath('userData'))
const onFatal = (kind) => (e) => {
  errlog.write(kind, errlog.describe(e))
  try { S.toRenderer('app:error', { message: String(e?.message || e).slice(0, 300) }) } catch {}
}
process.on('uncaughtException', onFatal('uncaught'))
process.on('unhandledRejection', onFatal('unhandled-rejection'))

const settings = require('./settings.cjs')
const i18n = require('./i18n.cjs')
const activity = require('./activity.cjs')
const ledger = require('./ledger.cjs')
const terminals = require('./terminals.cjs')
const bridge = require('./bridge.cjs')
const window = require('./window.cjs')
const ipc = require('./ipc.cjs')

app.on('second-instance', window.show)
// Windows shows this name on notifications (and groups them under it).
if (process.platform === 'win32') app.setAppUserModelId('com.agentcanvas.app')
terminals.register()
ipc.register()

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows') // a covered window must keep rendering too
app.whenReady().then(() => {
  terminals.loadLoginPath() // before anything looks for the agent CLIs (macOS / Linux)
  settings.init(app.getPath('userData'))
  i18n.init(settings.get().language, app.getLocale())
  ipc.applyRemote()
  ipc.startRoutines()
  activity.init(app.getPath('userData'), (ch, d) => S.toRenderer(ch, d))
  ledger.init(app.getPath('userData'))
  terminals.applyPower()
  bridge.start()
  // Re-register only when the MCP script location changes.
  const marker = path.join(app.getPath('userData'), 'mcp-registered')
  const mcpPath = S.unpacked(path.join(__dirname, '..', 'bin', 'canvas-mcp.cjs'))
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== mcpPath)
    require('./register.cjs').registerAll().then((r) => {
      console.log('mcp registered:', r)
      fs.writeFileSync(marker, mcpPath)
    })
  window.create()
})

// Every terminal's whole process tree goes with the app (agents, their MCP servers, dev servers…).
app.on('before-quit', terminals.killAll)
app.on('window-all-closed', () => {
  terminals.killAll()
  app.quit()
})
