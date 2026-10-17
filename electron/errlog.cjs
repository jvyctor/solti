// Main-process error log (userData/logs/main.log, rotated at 1 MB) and the "copy diagnostics" report.
// An uncaught error is written here and shown as a small notice instead of Electron's blocking error dialog.
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX = 1024 * 1024
let dir = ''

const init = (userData) => { dir = path.join(userData, 'logs') }
const file = () => path.join(dir, 'main.log')

function write(level, msg) {
  if (!dir) return
  try {
    fs.mkdirSync(dir, { recursive: true })
    try { if (fs.statSync(file()).size > MAX) fs.renameSync(file(), path.join(dir, 'main.1.log')) } catch {}
    fs.appendFileSync(file(), `${new Date().toISOString()} [${level}] ${String(msg).replace(/\r?\n/g, '\n    ')}\n`)
  } catch {}
}
const describe = (e) => (e && e.stack) || String(e)

// Last lines of the log, newest last.
function tail(lines = 200) {
  try { return fs.readFileSync(file(), 'utf8').split('\n').filter(Boolean).slice(-lines).join('\n') } catch { return '' }
}

// Plain-text report for bug reports: versions, system, agent checks and recent log lines. No tokens or file contents.
function report({ version, electron, diag = [], settings = {} }) {
  const agents = diag.map((d) => `  ${d.label}: ${d.installed ? `instalado ${d.version || ''}`.trim() : 'não instalado'}${d.installed ? `, login ${d.authenticated === false ? 'não' : d.authenticated ? 'sim' : '?'}, canvas ${d.mcp === false ? 'não registrado' : d.mcp ? 'registrado' : '?'}` : ''}`)
  return [
    `Solti ${version} (Electron ${electron}, Node ${process.versions.node})`,
    `Sistema: ${os.type()} ${os.release()} ${os.arch()}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    `Shell: ${settings.shell || '(padrão)'} · idioma: ${settings.language || 'auto'} · aprovação: ${settings.approval || '?'}`,
    'Agentes:',
    ...(agents.length ? agents : ['  (sem dados)']),
    '',
    'Log recente:',
    tail(150) || '(vazio)',
  ].join('\n')
}

module.exports = { init, write, describe, tail, report, file }
