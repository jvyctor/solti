import { useContext, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, useStoreApi } from '@xyflow/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Activity, Folder, GitBranch, X } from 'lucide-react'
import { termOptions } from './themes.js'
import { classify, STATUS } from './status.js'
import { AGENT_COLORS, PRESET_COLOR, SettingsCtx, UsageCtx, api, fmt, money, shortPath, sinks, terms } from './shared.js'
import { Ring } from './Ring.jsx'
import { tr } from './i18n.js'
import { notify } from './notify.js'

export function TerminalNode({ id, data, selected }) {
  const host = useRef(null)
  const { updateNodeData, deleteElements, setNodes, getNodes } = useReactFlow()
  const flow = useStoreApi()

  const dataRef = useRef(data)
  dataRef.current = data
  const [cwd, setCwd] = useState('')
  const [status, setStatus] = useState(null) // working | input | idle | exited | limit (agents only)
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
    // xterm turns Ctrl+V into ^V and cancels the browser paste. Let the paste event through (it reaches xterm's own
    // handler, bracketed paste included) and copy on Ctrl+C only when text is selected, so Ctrl+C still interrupts.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.altKey) return true
      const k = e.key.toLowerCase()
      if (k === 'v') return false
      if (k === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        return false
      }
      return true
    })
    fit.fit()
    // The canvas zoom is a CSS scale; xterm measures the pointer in screen pixels against cells in unscaled pixels,
    // so at any zoom but 100% the selection lands somewhere else. Mouse events are re-sent with the pointer position
    // mapped back to unscaled space (also while dragging outside the terminal, where xterm listens on the document).
    let dragging = false
    const unscale = (e) => {
      const z = flow.getState().transform[2]
      if (!e.isTrusted || z === 1) return
      if (e.type === 'mousedown' ? !term.element?.contains(e.target) : !dragging && !term.element?.contains(e.target)) return
      if (e.type === 'mousedown') dragging = true
      else if (e.type === 'mouseup') dragging = false
      const r = (term.element.querySelector('.xterm-screen') || term.element).getBoundingClientRect()
      e.stopImmediatePropagation()
      e.preventDefault()
      const { type, bubbles, cancelable, view, detail, screenX, screenY, ctrlKey, shiftKey, altKey, metaKey, button, buttons, relatedTarget } = e
      e.target.dispatchEvent(new MouseEvent(type, { bubbles, cancelable, view, detail, screenX, screenY, ctrlKey, shiftKey, altKey, metaKey, button, buttons, relatedTarget, clientX: r.left + (e.clientX - r.left) / z, clientY: r.top + (e.clientY - r.top) / z }))
    }
    const MOUSE = ['mousedown', 'mousemove', 'mouseup']
    MOUSE.forEach((t) => window.addEventListener(t, unscale, true))
    terms.set(id, term)
    // Output is held until the saved screen (or the live pty buffer) has been written, so order is kept.
    // hooked: the CLI reports its status through hooks (Claude Code, see electron/hooks.cjs); output no longer decides it.
    let idle, settle, cur, ready = false, hooked = false
    const held = []
    const offHook = api.onAgentStatus(({ from, status: s }) => {
      if (from !== id) return
      hooked = true
      clearTimeout(settle)
      if (s === cur) return
      cur = s
      setStatus(s)
      if (s === 'input' && cfgRef.current.notifyWaiting) notify(dataRef.current.name, tr("Está esperando você."), { nodeId: id })
    })
    const show = (d) => {
      term.write(d)
      setBooting(false)
      if (dataRef.current.preset !== 'shell' && !hooked) {
        if (cur !== 'working') { cur = 'working'; setStatus('working') }
        clearTimeout(settle)
        settle = setTimeout(() => {
          const b = term.buffer.active
          const lines = []
          for (let i = Math.max(0, b.length - 6); i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) || '')
          cur = classify(lines)
          setStatus(cur)
          if (cur === 'input' && cfgRef.current.notifyWaiting) notify(dataRef.current.name, tr("Está esperando você."), { nodeId: id })
        }, 2500)
      }
      if (dataRef.current.monitor && cfgRef.current.notifyIdle) {
        clearTimeout(idle)
        const secs = cfgRef.current.idleSeconds
        idle = setTimeout(() => notify(dataRef.current.name, tr("Atividade parou ({0} s sem saída).", [secs]), { nodeId: id, always: true }), secs * 1000)
      }
    }
    sinks.set(id, (d) => (ready ? show(d) : held.push(d)))
    let dirty = false
    const mark = term.onWriteParsed(() => { dirty = true })
    const save = () => { if (ready && dirty) { dirty = false; api.termSave(id, ser.serialize({ scrollback: 1000 })) } }
    const timer = setInterval(save, 5000)
    window.addEventListener('beforeunload', save)
    Promise.all([api.termLoad(id), api.spawn(id, { preset: data.preset, boot: data.boot, name: data.name, maestro: !!data.maestro, instructions: data.instructions, cwd: data.cwd, cols: term.cols, rows: term.rows, resume: !!dataRef.current.ran, sid, knowledge: getNodes().find((n) => n.type === 'knowledge')?.data.text || '' })]).then(([saved, r]) => {
      setCwd(r.cwd)
      if (r.buf) { term.write(r.buf); setBooting(false) } // pty still alive (reload): its buffer is newer than the file
      // Pushed into scrollback: the shell's startup clear only wipes the visible screen.
      else if (saved) term.write(saved + '\r\n\x1b[2m--- ' + tr('sessão anterior') + ' ---\x1b[0m' + '\r\n'.repeat(term.rows))
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
    return () => { MOUSE.forEach((t) => window.removeEventListener(t, unscale, true)); save(); offExit(); offHook(); clearInterval(timer); clearTimeout(idle); clearTimeout(settle); window.removeEventListener('beforeunload', save); mark.dispose(); terms.delete(id); sinks.delete(id); sub.dispose(); ro.disconnect(); term.dispose() }
  }, [id, data.rev, data.unloaded])

  // Claude, Codex and Gemini: token use and estimated cost come from the central poller (costs.js, App enforces the limit).
  const usage = useContext(UsageCtx)
  const u = usage.byNode[id]
  const tokens = u?.tokens || 0
  const isLimited = usage.limited.has(id)
  useEffect(() => { if (isLimited) setStatus('limit') }, [isLimited])

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
    <div className={'tnode' + (selected ? ' selected' : '') + (data.maestro ? ' maestro' : '') + (status === 'working' ? ' st-working' : '')}>
      <NodeResizer minWidth={300} minHeight={180} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <i className="dot" style={{ background: AGENT_COLORS[PRESET_COLOR[data.preset]] || '#8b93a5' }} title={data.preset} />
        <input data-rename={id} value={data.name} onChange={(e) => updateNodeData(id, { name: e.target.value })} />
        <span className="spacer" />
        {status && <span className={'stat ' + status} title={STATUS[status].label}><i style={{ background: STATUS[status].color }} />{STATUS[status].label}</span>}
        {tokens > 0 && <span className={'tok' + (cfg.tokenLimit > 0 && tokens >= cfg.tokenLimit ? ' over' : '')} title={tr("Tokens usados por este agente (entrada + cache novo + saída)")}>{fmt(tokens)} {tr("tok")}</span>}
        {tokens > 0 && u?.cost != null && <span className="cost" title={tr("Custo estimado pelo preço de API de {0} (assinaturas não cobram por token)", [u.model || '?'])}>{money(u.cost)}</span>}
        {data.monitor && <Activity className="mon" size={13} aria-label={tr("Monitorando atividade")} />}
        <select className={'rolepill' + (data.maestro ? ' maestro' : '')} value={data.maestro ? 'maestro' : 'agent'} onChange={(e) => setRole(e.target.value === 'maestro')} title={tr("Papel (use Reenviar briefing no menu para aplicar)")}>
          <option value="agent">{tr("Agente")}</option>
          <option value="maestro">{tr("Maestro")}</option>
        </select>
        <button className="x" aria-label={tr("Excluir")} onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="tbody nodrag nowheel" ref={host} style={{ background: opts.theme.background, padding: `4px ${cfg.termPadding}px`, ...(data.blur ? { filter: 'blur(6px)' } : {}) }} />
      <div className="tfoot" title={cwd}><Folder size={12} /> {shortPath(cwd)}{data.git && <span className="branch" title={data.git.worktree ? tr("worktree de {0}", [data.git.base]) : tr("branch da pasta")}><GitBranch size={12} /> {data.git.branch}</span>}
        {['claude', 'codex', 'gemini'].includes(data.preset) && (
          <label className="abudget nodrag" title={tr("Orçamento deste agente (US$, estimado). Ao atingir, o agente é interrompido.")}>
            US$ <input inputMode="decimal" placeholder={tr("sem limite")} value={data.budget || ''} onChange={(e) => updateNodeData(id, { budget: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} />
          </label>
        )}
      </div>
      {booting && !data.unloaded && (
        <div className="booting" role="status"><i />{slow ? tr("O terminal está demorando para iniciar (o computador pode estar ocupado). Use Recarregar no menu do nó se não abrir.") : tr("Iniciando terminal…")}</div>
      )}
      {data.unloaded && (
        <div className="unloaded">
          <button onClick={() => updateNodeData(id, { unloaded: false })}>{tr("Descarregado: carregar")}</button>
        </div>
      )}
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}
