import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import SettingsDialog from './Settings.jsx'
import { useUpdate, UpdateToast, UpdateDialog } from './Updates.jsx'
import { classify, STATUS } from './status.js'
import DiffNode from './DiffNode.jsx'
import { ActivityDock, ApprovalDialog } from './Activity.jsx'
import { resolveTheme, applyTheme, termOptions } from './themes.js'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, ConnectionMode, BaseEdge, useInternalNode, MiniMap, NodeResizer, Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow, useViewport } from '@xyflow/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, RefreshCw, Map as MapIcon, ArrowLeft, FolderTree, Folder, FolderOpen, Lock, SquareTerminal,
  Search, Menu as MenuIcon, Settings as SettingsIcon, Plus, Minus, ChevronRight, ChevronDown, Activity, Check, FileText, GitBranch, BookOpen, Square,
} from 'lucide-react'

const api = window.api
const CommCtx = createContext(new Set()) // 'idA|idB' pairs currently talking
const SettingsCtx = createContext(null) // app settings (see electron/settings.cjs) + { mode, eff }
const PRESET_LABELS = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity', opencode: 'OpenCode', gemini: 'Gemini', shell: 'Shell' }
const sinks = new Map() // pty id -> xterm.write
const terms = new Map() // pty id -> xterm instance (copy/paste/select all)
let clip = null // "copiar elemento" buffer
let askFn = null // set by <App/>: shows the Sim/Não dialog
const ask = (msg) => (askFn ? askFn(msg) : Promise.resolve(true))
let seq = Date.now()
const uid = (p) => p + seq++

api.onData((id, d) => sinks.get(id)?.(d))

