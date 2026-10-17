// App settings persisted in userData/settings.json. Unknown keys from older files are kept; missing ones get defaults.
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  // Geral > Sistema
  powerSave: 'agents', // never | agents | always
  confirmQuit: false,
  handCursor: true,
  // Geral > Tela
  appearance: 'dark', // system | light | dark
  theme: 'classic', // preset id (src/themes.js)
  custom: {}, // per-user overrides of the preset; null removes a key
  showMinimap: false,
  // Geral > Notificações
  notifyIdle: true,
  idleSeconds: 6,
  notifyDone: true, // an agent called canvas_done
  notifyWaiting: true, // an agent is asking you something
  notifyPipeline: true, // a pipeline finished or stopped
  autoUpdate: true,
  language: 'auto', // auto | pt | en
  onboarded: false, // first-run welcome already shown
  // Controle remoto (celular)
  remoteEnabled: false,
  remotePort: 7443,
  remoteHttp: false, // also serve plain HTTP (opt-in)
  // Terminal
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  cursorBlink: true,
  scrollback: 5000,
  termScheme: 'auto', // auto | dracula | nord | ... (src/themes.js)
  termBg: '', // empty = follow scheme
  termFg: '',
  termCursor: '',
  termSelection: '',
  cursorStyle: 'block', // block | bar | underline
  fontWeight: 'normal', // normal | 500 | 600
  lineHeight: 1,
  letterSpacing: 0,
  termPadding: 12,
  shell: '',
  // Agentes
  approval: 'spawn', // ask the user before agents act on each other: off | spawn (create agents) | all (also messages and portal control)
  tokenLimit: 0, // per-agent token limit (Claude Code only); 0 = off
  prices: {}, // overrides of electron/pricing.cjs, US$ per 1M tokens: { prefix: { in, out, cw, cr } | null }
  sendBriefing: true,
  historyInput: true, // record what you type into agents (not plain shells, not after a password prompt) in their history
  commands: { claude: 'claude', codex: 'codex', gemini: 'gemini', antigravity: 'agy', opencode: 'opencode' },
}

let file = ''
let cur = DEFAULTS

// custom: a null value deletes that override; {custom:null} clears them all.
const mergeCustom = (base, patch) => {
  if (patch === null) return {}
  const out = { ...base, ...(patch || {}) }
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k]
  return out
}
const merge = (base, patch) => ({
  ...base,
  ...patch,
  commands: { ...base.commands, ...(patch?.commands || {}) },
  custom: patch && 'custom' in patch ? mergeCustom(base.custom, patch.custom) : base.custom || {},
})

function init(userData) {
  file = path.join(userData, 'settings.json')
  try { cur = merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { cur = DEFAULTS }
}
const get = () => cur
function set(patch) {
  cur = merge(cur, patch)
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(cur, null, 2)) } catch {}
  return cur
}
const reset = () => set(JSON.parse(JSON.stringify({ ...DEFAULTS })))

module.exports = { init, get, set, reset, DEFAULTS, dir: () => path.dirname(file) }
