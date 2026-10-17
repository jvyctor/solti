// The app window, the macOS menu and bringing the window forward.
const path = require('path')
const { BrowserWindow, Menu, dialog, shell } = require('electron')
const S = require('./state.cjs')
const settings = require('./settings.cjs')
const errlog = require('./errlog.cjs')
const { tr } = require('./i18n.cjs')

const RELEASES = 'https://github.com/jvyctor/solti/releases'

function show() {
  const w = S.win
  if (!w || w.isDestroyed()) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

// macOS needs an application menu for Cmd+C / V / Q / W to work at all. Windows and Linux keep none: a menu with
// Ctrl+C / Ctrl+Z accelerators would swallow keys the terminals and the canvas undo need.
function macMenu() {
  if (process.platform !== 'darwin') return
  const ask = (cmd) => () => S.toRenderer('menu', cmd)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: tr('Arquivo'), submenu: [{ label: tr('Configurações…'), accelerator: 'CmdOrCtrl+,', click: ask('settings') }, { label: tr('Paleta de comandos'), click: ask('palette') }, { role: 'close' }] },
    // Undo/redo are ours: the canvas has its own history, text fields keep theirs (the renderer decides).
    { label: tr('Editar'), submenu: [{ label: tr('Desfazer'), accelerator: 'CmdOrCtrl+Z', click: ask('undo') }, { label: tr('Refazer'), accelerator: 'Shift+CmdOrCtrl+Z', click: ask('redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: tr('Versões e downloads'), click: () => shell.openExternal(RELEASES) }] },
  ]))
}

function create() {
  macMenu()
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    // backgroundThrottling off: agents keep running while the window is minimised or covered, and pipelines/status timers live in the renderer.
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, webviewTag: true, backgroundThrottling: false }, // webviewTag: browser portals
  })
  S.win = win
  // "Pedir confirmação para sair": ask before closing while agents may be running.
  let confirmed = false
  win.on('close', (e) => {
    if (confirmed || !settings.get().confirmQuit) return
    e.preventDefault()
    dialog
      .showMessageBox(win, { type: 'question', buttons: [tr('Sair'), tr('Cancelar')], defaultId: 1, cancelId: 1, message: tr('Sair do Solti?'), detail: tr('Os agentes em execução serão encerrados.') })
      .then((r) => { if (r.response === 0) { confirmed = true; win.close() } })
  })
  win.on('closed', () => { if (S.win === win) S.win = null })
  require('./updater.cjs').init(() => (S.win && !S.win.isDestroyed() ? S.win : null), { beforeInstall: () => S.win?.removeAllListeners('close') })
  win.webContents.on('console-message', (e, lvl, m, ln, s) => {
    // Newer Electron passes everything on the event (level as a word); older ones as arguments.
    const level = typeof lvl === 'number' ? lvl : { debug: 0, info: 1, warning: 2, error: 3 }[e.level] ?? 0
    const msg = m ?? e.message, line = ln ?? e.lineNumber, src = s ?? e.sourceId
    if (level < 2) return
    console.error('[renderer]', msg, `${src}:${line}`)
    if (level >= 3) errlog.write('renderer', `${msg} (${src}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, d) => { console.error('[renderer gone]', d.reason); errlog.write('renderer-gone', d.reason) })
  if (process.env.DEV) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return win
}

module.exports = { create, show }