// A copied terminal is a new agent: no shared worktree, no shared conversation.
const fresh = (d) => ({ ...d, maestro: false, git: undefined, sid: undefined, ran: false })
// What the bridge may show agents about a node. Names of non-terminals are unique-ish; ids always work.
const describe = (n, ws) => {
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
const PRESET_COLOR = { claude: 'claude', codex: 'codex', gemini: 'gemini', antigravity: 'gemini' }
const shortPath = (p) => {
  const parts = (p || '').split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? '…\\' + parts.slice(-2).join('\\') : p
}

// Random "adjective-noun" names; checked against the workspace so they stay unique.
const ADJ = ['veloz', 'calmo', 'astuto', 'bravo', 'sereno', 'agil', 'curioso', 'firme', 'sagaz', 'leve', 'audaz', 'nobre']
const NOUN = ['falcao', 'lince', 'cometa', 'raio', 'atlas', 'orion', 'pixel', 'delta', 'fenix', 'nimbus', 'vento', 'cobalto']
const randomName = (taken) => {
  for (let i = 0; i < 50; i++) {
    const n = `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}`
    if (!taken.has(n)) return n
  }
  return `agente-${taken.size + 1}`
}

// Invisible handle laid over the node's border band: dragging from any point on the edge starts a rope.
function Ring() {
  return <Handle id="ring" type="source" position={Position.Right} className="ring" />
}

function TerminalNode({ id, data, selected }) {
  const host = useRef(null)
  const { updateNodeData, deleteElements, setNodes, getNodes } = useReactFlow()

  const dataRef = useRef(data)
  dataRef.current = data
  const [cwd, setCwd] = useState('')
  const [status, setStatus] = useState(null) // working | input | idle | exited | limit (agents only)
  const [tokens, setTokens] = useState(0)
  const cfg = useContext(SettingsCtx)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const termRef = useRef(null)
  const fitRef = useRef(null)

  useEffect(() => {
    if (data.unloaded) return
    const c = cfgRef.current
    const term = new Terminal(termOptions(c, c.mode))
    termRef.current = term
    // Conversation id: the first start assigns it, later starts (restart, reload) resume that conversation.
    const sid = dataRef.current.sid || crypto.randomUUID()
    if (!dataRef.current.sid) updateNodeData(id, { sid, ran: true })
    else if (!dataRef.current.ran) updateNodeData(id, { ran: true })
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    const ser = new SerializeAddon()
    term.loadAddon(ser)
    term.open(host.current)
    fit.fit()
    terms.set(id, term)
    // Output is held until the saved screen (or the live pty buffer) has been written, so order is kept.
    let idle, settle, cur, ready = false
    const held = []
    const show = (d) => {
      term.write(d)
      if (dataRef.current.preset !== 'shell') {
        if (cur !== 'working') { cur = 'working'; setStatus('working') }
        clearTimeout(settle)
        settle = setTimeout(() => {
          const b = term.buffer.active
          const lines = []
          for (let i = Math.max(0, b.length - 6); i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) || '')
          cur = classify(lines)
          setStatus(cur)
          if (cur === 'input' && !document.hasFocus() && cfgRef.current.notifyIdle) new Notification(dataRef.current.name, { body: 'Está esperando você.' })
        }, 2500)
      }
      if (dataRef.current.monitor && cfgRef.current.notifyIdle) {
        clearTimeout(idle)
        const secs = cfgRef.current.idleSeconds
        idle = setTimeout(() => new Notification(dataRef.current.name, { body: `Atividade parou (${secs} s sem saída).` }), secs * 1000)
      }
    }
    sinks.set(id, (d) => (ready ? show(d) : held.push(d)))
    let dirty = false
    const mark = term.onWriteParsed(() => { dirty = true })
    const save = () => { if (ready && dirty) { dirty = false; api.termSave(id, ser.serialize({ scrollback: 1000 })) } }
    const timer = setInterval(save, 5000)
    window.addEventListener('beforeunload', save)
    Promise.all([api.termLoad(id), api.spawn(id, { preset: data.preset, name: data.name, maestro: !!data.maestro, instructions: data.instructions, cwd: data.cwd, cols: term.cols, rows: term.rows, resume: !!dataRef.current.ran, sid, knowledge: getNodes().find((n) => n.type === 'knowledge')?.data.text || '' })]).then(([saved, r]) => {
      setCwd(r.cwd)
      if (r.buf) term.write(r.buf) // pty still alive (reload): its buffer is newer than the file
      // Pushed into scrollback: the shell's startup clear only wipes the visible screen.
      else if (saved) term.write(saved + '\r\n\x1b[2m--- sessão anterior ---\x1b[0m' + '\r\n'.repeat(term.rows))
      ready = true
      held.forEach(show)
      dirty = false
    })
    const sub = term.onData((d) => api.write(id, d))
    const offExit = api.onExit((eid) => { if (eid === id) { clearTimeout(settle); cur = 'exited'; setStatus('exited') } })
    const ro = new ResizeObserver(() => {
      try { fit.fit(); api.resize(id, term.cols, term.rows) } catch {}
    })
    ro.observe(host.current)
    return () => { save(); offExit(); clearInterval(timer); clearTimeout(idle); clearTimeout(settle); window.removeEventListener('beforeunload', save); mark.dispose(); terms.delete(id); sinks.delete(id); sub.dispose(); ro.disconnect(); term.dispose() }
  }, [id, data.rev, data.unloaded])

  // Claude Code only: its token use is read from its session log; over the limit, the agent is interrupted once.
  const limitHit = useRef(false)
  useEffect(() => {
    if (data.preset !== 'claude' || !data.sid || data.unloaded) return
    const poll = () => api.agentTokens(data.sid).then((r) => {
      setTokens(r.tokens)
      const max = cfgRef.current.tokenLimit
      if (max > 0 && r.tokens >= max && !limitHit.current) {
        limitHit.current = true
        api.interrupt(id)
        setStatus('limit')
        new Notification(data.name, { body: `Limite de ${fmt(max)} tokens atingido; agente interrompido.` })
      }
      if (!(max > 0 && r.tokens >= max)) limitHit.current = false
    })
    poll()
    const t = setInterval(poll, 15000)
    return () => clearInterval(t)
  }, [data.sid, data.preset, data.unloaded])

  // Style changes apply to open terminals without restarting them.
  const opts = termOptions(cfg, cfg.mode)
  const optsKey = JSON.stringify(opts)
  useEffect(() => {
    const t = termRef.current
    if (!t) return
    Object.assign(t.options, opts)
    try { fitRef.current?.fit(); api.resize(id, t.cols, t.rows) } catch {}
  }, [optsKey, cfg.termPadding])

  // Only one maestro per workspace.
  const setRole = (maestro) =>
    setNodes((ns) => ns.map((n) => (n.type !== 'terminal' ? n : { ...n, data: { ...n.data, maestro: n.id === id ? maestro : maestro ? false : n.data.maestro } })))

  return (
    <div className={'tnode' + (selected ? ' selected' : '') + (data.maestro ? ' maestro' : '')}>
      <NodeResizer minWidth={300} minHeight={180} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <i className="dot" style={{ background: AGENT_COLORS[PRESET_COLOR[data.preset]] || '#8b93a5' }} title={data.preset} />
        <input data-rename={id} value={data.name} onChange={(e) => updateNodeData(id, { name: e.target.value })} />
        <span className="spacer" />
        {status && <span className={'stat ' + status} title={STATUS[status].label}><i style={{ background: STATUS[status].color }} />{STATUS[status].label}</span>}
        {tokens > 0 && <span className={'tok' + (cfg.tokenLimit > 0 && tokens >= cfg.tokenLimit ? ' over' : '')} title="Tokens usados por este agente (entrada + cache novo + saída)">{fmt(tokens)} tok</span>}
        {data.monitor && <Activity className="mon" size={13} aria-label="Monitorando atividade" />}
        <select className={'rolepill' + (data.maestro ? ' maestro' : '')} value={data.maestro ? 'maestro' : 'agent'} onChange={(e) => setRole(e.target.value === 'maestro')} title="Papel (use Reenviar briefing no menu para aplicar)">
          <option value="agent">Agente</option>
          <option value="maestro">Maestro</option>
        </select>
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="tbody nodrag nowheel" ref={host} style={{ background: opts.theme.background, padding: `4px ${cfg.termPadding}px`, ...(data.blur ? { filter: 'blur(6px)' } : {}) }} />
      <div className="tfoot" title={cwd}><Folder size={12} /> {shortPath(cwd)}{data.git && <span className="branch" title={data.git.worktree ? `worktree de ${data.git.base}` : 'branch da pasta'}><GitBranch size={12} /> {data.git.branch}</span>}</div>
      {data.unloaded && (
        <div className="unloaded">
          <button onClick={() => updateNodeData(id, { unloaded: false })}>Descarregado: carregar</button>
        </div>
      )}
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}

// Tiny markdown view: #/## headings, "- " bullets, "1. " items, everything else monospace text.
function MdLite({ text }) {
  return (
    <>
      {text.split('\n').map((l, i) => {
        if (l.startsWith('## ')) return <h3 key={i}>{l.slice(3)}</h3>
        if (l.startsWith('# ')) return <h2 key={i}>{l.slice(2)}</h2>
        if (/^(- |\d+\. )/.test(l)) return <p key={i} className="li">{l}</p>
        return <p key={i}>{l || ' '}</p>
      })}
    </>
  )
}

// Shared project memory: one per workspace. Agents read it at startup and via canvas_knowledge; they append via canvas_remember.
function KnowledgeNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  return (
    <div className={'note knowledge' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={240} minHeight={160} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="note-head">
        <BookOpen size={14} aria-label="Conhecimento" />
        <span className="k-title">Conhecimento do projeto</span>
        <button aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={12} /></button>
      </div>
      <textarea className="note-body nodrag nowheel" value={data.text || ''} placeholder="Fatos que todos os agentes devem saber: stack, comandos, decisões…" onChange={(e) => updateNodeData(id, { text: e.target.value })} />
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}

function NoteNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const [edit, setEdit] = useState(!data.text)
  return (
    <div className={'note' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={180} minHeight={110} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="note-head">
        <input className="nodrag" value={data.title || ''} placeholder="Nota" onChange={(e) => updateNodeData(id, { title: e.target.value })} />
        <button aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={12} /></button>
      </div>
      {edit ? (
        <textarea className="note-body nodrag nowheel" autoFocus value={data.text || ''} onChange={(e) => updateNodeData(id, { text: e.target.value })} onBlur={() => setEdit(false)} />
      ) : (
        <div className="note-body view nowheel" onDoubleClick={() => setEdit(true)} title="Duplo clique para editar">
          <MdLite text={data.text || ''} />
        </div>
      )}
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}

// Edge that leaves each node on the side facing the other node, so lines look natural wherever nodes sit.
function FloatingEdge({ id, source, target, markerEnd, style }) {
  const { eff } = useContext(SettingsCtx)
  const sagK = eff.edgeSag // hooks stay above any early return: fixed order
  const pairs = useContext(CommCtx)
  const talking = eff.commHighlight && pairs.has([source, target].sort().join('|'))
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s?.measured?.width || !t?.measured?.width) return null
  const box = (n) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width, h: n.measured.height })
  const edgePoint = (a, b) => {
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2
    const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy
    const horizontal = Math.abs(dx) / a.w > Math.abs(dy) / a.h
    const k = 0.5 / Math.max(Math.abs(dx) / a.w, Math.abs(dy) / a.h || 1e-6)
    const pos = horizontal ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
    return { x: cx + dx * k, y: cy + dy * k, pos }
  }
  const a = box(s), b = box(t)
  const p1 = edgePoint(a, b), p2 = edgePoint(b, a)
  // Hanging rope: both control points are pulled down by "gravity"; longer span = deeper sag.
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const sag = Math.min(220, 30 + Math.hypot(dx, dy) * 0.28) * sagK
  const drop = sag * 1.33 // cubic midpoint sits at 0.75 of the control offset
  const path = `M ${p1.x},${p1.y} C ${p1.x + dx * 0.12},${p1.y + drop} ${p2.x - dx * 0.12},${p2.y + drop} ${p2.x},${p2.y}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={talking ? 'comm' : undefined} interactionWidth={28} />
}
const edgeTypes = { floating: FloatingEdge }
const GRID_VARIANT = { lines: BackgroundVariant.Lines, dots: BackgroundVariant.Dots, cross: BackgroundVariant.Cross }

// Frame that labels a cluster of nodes. shortcut: children are not parented, so moving the group does not move them.
function GroupNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className="group">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <input value={data.name || ''} placeholder="Grupo" onChange={(e) => updateNodeData(id, { name: e.target.value })} />
    </div>
  )
}

function TextNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  return <textarea className="textnode nodrag" value={data.text || ''} placeholder="Texto" onChange={(e) => updateNodeData(id, { text: e.target.value })} />
}

// Browser portal: an embedded webview with a URL bar.
function PortalNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const view = useRef(null)
  const [url, setUrl] = useState(data.url || 'https://www.google.com')
  // Lets agents read the page: main finds this <webview>'s webContents by node id.
  useEffect(() => {
    const v = view.current
    const reg = () => api.portalRegister(id, v.getWebContentsId())
    v?.addEventListener('dom-ready', reg)
    return () => v?.removeEventListener('dom-ready', reg)
  }, [id])
  const go = () => {
    const u = /^[a-z]+:\/\//i.test(url) ? url : 'https://' + url
    updateNodeData(id, { url: u })
    view.current?.loadURL?.(u)
  }
  return (
    <div className={'tnode' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={320} minHeight={220} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} /><Ring />
      <div className="thead">
        <button className="x on" aria-label="Voltar" onClick={() => view.current?.goBack?.()}><ArrowLeft size={14} /></button>
        <button className="x on" aria-label="Recarregar" onClick={() => view.current?.reload?.()}><RefreshCw size={14} /></button>
        <input className="role" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <webview ref={view} src={data.url || 'https://www.google.com'} className="tbody nodrag nowheel" style={{ flex: 1, background: '#fff' }} partition="persist:portal" />
    </div>
  )
}

const nodeTypes = { terminal: TerminalNode, note: NoteNode, group: GroupNode, text: TextNode, portal: PortalNode, files: FilesNode, diff: DiffNode, knowledge: KnowledgeNode }

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
const resetText = (ts) => {
  const m = Math.max(0, Math.round((ts * 1000 - Date.now()) / 60000))
  const plural = (v, u) => `${v} ${u}${v === 1 ? '' : 's'}`
  if (ts * 1000 < Date.now()) return 'Janela reiniciada (sem dado novo)'
  if (m >= 2880) return `Redefine em ${Math.round(m / 1440)} dias`
  if (m >= 1440) return 'Redefine amanhã'
  if (m >= 60) return `Redefine em ${plural(Math.round(m / 60), 'hora')}`
  return `Redefine em ${plural(m, 'minuto')}`
}

const AGENT_COLORS = { claude: '#e8845c', codex: '#3f8f78', gemini: '#4a7bd8' }

// Two concentric rings: outer = session, inner = weekly.
function Rings({ color, session = 0, weekly = 0, size = 72, stroke = 7 }) {
  const ring = (r, pct) => {
    const c = 2 * Math.PI * r
    return (
      <>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeOpacity=".22" strokeWidth={stroke} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * Math.min(pct, 100)) / 100} ${c}`} transform="rotate(-90 50 50)" />
      </>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {ring(42, session)}
      {ring(28, weekly)}
    </svg>
  )
}

