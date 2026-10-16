import { createContext } from 'react'

export const api = window.api
export const CommCtx = createContext(new Set()) // 'idA|idB' pairs currently talking
export const SettingsCtx = createContext(null) // app settings (see electron/settings.cjs) + { mode, eff }
export const PRESET_LABELS = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity', opencode: 'OpenCode', gemini: 'Gemini', shell: 'Shell' }
export const sinks = new Map() // pty id -> xterm.write
export const terms = new Map() // pty id -> xterm instance (copy/paste/select all)
export const mem = { clip: null, askFn: null } // clip: "copiar elemento" buffer; askFn: set by <App/> to show the Sim/Não dialog
export const ask = (msg) => (mem.askFn ? mem.askFn(msg) : Promise.resolve(true))
let seq = Date.now()
export const uid = (p) => p + seq++

api.onData((id, d) => sinks.get(id)?.(d))

// A copied terminal is a new agent: no shared worktree, no shared conversation.
export const fresh = (d) => ({ ...d, maestro: false, git: undefined, sid: undefined, ran: false })

// What the bridge may show agents about a node. Names of non-terminals are unique-ish; ids always work.
export const describe = (n, ws) => {
  const d = n.data
  const base = { id: n.id, ws, type: n.type }
  if (n.type === 'terminal') return { ...base, name: d.name, role: d.maestro ? 'maestro' : 'agent', maestro: !!d.maestro, cwd: d.cwd, git: d.git }
  if (n.type === 'note') return { ...base, name: `nota-${(d.title || n.id).toString().slice(0, 24)}`, text: d.text || '' }
  if (n.type === 'text') return { ...base, name: `texto-${n.id}`, text: d.text || '' }
  if (n.type === 'knowledge') return { ...base, name: 'conhecimento', text: d.text || '' }
  if (n.type === 'portal') return { ...base, name: `portal-${n.id}`, url: d.url }
  if (n.type === 'files') return { ...base, name: `arquivos-${n.id}`, path: d.path }
  if (n.type === 'diff') return { ...base, name: `revisao-${n.id}` }
  return null
}

export const PRESET_COLOR = { claude: 'claude', codex: 'codex', gemini: 'gemini', antigravity: 'gemini' }
export const shortPath = (p) => {
  const parts = (p || '').split(/[\\/]/).filter(Boolean)
  const sep = (p || '').includes('/') && !(p || '').includes('\\') ? '/' : '\\'
  return parts.length > 2 ? '…' + sep + parts.slice(-2).join(sep) : p
}

// Random "adjective-noun" names; checked against the workspace so they stay unique.
export const ADJ = ['veloz', 'calmo', 'astuto', 'bravo', 'sereno', 'agil', 'curioso', 'firme', 'sagaz', 'leve', 'audaz', 'nobre']
export const NOUN = ['falcao', 'lince', 'cometa', 'raio', 'atlas', 'orion', 'pixel', 'delta', 'fenix', 'nimbus', 'vento', 'cobalto']
export const randomName = (taken) => {
  for (let i = 0; i < 50; i++) {
    const n = `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}`
    if (!taken.has(n)) return n
  }
  return `agente-${taken.size + 1}`
}

export const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
export const AGENT_COLORS = { claude: '#e8845c', codex: '#3f8f78', gemini: '#4a7bd8' }
