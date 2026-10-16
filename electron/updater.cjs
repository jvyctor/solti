// Auto-update from GitHub Releases (electron-updater). The repo is private, so a read-only token
// pasted by the user is kept encrypted (safeStorage) in userData and sent as the auth header.
const { app, safeStorage, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs')
const path = require('path')

const CHECK_EVERY = 4 * 60 * 60 * 1000
const tokenFile = () => path.join(app.getPath('userData'), 'update-token')
let getWin = () => null
let state = { status: 'idle' }
let timer

const readToken = () => {
  try { return safeStorage.decryptString(fs.readFileSync(tokenFile())) } catch { return '' }
}
const writeToken = (t) => {
  if (!t) return fs.rmSync(tokenFile(), { force: true })
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema indisponível')
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(t))
}

const push = (p) => {
  state = { ...p, status: p.status, hasToken: !!readToken(), current: app.getVersion() }
  getWin()?.webContents.send('update:state', state)
}

// GitHub sends release notes as HTML; the UI shows plain text.
const notesText = (n) => {
  const s = Array.isArray(n) ? n.map((x) => x.note).join('\n\n') : n || ''
  return s.replace(/<\/(p|li|h\d)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
}

const friendly = (e) => {
  const m = String(e?.message || e)
  if (/401|403|404|Not Found|Bad credentials/i.test(m)) return 'Sem acesso às versões. Confira o token de acesso (repositório privado).'
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET|ERR_NETWORK|net::/i.test(m)) return 'Sem conexão com a internet.'
  return m.split('\n')[0].slice(0, 200)
}

function applyAuth() {
  const t = readToken()
  autoUpdater.requestHeaders = t ? { Authorization: `token ${t}` } : null
}

async function check() {
  if (!app.isPackaged && !process.env.AC_UPDATE_URL) return push({ status: 'none', dev: true })
  if (['checking', 'downloading'].includes(state.status)) return
  push({ status: 'checking' })
  applyAuth()
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

  ipcMain.handle('update:state', () => ({ ...state, hasToken: !!readToken(), current: app.getVersion() }))
  ipcMain.on('update:check', () => check())
  ipcMain.on('update:download', () => {
    if (state.status !== 'available') return
    push({ ...state, status: 'downloading', percent: 0 })
    autoUpdater.downloadUpdate().catch((e) => push({ status: 'error', message: friendly(e), version: state.version }))
  })
  ipcMain.on('update:install', () => {
    if (state.status !== 'downloaded') return
    beforeInstall() // skip the "quit?" confirmation
    autoUpdater.quitAndInstall(true, true) // silent installer, relaunch afterwards
  })
  ipcMain.handle('update:token', (_e, t) => { writeToken((t || '').trim()); push(state); return true })

  const auto = () => { if (require('./settings.cjs').get().autoUpdate) check() }
  setTimeout(auto, 4000)
  timer = setInterval(auto, CHECK_EVERY)
}

module.exports = { init, stop: () => clearInterval(timer) }