function SegBar({ color, pct }) {
  const N = 40
  const on = Math.round((Math.min(pct || 0, 100) / 100) * N)
  return (
    <div className="seg">
      {Array.from({ length: N }, (_, i) => (
        <i key={i} style={{ background: color, opacity: i < on ? 1 : 0.22 }} />
      ))}
    </div>
  )
}

function AgentUsage({ name, plan, color, session, weekly, note }) {
  return (
    <section className="agent">
      <header>
        <Rings color={color} session={session?.pct ?? 0} weekly={weekly?.pct ?? 0} />
        <div>
          <b>{name}</b>
          <small>{plan}</small>
        </div>
      </header>
      {session ? (
        <>
          <div className="urow"><span>Sessão</span><b>{Math.round(session.pct)}%</b></div>
          <SegBar color={color} pct={session.pct} />
          <small>{session.resets_at ? resetText(session.resets_at) : ''}</small>
          {weekly && (
            <>
              <div className="urow"><span>Semanal</span><b>{Math.round(weekly.pct)}%</b></div>
              <SegBar color={color} pct={weekly.pct} />
              <small>{weekly.resets_at ? resetText(weekly.resets_at) : ''}</small>
            </>
          )}
        </>
      ) : (
        <small>{note}</small>
      )}
    </section>
  )
}

// Normalises each provider's payload to { pct, resets_at (unix seconds) }.
function useAgents() {
  const [u, setU] = useState(null)
  const load = useCallback(() => api.usage().then(setU), [])
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])
  const cq = u?.claudeQuota
  const cx = u?.codex
  const agents = [
    {
      key: 'claude', name: 'Claude Code', plan: cq?.plan ? cq.plan[0].toUpperCase() + cq.plan.slice(1) : '',
      session: cq?.session && { pct: cq.session.utilization, resets_at: Date.parse(cq.session.resets_at) / 1000 },
      weekly: cq?.weekly && { pct: cq.weekly.utilization, resets_at: Date.parse(cq.weekly.resets_at) / 1000 },
      note: u?.claude ? `${cq?.error || 'sem dados'} · ${fmt(u.claude.h5)} tokens em 5 h, ${fmt(u.claude.d7)} em 7 dias` : 'carregando…',
    },
    {
      key: 'codex', name: 'Codex', plan: cx?.plan ? cx.plan[0].toUpperCase() + cx.plan.slice(1) : '',
      session: cx?.session && { pct: cx.session.used_percent, resets_at: cx.session.resets_at },
      weekly: cx?.weekly && { pct: cx.weekly.used_percent, resets_at: cx.weekly.resets_at },
      note: u ? 'sem dados locais' : 'carregando…',
    },
    { key: 'gemini', name: 'Gemini / Antigravity', plan: '', note: 'cota não disponível localmente' },
  ]
  return { agents, load }
}

