// Auto-update from the public GitHub Releases repo (electron-updater); no credentials involved.
const { app, ipcMain, shell } = require('electron')
const { tr } = require('./i18n.cjs')
const { autoUpdater } = require('electron-updater')

const CHECK_EVERY = 4 * 60 * 60 * 1000
let getWin = () => null
let state = { status: 'idle' }
let timer

// Installed by a package manager (Scoop, AUR): it owns the files, so updates go through it, not electron-updater.
// The Scoop manifest and the PKGBUILD write resources/.managed-by (see build/package-managers.cjs).
// (Homebrew moves the app to /Applications, so it is not detected; on macOS the update opens the download page anyway.)
const UPGRADE = { scoop: 'scoop update solti', pacman: 'yay -Syu solti-bin' }
let managedBy
function managed() {
  if (managedBy !== undefined) return managedBy
  managedBy = null
  try { managedBy = require('fs').readFileSync(require('path').join(process.resourcesPath, '.managed-by'), 'utf8').trim() || null } catch {}
  if (!managedBy && process.platform === 'win32' && /[\\/]scoop[\\/]apps[\\/]/i.test(process.execPath)) managedBy = 'scoop'
  return managedBy
}

const push = (p) => {
  const m = managed()
  state = { ...p, current: app.getVersion(), ...(m ? { managed: m, upgrade: UPGRADE[m] || '' } : {}) }
  getWin()?.webContents.send('update:state', state)
}

// GitHub sends release notes as HTML; the UI shows plain text.
const notesText = (n) => {
  const s = Array.isArray(n) ? n.map((x) => x.note).join('\n\n') : n || ''
  return s.replace(/<\/(p|li|h\d)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
}

const friendly = (e) => {
  const m = String(e?.message || e)
  if (/404|Not Found|Cannot find latest/i.test(m)) return tr('Nenhuma versão publicada encontrada.')
  if (/403|rate limit/i.test(m)) return tr('Limite de consultas do GitHub atingido. Tente mais tarde.')
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET|ERR_NETWORK|net::/i.test(m)) return tr('Sem conexão com a internet.')
  return m.split('\n')[0].slice(0, 200)
}

async function check() {
  if (!app.isPackaged && !process.env.AC_UPDATE_URL) return push({ status: 'none', dev: true })
  if (['checking', 'downloading'].includes(state.status)) return
  push({ status: 'checking' })
  try { await autoUpdater.checkForUpdates() } catch (e) { push({ status: 'error', message: friendly(e) }) }
}

function init(win, { beforeInstall }) {
  getWin = win
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null
  if (process.env.AC_UPDATE_URL) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.AC_UPDATE_URL })
  }

  autoUpdater.on('update-available', (i) => push({ status: 'available', version: i.version, notes: notesText(i.releaseNotes), date: i.releaseDate }))
  autoUpdater.on('update-not-available', () => push({ status: 'none' }))
  autoUpdater.on('download-progress', (p) => push({ ...state, status: 'downloading', percent: p.percent, speed: p.bytesPerSecond, done: p.transferred, total: p.total }))
  autoUpdater.on('update-downloaded', (i) => push({ ...state, status: 'downloaded', version: i.version }))
  autoUpdater.on('error', (e) => push({ status: 'error', message: friendly(e), version: state.version }))

  ipcMain.handle('update:state', () => {
    const m = managed()
    return { ...state, current: app.getVersion(), ...(m ? { managed: m, upgrade: UPGRADE[m] || '' } : {}) }
  })
  ipcMain.on('update:check', () => check())
  ipcMain.on('update:download', () => {
    if (state.status !== 'available' || managed()) return
    // The Mac build is not code-signed, and macOS refuses to replace an unsigned app in place: open the download page instead.
    if (process.platform === 'darwin') return shell.openExternal('https://github.com/jvyctor/solti/releases/latest')
    push({ ...state, status: 'downloading', percent: 0 })
    autoUpdater.downloadUpdate().catch((e) => push({ status: 'error', message: friendly(e), version: state.version }))
  })
  ipcMain.on('update:install', () => {
    if (state.status !== 'downloaded') return
    beforeInstall() // skip the "quit?" confirmation
    autoUpdater.quitAndInstall(true, true) // silent installer, relaunch afterwards
  })

  const auto = () => { if (require('./settings.cjs').get().autoUpdate) check() }
  setTimeout(auto, 4000)
  timer = setInterval(auto, CHECK_EVERY)
}

module.exports = { init, stop: () => clearInterval(timer) }
