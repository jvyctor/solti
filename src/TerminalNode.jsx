import { useContext, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Activity, Folder, GitBranch, X } from 'lucide-react'
import { termOptions } from './themes.js'
import { classify, STATUS } from './status.js'
import { AGENT_COLORS, PRESET_COLOR, SettingsCtx, api, fmt, shortPath, sinks, terms } from './shared.js'
import { Ring } from './Ring.jsx'

export function TerminalNode({ id, data, selected }) {
  const host = useRef(null)
  const { updateNodeData, deleteElements, setNodes, getNodes } = useReactFlow()

  const dataRef = useRef(data)
  dataRef.current = data
  const [cwd, setCwd] = useState('')
  const [status, setStatus] = useState(null) // working | input | idle | exited | limit (agents only)
  const [tokens, setTokens] = useState(0)
  // "Starting…" until the shell prints its first output; after 12 s a hint that it is slow, not frozen.
  const [booting, setBooting] = useState(true)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!booting) return
    const t = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(t)
  }, [booting])
  useEffect(() => { if (data.lastDone?.t && data.lastDone.t > mountedAt.current) setStatus('done') }, [data.lastDone?.t])
  const cfg = useContext(SettingsCtx)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const termRef = useRef(null)
  const mountedAt = useRef(Date.now())
  const fitRef = useRef(null)

  useEffect(() => {
    if (data.unloaded) return
    const c = cfgRef.current
    const term = new Terminal(termOptions({ ...c, ...(dataRef.current.look || {}) }, c.mode))
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
      setBooting(false)
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
      if (r.buf) { term.write(r.buf); setBooting(false) } // pty still alive (reload): its buffer is newer than the file
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

  // Claude, Codex and Gemini: token use is read from the CLI's own session log; over the limit, the agent is interrupted once.
  const limitHit = useRef(false)
  useEffect(() => {
    if (!['claude', 'codex', 'gemini'].includes(data.preset) || !data.sid || data.unloaded) return
    const poll = () => api.agentTokens(id, data.preset, data.sid).then((r) => {
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
  const opts = termOptions({ ...cfg, ...(data.look || {}) }, cfg.mode) // node.data.look overrides the global style for this terminal
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
      {booting && !data.unloaded && (
        <div className="booting" role="status"><i />{slow ? 'O terminal está demorando para iniciar (o computador pode estar ocupado). Use Recarregar no menu do nó se não abrir.' : 'Iniciando terminal…'}</div>
      )}
      {data.unloaded && (
        <div className="unloaded">
          <button onClick={() => updateNodeData(id, { unloaded: false })}>Descarregado: carregar</button>
        </div>
      )}
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}