function UsageDock() {
  const [open, setOpen] = useState(false)
  const { agents, load } = useAgents()
  const root = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => !root.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={root} className="usage-root">
      {open && (
        <div className="usage">
          <h4>Uso dos agentes <span><button onClick={load} aria-label="Atualizar" title="Atualizar"><RefreshCw size={15} /></button><button onClick={() => setOpen(false)} aria-label="Fechar" title="Fechar"><X size={16} /></button></span></h4>
          <div className="usage-scroll">
            {agents.map((a) => <AgentUsage key={a.key} color={AGENT_COLORS[a.key]} {...a} />)}
          </div>
          <button className="stop-all" onClick={() => api.interrupt()} title="Envia Esc e Ctrl+C para todos os terminais"><Square size={13} /> Interromper todos os agentes</button>
        </div>
      )}
      <button className="dock" onClick={() => setOpen((o) => !o)} aria-label="Uso dos agentes" aria-expanded={open} title="Uso dos agentes">
        {agents.map((a) => (
          <Rings key={a.key} size={26} stroke={10} color={AGENT_COLORS[a.key]} session={a.session?.pct ?? 0} weekly={a.weekly?.pct ?? 0} />
        ))}
      </button>
    </div>
  )
}

function Zoom({ children }) {
  const { zoomIn, zoomOut, setViewport } = useReactFlow()
  const { zoom } = useViewport()
  const [map, setMap] = useState(useContext(SettingsCtx).showMinimap)
  const color = (n) => (n.type === 'note' ? '#cfc27a' : n.type === 'group' ? '#2a2f3a' : '#2f7bff')
  return (
    <div className="zoom">
      {map && (
        <div className="mapbox">
          <MiniMap pannable zoomable nodeColor={color} nodeStrokeWidth={0} maskColor="rgba(15,17,21,.6)" style={{ position: 'static', margin: 0, width: 260, height: 150, background: 'transparent' }} />
          <button onClick={() => setMap(false)} aria-label="Fechar mapa"><X size={12} /></button>
        </div>
      )}
      {children}
      <button className={'mapbtn' + (map ? ' on' : '')} onClick={() => setMap((m) => !m)} aria-label="Navegação" title="Navegação"><MapIcon size={18} /></button>
      <div className="zoompill">
        <button onClick={() => zoomOut({ duration: 150 })} aria-label="Diminuir zoom"><Minus size={16} /></button>
        <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 150 })} title="100%">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomIn({ duration: 150 })} aria-label="Aumentar zoom"><Plus size={16} /></button>
      </div>
    </div>
  )
}

// Items: { label, run, sub:[…], checked, danger, disabled } or '-'. Radix gives keyboard nav, typeahead,
// collision-aware submenus and focus handling.
function MenuItems({ items }) {
  if (items.length === 0) return <div className="mi disabled">vazio</div>
  return items.map((it, i) =>
    it === '-' ? (
      <DropdownMenu.Separator key={i} className="menu-sep" />
    ) : it.sub ? (
      <DropdownMenu.Sub key={i}>
        <DropdownMenu.SubTrigger className="mi">
          <span>{it.label}</span>
          <ChevronRight size={14} />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent className="menu" sideOffset={6} alignOffset={-7}>
            <MenuItems items={it.sub} />
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    ) : (
      <DropdownMenu.Item key={i} className={'mi' + (it.danger ? ' danger' : '')} disabled={it.disabled} onSelect={() => it.run()}>
        <span>{it.label}</span>
        {it.checked && <Check size={14} />}
      </DropdownMenu.Item>
    ),
  )
}

// Opened programmatically at the pointer: a zero-size fixed anchor stands in for the trigger.
function Menu({ x, y, items, onClose }) {
  return (
    <DropdownMenu.Root open onOpenChange={(o) => !o && onClose()}>
      <DropdownMenu.Trigger asChild>
        <span className="menu-anchor" style={{ left: x, top: y }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="start" sideOffset={2} onCloseAutoFocus={(e) => e.preventDefault()}>
          <MenuItems items={items} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// Modal for "Novo Terminal…": name, agent and project (local folder or git URL) with optional per-agent worktree.
function NewTerminalDialog({ initialName, onCreate, onClose }) {
  const [name, setName] = useState(initialName)
  const [preset, setPreset] = useState('shell')
  const [src, setSrc] = useState('dir') // dir | url
  const [dir, setDir] = useState('')
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null) // { isRepo, branches, branch }
  const [base, setBase] = useState('')
  const [isolate, setIsolate] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const inspect = async (d) => {
    setErr(''); setInfo(null)
    if (!d) return
    const r = await api.gitInfo(d)
    setInfo(r)
    if (r.isRepo) setBase(r.branch)
  }
  const pick = async () => { const d = await api.pickFolder(); if (d) { setDir(d); inspect(d) } }
  const fetchBranches = async () => {
    setErr(''); setInfo(null); setBusy('Buscando branches…')
    const r = await api.gitRemoteBranches(url.trim())
    setBusy('')
    if (r.error) return setErr(r.error)
    setInfo({ isRepo: true, branches: r.branches })
    setBase(r.branches.includes('main') ? 'main' : r.branches.includes('master') ? 'master' : r.branches[0] || '')
  }
  const gitReady = info?.isRepo
  const submit = async (e) => {
    e.preventDefault()
    const n = name || initialName
    if (src === 'dir' && (!dir || !gitReady)) return onCreate({ name: n, preset, cwd: dir || undefined })
    if (src === 'url' && !gitReady) return setErr('Clique em "Buscar branches" primeiro.')
    setErr(''); setBusy(src === 'url' ? 'Clonando e preparando…' : 'Preparando…')
    const r = await api.gitPrepare({ ...(src === 'url' ? { url: url.trim() } : { dir }), base, isolate, agent: n })
    setBusy('')
    if (r.error) return setErr(r.error)
    onCreate({ name: n, preset, cwd: r.cwd, git: r.git || undefined })
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide" aria-describedby={undefined}>
          <form onSubmit={submit}>
            <Dialog.Title className="dlg-title">Novo terminal</Dialog.Title>
            <label>Nome<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Agente
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {Object.entries(PRESET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="seg" role="tablist" aria-label="Origem do projeto">
              <button type="button" role="tab" aria-selected={src === 'dir'} className={src === 'dir' ? 'on' : ''} onClick={() => { setSrc('dir'); setInfo(null); setErr(''); inspect(dir) }}>Pasta do computador</button>
              <button type="button" role="tab" aria-selected={src === 'url'} className={src === 'url' ? 'on' : ''} onClick={() => { setSrc('url'); setInfo(null); setErr('') }}>Link do Git</button>
            </div>
            {src === 'dir' ? (
              <label>Pasta do projeto (opcional)
                <span className="row"><input value={dir} placeholder="C:\projetos\meu-app" onChange={(e) => { setDir(e.target.value); setInfo(null) }} onBlur={() => inspect(dir)} /><button type="button" onClick={pick}>Escolher…</button></span>
              </label>
            ) : (
              <label>URL do repositório
                <span className="row"><input value={url} placeholder="https://github.com/usuario/projeto.git" onChange={(e) => { setUrl(e.target.value); setInfo(null) }} /><button type="button" disabled={!url.trim() || !!busy} onClick={fetchBranches}>Buscar branches</button></span>
              </label>
            )}
            {src === 'dir' && dir && info && !info.isRepo && <p className="hint">Não é um repositório git: o terminal abre direto na pasta, sem isolamento.</p>}
            {gitReady && (
              <>
                <label>Branch de partida
                  <select value={base} onChange={(e) => setBase(e.target.value)}>
                    {info.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} />
                  <span>Isolar em worktree <small>(branch própria <code>canvas/{(name || initialName).toLowerCase()}</code> a partir de {base || '…'})</small></span>
                </label>
                {!isolate && src === 'dir' && <p className="hint">Sem isolamento, o terminal troca a branch da pasta para <b>{base}</b>.</p>}
              </>
            )}
            {err && <p className="err">{err}</p>}
            <div className="dlg-actions">
              <Dialog.Close asChild><button type="button" disabled={!!busy}>Cancelar</button></Dialog.Close>
              <button type="submit" className="primary" disabled={!!busy}>{busy || 'Criar'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Lazy directory tree. shortcut: listing is not watched; re-open the folder to refresh.
function Dir({ path, name, depth = 0 }) {
  const [kids, setKids] = useState(null)
  const [open, setOpen] = useState(depth === 0)
  useEffect(() => {
    if (open && !kids) api.ls(path).then((r) => setKids(r.entries || []))
  }, [open])
  return (
    <div>
      <div className="ftree-row" style={{ paddingLeft: depth * 12 }} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={14} /> : <Folder size={14} />} {name}
      </div>
      {open && kids?.map((k) =>
        k.dir ? (
          <Dir key={k.name} path={path + '\\' + k.name} name={k.name} depth={depth + 1} />
        ) : (
          <div key={k.name} className="ftree-row file" style={{ paddingLeft: (depth + 1) * 12 + 13 }}><FileText size={13} /> {k.name}</div>
        ),
      )}
    </div>
  )
}

function FilesNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const [path, setPath] = useState(data.path || '')
  const [root, setRoot] = useState(null)
  const load = (p) => api.ls(p).then((r) => { if (!r.error) { setRoot(r.dir); setPath(r.dir); updateNodeData(id, { path: r.dir }) } })
  useEffect(() => { load(data.path || '') }, [])
  return (
    <div className={'tnode' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={220} minHeight={180} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} /><Ring />
      <div className="thead">
        <FolderTree size={15} aria-label="Árvore de arquivos" />
        <input className="pathin" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(path)} />
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="tbody ftree nodrag nowheel">{root && <Dir key={root} path={root} name={root.split(/[\\/]/).pop() || root} />}</div>
    </div>
  )
}

function Canvas({ ws, update, scores, saveScore, insertScore }) {
  const cfg = useContext(SettingsCtx)
  const [menu, setMenu] = useState(null)
  const setNodes = useCallback((fn) => update((w) => ({ ...w, nodes: fn(w.nodes) })), [update])
  const onNodesChange = useCallback(
    (c) => {
      // Keyboard delete bypasses the ✕ button: still stop the pty.
      c.forEach((x) => x.type === 'remove' && api.kill(x.id))
      setNodes((n) => applyNodeChanges(c, n))
    },
    [setNodes],
  )
  const onEdgesChange = useCallback((c) => update((w) => ({ ...w, edges: applyEdgeChanges(c, w.edges) })), [update])
  // One rope per node pair, whichever handles/directions were used.
  const link = useCallback(
    (source, target) =>
      source &&
      target &&
      source !== target &&
      update((w) =>
        w.edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))
          ? w
          : { ...w, edges: addEdge({ source, target, type: 'floating' }, w.edges) },
      ),
    [update],
  )
  const onConnect = useCallback((c) => link(c.source, c.target), [link])
  // Dropped anywhere on a node's body (not just a handle): connect to the node under the pointer.
  const onConnectEnd = useCallback(
    (e, state) => {
      const p = e.changedTouches?.[0] || e
      const el = document.elementFromPoint(p.clientX, p.clientY)?.closest?.('.react-flow__node')
      if (el && state?.fromNode) link(state.fromNode.id, el.dataset.id)
    },
    [link],
  )
  const count = ws.nodes.filter((n) => n.type === 'terminal').length
  // Older saved edges are animated/default-typed: normalise for display only.
  const shownEdges = useMemo(() => ws.edges.map((e) => ({ ...e, type: 'floating', animated: false })), [ws.edges])

  const SIZES = { terminal: { width: 520, height: 340 }, portal: { width: 560, height: 380 }, group: { width: 640, height: 400 }, files: { width: 280, height: 360 }, diff: { width: 560, height: 400 }, knowledge: { width: 320, height: 240 }, note: { width: 280, height: 200 } }
  const { screenToFlowPosition, deleteElements } = useReactFlow()
  // Every deletion path (✕, menu, keyboard) funnels through here; ptys die in onNodesChange afterwards.
  const onBeforeDelete = async ({ nodes, edges }) => {
    const t = nodes.filter((n) => n.type === 'terminal')
    if (!t.length) return { nodes, edges }
    const wt = t.filter((n) => n.data.git?.worktree)
    const dirty = await Promise.all(wt.map(async (n) => (await api.gitDirty(n.data.cwd)).dirty))
    const note = !wt.length ? '' : dirty.some(Boolean) ? ' Há worktree com alterações não salvas: ele será mantido.' : ' O worktree será removido (a branch continua no repositório).'
    const msg = (t.length === 1 ? `Excluir o terminal "${t[0].data.name}"?` : `Excluir ${t.length} terminais?`) + note
    if (!(await ask(msg))) return false
    // The pty must die first or Windows keeps the folder locked.
    wt.forEach((n, i) => { if (!dirty[i]) { api.kill(n.id); setTimeout(() => api.gitRemoveWorktree(n.data.cwd), 500) } })
    return { nodes, edges }
  }
  const [dlg, setDlg] = useState(null) // { pos } while "Novo Terminal…" is open
  const add = (type, data, pos) =>
    setNodes((n) => [
      ...n,
      { id: uid('n'), type, position: pos || { x: 60 + n.length * 40, y: 60 + n.length * 40 }, data, style: SIZES[type], ...(type === 'group' && { zIndex: -1 }) },
    ])
  const addTerminal = (preset, pos, extra = {}) =>
    add('terminal', { name: randomName(new Set(ws.nodes.map((n) => n.data.name))), preset, maestro: count === 0, ...extra }, pos)

  // Terminals' setNodes (maestro toggle, rename) go through onNodesChange; notes from agents land here.
  useEffect(() => api.onNote(({ from, text }) => add('note', { title: from, text })), [])

  const patch = (id, d) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...d } } : n)))
  const spawnCopy = (n, off = 40) =>
    setNodes((ns) => [...ns, { ...n, id: uid('n'), selected: false, position: { x: n.position.x + off, y: n.position.y + off }, data: { ...fresh(n.data) } }])
  const focusInput = (attr, id) => setTimeout(() => { const el = document.querySelector(`[${attr}="${id}"]`); el?.focus(); el?.select?.() }, 0)

  const nodeMenu = (n) => {
    const t = n.type === 'terminal'
    const d = n.data
    return [
      ...(t
        ? [
            { label: 'Copiar', run: () => navigator.clipboard.writeText(terms.get(n.id)?.getSelection() || ''), disabled: !terms.get(n.id)?.hasSelection() },
            { label: 'Colar', run: () => navigator.clipboard.readText().then((s) => api.write(n.id, s)) },
            { label: 'Selecionar tudo', run: () => terms.get(n.id)?.selectAll() },
            '-',
          ]
        : []),
      ...(n.type !== 'note' && n.type !== 'text' ? [{ label: 'Renomear', run: () => focusInput('data-rename', n.id) }] : []),
      ...(t ? [{ label: 'Reenviar briefing do papel', run: () => api.brief(n.id, { name: d.name, maestro: !!d.maestro, instructions: d.instructions, knowledge: ws.nodes.find((x) => x.type === 'knowledge')?.data.text || '' }) }, { label: 'Monitorar atividade', checked: d.monitor, run: () => patch(n.id, { monitor: !d.monitor }) }, '-'] : []),
      ...(t
        ? [
            { label: d.blur ? 'Focar' : 'Desfocar', run: () => patch(n.id, { blur: !d.blur }) },
            { label: 'Recarregar (retoma a conversa)', run: () => { api.kill(n.id); patch(n.id, { rev: (d.rev || 0) + 1, unloaded: false }) } },
            { label: 'Nova conversa', run: () => { api.kill(n.id); patch(n.id, { rev: (d.rev || 0) + 1, unloaded: false, sid: undefined, ran: false }) } },
            { label: 'Descarregar', run: () => { api.kill(n.id); patch(n.id, { unloaded: true }) } },
            { label: d.maestro ? 'Papel: Maestro → Agente' : 'Papel: Agente → Maestro', run: () => setNodes((ns) => ns.map((x) => (x.type === 'terminal' ? { ...x, data: { ...x.data, maestro: x.id === n.id ? !d.maestro : false } } : x))) },
            '-',
          ]
        : []),
      { label: 'Copiar elemento', run: () => (clip = { ...n, data: fresh(n.data) }) },
      { label: 'Duplicar', run: () => spawnCopy(n) },
      { label: d.locked ? 'Desbloquear' : 'Bloquear', run: () => setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...x, draggable: !!d.locked, deletable: !!d.locked, data: { ...x.data, locked: !d.locked } } : x))) },
      { label: 'Apagar', danger: true, disabled: d.locked, run: () => deleteElements({ nodes: [{ id: n.id }] }) },
      '-',
      { label: 'Partituras', sub: scoreMenu() },
    ]
  }
  const scoreMenu = () => [
    { label: 'Salvar workspace como partitura', run: saveScore },
    ...scores.map((s) => ({ label: `Inserir: ${s.name}`, run: () => insertScore(s) })),
  ]
  const paneMenu = (pos) => [
    {
      label: 'Adicionar',
      sub: [
        {
          label: 'Terminal',
          sub: [
            { label: 'Novo Terminal…', run: () => setDlg({ pos }) },
            '-',
            ...Object.entries(PRESET_LABELS).map(([k, label]) => ({ label, run: () => addTerminal(k, pos) })),
          ],
        },
        { label: 'Nota', run: () => add('note', { text: '' }, pos) },
        { label: 'Árvore de Arquivos', run: () => add('files', {}, pos) },
        { label: 'Revisão (Diff)', run: () => add('diff', {}, pos) },
        { label: 'Conhecimento do projeto', disabled: ws.nodes.some((n) => n.type === 'knowledge'), run: () => add('knowledge', { text: '' }, pos) },
        { label: 'Portal', run: () => add('portal', { url: 'https://www.google.com' }, pos) },
        { label: 'Texto', run: () => add('text', { text: '' }, pos) },
        { label: 'Grupo', run: () => add('group', { name: 'Grupo' }, pos) },
      ],
    },
    { label: 'Colar', disabled: !clip, run: () => clip && setNodes((ns) => [...ns, { ...clip, id: uid('n'), selected: false, position: pos }]) },
    { label: 'Partituras', sub: scoreMenu() },
  ]
  const openMenu = (e, items) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items }) }

  return (
    <>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
      {dlg && (
        <NewTerminalDialog
          initialName={randomName(new Set(ws.nodes.map((n) => n.data.name)))}
          onClose={() => setDlg(null)}
          onCreate={({ name, cwd, preset, git }) => { addTerminal(preset, dlg.pos, { name: name || undefined, cwd: cwd || undefined, git }); setDlg(null) }}
        />
      )}
      <ReactFlow nodes={ws.nodes} edges={shownEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} connectionRadius={48} onBeforeDelete={onBeforeDelete} onConnectEnd={onConnectEnd} defaultEdgeOptions={{ type: 'floating' }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeContextMenu={(e, n) => openMenu(e, nodeMenu(n))} onPaneContextMenu={(e) => openMenu(e, paneMenu(screenToFlowPosition({ x: e.clientX, y: e.clientY })))} colorMode={cfg.mode} snapToGrid={cfg.eff.snap} snapGrid={[cfg.eff.snapSize, cfg.eff.snapSize]} className={cfg.eff.edgeFlow ? 'flow' : undefined} minZoom={0.1} fitView proOptions={{ hideAttribution: true }}>
        {cfg.eff.gridStyle !== 'none' && <Background variant={GRID_VARIANT[cfg.eff.gridStyle]} color={cfg.eff.grid} gap={cfg.eff.gap} size={cfg.eff.size} lineWidth={cfg.eff.size} />}
        <Zoom><UsageDock /><ActivityDock /></Zoom>
      </ReactFlow>
    </>
  )
}

const WS_COLORS = ['#f2c230', '#3b8cff', '#a66bff', '#3fc28a', '#ff6b6b', '#ff9a4a']

function Sidebar({ state, setState, onRemove, onSettings }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const list = state.list.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()))
  const rename = (id, name) => setState((s) => ({ ...s, list: s.list.map((w) => (w.id === id ? { ...w, name: name || w.name } : w)) }))
  const create = () => {
    const w = { id: uid('w'), name: `Workspace ${state.list.length + 1}`, nodes: [], edges: [] }
    setState((s) => ({ ...s, list: [...s.list, w], active: w.id }))
    setEditing(w.id)
  }
  return (
    <aside className="side">
      <div className="side-top">
        <label className="search">
          <Search size={16} />
          <input placeholder="Filtrar" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button onClick={create} aria-label="Novo workspace" title="Novo workspace"><Plus size={20} /></button>
      </div>
      <div className="side-title">WORKSPACES</div>
      {list.map((w, i) => {
        const color = w.color || WS_COLORS[state.list.indexOf(w) % WS_COLORS.length]
        const terms = w.nodes.filter((n) => n.type === 'terminal').length
        const patchWs = (p) => setState((s) => ({ ...s, list: s.list.map((x) => (x.id === w.id ? { ...x, ...p } : x)) }))
        return (
          <div key={w.id} className={'ws' + (w.id === state.active ? ' active' : '')} onClick={() => setState((s) => ({ ...s, active: w.id }))} onDoubleClick={() => setEditing(w.id)}>
            <button className="ws-folder" aria-label="Trocar cor" title="Trocar cor" onClick={(e) => { e.stopPropagation(); patchWs({ color: WS_COLORS[(WS_COLORS.indexOf(color) + 1) % WS_COLORS.length] }) }}><Folder size={18} color={color} /></button>
            {editing === w.id ? (
              <input autoFocus defaultValue={w.name} onBlur={(e) => { rename(w.id, e.target.value); setEditing(null) }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className="ws-name">{w.name}</span>
            )}
            <button className={'ws-lock' + (w.locked ? ' on' : '')} aria-label={w.locked ? 'Desbloquear' : 'Bloquear exclusão'} title={w.locked ? 'Desbloquear' : 'Bloquear exclusão'} onClick={(e) => { e.stopPropagation(); patchWs({ locked: !w.locked }) }}><Lock size={13} /></button>
            <span className="ws-count">
              <SquareTerminal size={15} />
              {terms}
            </span>
            {state.list.length > 1 && !w.locked && <button className="ws-del" aria-label="Excluir workspace" onClick={(e) => { e.stopPropagation(); onRemove(w.id) }}><X size={14} /></button>}
          </div>
        )
      })}
      <footer className="side-foot">
        <button className="side-new" onClick={create}><Folder size={15} /> Novo workspace</button>
        <button className="side-gear" aria-label="Configurações" title="Configurações" onClick={onSettings}><SettingsIcon size={16} /></button>
      </footer>
    </aside>
  )
}

export default function App() {
  const [state, setState] = useState(null) // { list:[{id,name,nodes,edges}], active }
  const loaded = useRef(false)

  useEffect(() => {
    api.load().then((saved) => {
      const first = { id: uid('w'), name: 'Principal', nodes: [], edges: [] }
      if (saved?.list) setState(saved)
      else if (saved?.nodes) setState({ list: [{ ...first, nodes: saved.nodes, edges: saved.edges }], active: first.id }) // legacy single-canvas file
      else setState({ list: [first], active: first.id })
      loaded.current = true
    })
  }, [])

  // The bridge sees every workspace so background agents keep talking.
  useEffect(() => {
    if (!state || !loaded.current) return
    api.updateGraph({
      nodes: state.list.flatMap((w) => w.nodes.map((n) => describe(n, w.id)).filter(Boolean)),
      edges: state.list.flatMap((w) => w.edges.map((e) => ({ source: e.source, target: e.target }))),
      knowledge: Object.fromEntries(state.list.map((w) => [w.id, w.nodes.find((n) => n.type === 'knowledge')?.data.text || ''])),
    })
    const t = setTimeout(() => api.save(state), 500)
    return () => clearTimeout(t)
  }, [state])

  const active = state?.list.find((w) => w.id === state.active)
  const update = useCallback(
    (fn) => setState((s) => ({ ...s, list: s.list.map((w) => (w.id === s.active ? fn(w) : w)) })),
    [],
  )
  // Scores = saved layouts (nodes + edges). Inserting remaps ids so terminals get fresh ptys.
  const saveScore = () =>
    setState((s) => {
      const w = s.list.find((x) => x.id === s.active)
      const nodes = w.nodes.map((n) => ({ ...n, selected: false, data: { ...n.data, maestro: false } }))
      return { ...s, scores: [...(s.scores || []), { name: `${w.name} ${(s.scores?.length || 0) + 1}`, nodes, edges: w.edges }] }
    })
  const insertScore = (sc) =>
    update((w) => {
      const ids = new Map(sc.nodes.map((n) => [n.id, uid('n')]))
      const nodes = sc.nodes.map((n) => ({ ...n, id: ids.get(n.id), data: { ...fresh(n.data), rev: 0, unloaded: false } }))
      const edges = sc.edges.map((e) => ({ ...e, id: uid('e'), source: ids.get(e.source), target: ids.get(e.target) }))
      return { ...w, nodes: [...w.nodes, ...nodes], edges: [...w.edges, ...edges] }
    })
  const remove = async (id) => {
    const w = state.list.find((x) => x.id === id)
    if (!(await ask(`Excluir o workspace "${w?.name}" e seus terminais?`))) return
    w?.nodes.forEach((n) => n.type === 'terminal' && api.kill(n.id))
    setState((s) => {
      const list = s.list.filter((x) => x.id !== id)
      return { ...s, list, active: s.active === id ? list[0].id : s.active }
    })
  }

  // An agent called canvas_remember: append to its workspace's knowledge node (created on first use).
  useEffect(
    () =>
      api.onKnowledge(({ from, text }) =>
        setState((s) => {
          const w = s.list.find((x) => x.nodes.some((n) => n.id === from))
          if (!w) return s
          const k = w.nodes.find((n) => n.type === 'knowledge')
          const nodes = k
            ? w.nodes.map((n) => (n === k ? { ...n, data: { ...n.data, text: ((n.data.text || '') + '\n' + text).trim() } } : n))
            : [...w.nodes, { id: uid('n'), type: 'knowledge', style: { width: 320, height: 240 }, position: { x: 40, y: -300 }, data: { text } }]
          return { ...s, list: s.list.map((x) => (x === w ? { ...x, nodes } : x)) }
        }),
      ),
    [],
  )
  // The maestro asked (canvas_spawn) for a new agent: add it next to the maestro, wired to it, in the maestro's workspace.
  useEffect(
    () =>
      api.onSpawn(({ from, name, preset, instructions }) =>
        setState((s) => {
          const w = s.list.find((x) => x.nodes.some((n) => n.id === from))
          if (!w) return s
          const src = w.nodes.find((n) => n.id === from)
          const id = uid('n')
          const kids = w.edges.filter((e) => e.source === from).length
          const node = {
            id, type: 'terminal', style: { width: 520, height: 340 },
            position: { x: src.position.x + 580, y: src.position.y + kids * 360 },
            data: { name, preset: PRESET_LABELS[preset] ? preset : 'claude', maestro: false, instructions },
          }
          const edge = { id: uid('e'), source: from, target: id, type: 'floating' }
          return { ...s, list: s.list.map((x) => (x.id === w.id ? { ...x, nodes: [...x.nodes, node], edges: [...x.edges, edge] } : x)) }
        }),
      ),
    [],
  )

  const [settings, setSettings] = useState(null)
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const h = (e) => setSysDark(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  const mode = settings?.appearance === 'system' ? (sysDark ? 'dark' : 'light') : settings?.appearance || 'dark'
  const eff = useMemo(() => (settings ? resolveTheme(settings, mode) : null), [settings, mode])
  useEffect(() => { if (eff) applyTheme(eff) }, [eff])
  const ctx = useMemo(() => (settings ? { ...settings, mode, eff } : null), [settings, mode, eff])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)
  settingsRef.current = settings

  // Pairs that are talking: an open canvas_ask holds the pair "on"; every message keeps it on for commSeconds after the last one.
  const [talking, setTalking] = useState(() => new Set())
  useEffect(() => {
    const waiting = new Map() // pair -> open asks
    const until = new Map() // pair -> expiry ms
    let timer
    const recompute = () => {
      const now = Date.now()
      const keys = new Set(waiting.keys())
      let next = Infinity
      for (const [k, t] of until) {
        if (t > now) { keys.add(k); next = Math.min(next, t) } else until.delete(k)
      }
      setTalking(keys)
      clearTimeout(timer)
      if (next < Infinity) timer = setTimeout(recompute, next - now + 20)
    }
    const off = api.onComm(({ kind, a, b }) => {
      const k = [a, b].sort().join('|')
      const hold = (settingsRef.current?.custom?.commSeconds || 6) * 1000
      if (kind === 'start') waiting.set(k, (waiting.get(k) || 0) + 1)
      else {
        if (kind === 'end') {
          const n = (waiting.get(k) || 1) - 1
          n > 0 ? waiting.set(k, n) : waiting.delete(k)
        }
        until.set(k, Date.now() + hold)
      }
      recompute()
    })
    return () => { off(); clearTimeout(timer) }
  }, [])
  useEffect(() => {
    api.settingsGet().then(setSettings)
    return api.onSettings(setSettings)
  }, [])

  const upd = useUpdate(api)
  const [updOpen, setUpdOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(() => {
    try { return localStorage.getItem('sideOpen') !== '0' } catch { return true }
  })
  const toggleSide = () =>
    setSideOpen((o) => {
      try { localStorage.setItem('sideOpen', o ? '0' : '1') } catch {}
      return !o
    })

  const [confirm, setConfirm] = useState(null) // { msg, done }
  useEffect(() => {
    askFn = (msg) => new Promise((done) => setConfirm({ msg, done }))
    return () => { askFn = null }
  }, [])
  const answer = (v) => { confirm?.done(v); setConfirm(null) }

  if (!state || !settings) return null
  return (
    <SettingsCtx.Provider value={ctx}>
    <CommCtx.Provider value={talking}>
    <div className={'app' + (settings.handCursor ? ' hand' : '')}>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} api={api} mode={mode} update={{ state: upd, open: () => setUpdOpen(true) }} />
      <ApprovalDialog />
      <UpdateToast state={upd} onOpen={() => { setUpdOpen(true); api.updateDownload() }} />
      <UpdateDialog open={updOpen} onOpenChange={setUpdOpen} state={upd} api={api} />
      <AlertDialog.Root open={!!confirm} onOpenChange={(o) => !o && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dlg-back" />
          <AlertDialog.Content className="dlg">
            <AlertDialog.Title className="dlg-title">Confirmar exclusão</AlertDialog.Title>
            <AlertDialog.Description>{confirm?.msg}</AlertDialog.Description>
            <div className="dlg-actions">
              <AlertDialog.Cancel asChild><button>Não</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><button className="primary danger" onClick={() => answer(true)}>Sim</button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <div className={'side-wrap' + (sideOpen ? '' : ' closed')} inert={!sideOpen}>
        <Sidebar state={state} setState={setState} onRemove={remove} onSettings={() => setSettingsOpen(true)} />
      </div>
      <main>
        <button className={"burger" + (sideOpen ? "" : " closed")} aria-label={sideOpen ? 'Ocultar workspaces' : 'Mostrar workspaces'} title={sideOpen ? 'Ocultar workspaces' : 'Mostrar workspaces'} onClick={toggleSide}>
          <MenuIcon size={18} />
        </button>
        <span className="ws-pill">{active.name}</span>
        <ReactFlowProvider key={active.id}>
          <Canvas ws={active} update={update} scores={state.scores || []} saveScore={saveScore} insertScore={insertScore} />
        </ReactFlowProvider>
      </main>
    </div>
    </CommCtx.Provider>
    </SettingsCtx.Provider>
  )
}
