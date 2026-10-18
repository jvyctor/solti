import { Suspense, lazy, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Menu as MenuIcon } from 'lucide-react'
const SettingsDialog = lazy(() => import('./Settings.jsx')) // dialogs load when first opened
import { useUpdate, UpdateToast, UpdateDialog } from './Updates.jsx'
import { exportable, mergeImport } from './workspaces.js'
const Palette = lazy(() => import('./Palette.jsx'))
const HistoryDialog = lazy(() => import('./History.jsx'))
import { ApprovalDialog, AwayDigest } from './Activity.jsx'
import { ErrorToast } from './ErrorToast.jsx'
import { notify } from './notify.js'
import { demoWorkspace } from './demo.js'
import { resolveTheme, applyTheme } from './themes.js'
import { Canvas } from './Canvas.jsx'
import { Sidebar } from './Sidebar.jsx'
import { isRunning, runPipeline, stopPipeline } from './pipelineRunner.js'
import { overBudget, useUsage, wsCost } from './costs.js'
const Onboarding = lazy(() => import('./Diagnostics.jsx').then((m) => ({ default: m.Onboarding })))
import { CommCtx, PipeCtx, PRESET_LABELS, SettingsCtx, UsageCtx, api, ask, describe, fmt, fresh, mem, money, uid } from './shared.js'
import { tr } from './i18n.js'

export default function App() {
  const [state, setState] = useState(null) // { list:[{id,name,nodes,edges}], active }
  const loaded = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = state
  // Pipelines run here, not inside their node, so a run survives opening another workspace.
  const patchNode = useCallback((id, p) => setState((s) => ({ ...s, list: s.list.map((w) => (w.nodes.some((n) => n.id === id) ? { ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)) } : w)) })), [])
  const findNode = (nid) => stateRef.current?.list.flatMap((w) => w.nodes).find((n) => n.id === nid) || null
  const wsOf = (nid) => stateRef.current?.list.find((w) => w.nodes.some((n) => n.id === nid)) || null

  // Token use and estimated cost of every agent (all workspaces); limits and budgets are enforced further down.
  const byNode = useUsage(state)
  const usageRef = useRef(byNode)
  usageRef.current = byNode

  const pipe = useMemo(() => ({
    start: (id) => {
      const w = wsOf(id)
      if (w?.budget > 0 && wsCost(w, usageRef.current).total >= w.budget) {
        patchNode(id, { state: 'stopped', note: tr("Orçamento do workspace atingido. Aumente o orçamento no painel de uso para executar.") })
        return
      }
      return runPipeline(id, {
        api,
        getNode: findNode,
        patch: patchNode,
        agentExists: (aid) => findNode(aid)?.type === 'terminal',
        agentName: (aid) => findNode(aid)?.data.name || aid,
        cost: (aid) => usageRef.current[aid]?.cost ?? 0,
        snapshot: (label) => stateRef.current && api.pointCreate(label, stateRef.current),
        notify: (title, body) => settingsRef.current?.notifyPipeline && notify(title, body, { nodeId: id }),
        // "Wait for my OK" steps use the same approval dialog as agent requests (and the phone remote).
        approve: ({ key, title, step, text, timeoutMs }) => api.approvalAsk({ key, from: tr('Fluxo “{0}” · passo {1}', [title, step]), text, timeoutMs }),
        cancelApproval: (key) => api.approvalCancel(key),
      })
    },
    stop: stopPipeline,
  }), [patchNode])

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
      wsNames: Object.fromEntries(state.list.map((w) => [w.id, w.name])),
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
    if (!(await ask(tr("Excluir o workspace \"{0}\" e seus terminais?", [w?.name])))) return
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
      api.onSpawn(({ from, name, preset, instructions }) => {
        const id = uid('n')
        setFocus({ nodeId: id, n: Date.now() }) // bring the new agent into view
        setState((s) => {
          const w = s.list.find((x) => x.nodes.some((n) => n.id === from))
          if (!w) return s
          const src = w.nodes.find((n) => n.id === from)
          const kids = w.edges.filter((e) => e.source === from).length
          const node = {
            id, type: 'terminal', style: { width: 520, height: 340 },
            position: { x: src.position.x + 580, y: src.position.y + kids * 360 },
            data: { name, preset: PRESET_LABELS[preset] ? preset : 'claude', maestro: false, instructions },
          }
          const edge = { id: uid('e'), source: from, target: id, type: 'floating' }
          return { ...s, list: s.list.map((x) => (x.id === w.id ? { ...x, nodes: [...x.nodes, node], edges: [...x.edges, edge] } : x)) }
        })
      }),
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
  const [settingsTab, setSettingsTab] = useState(null) // tab to open on (e.g. 'dados' from the palette)
  const settingsRef = useRef(null)
  settingsRef.current = settings

  // Per-agent token limit: over it, the agent is interrupted once (until it drops below, e.g. a new conversation).
  const [limited, setLimited] = useState(() => new Set())
  const limitedRef = useRef(limited)
  useEffect(() => {
    const max = settings?.tokenLimit || 0
    const next = new Set(Object.entries(byNode).filter(([, u]) => max > 0 && u.tokens >= max).map(([id]) => id))
    for (const id of next) {
      if (limitedRef.current.has(id)) continue
      api.interrupt(id)
      notify(findNode(id)?.data.name || id, tr("Limite de {0} tokens atingido; agente interrompido.", [fmt(max)]), { nodeId: id, always: true })
    }
    limitedRef.current = next
    setLimited(next)
  }, [byNode, settings?.tokenLimit])
  // Workspace budget (US$, estimated): reaching it stops that workspace's pipelines and interrupts its agents once.
  // You can still type to the agents; raising the budget re-arms it.
  const budgetHit = useRef(new Set())
  const budgetReady = useRef(false)
  const budgetKey = (state?.list || []).map((w) => `${w.id}:${w.budget || 0}`).join('|')
  useEffect(() => {
    if (!state) return
    const over = new Set(overBudget(state, byNode).map((w) => w.id))
    // The first reading after start is the baseline: agents being resumed are not interrupted for a budget
    // that was already used up (its pipelines stay blocked anyway). Only crossings while the app runs act.
    if (!budgetReady.current) {
      if (!Object.keys(byNode).length) return
      budgetReady.current = true
      budgetHit.current = over
      return
    }
    for (const w of state.list) {
      if (!over.has(w.id) || budgetHit.current.has(w.id)) continue
      const spent = money(wsCost(w, byNode).total)
      w.nodes.forEach((n) => {
        if (n.type === 'terminal') api.interrupt(n.id)
        if (n.type === 'pipeline' && isRunning(n.id)) stopPipeline(n.id, tr("Orçamento do workspace atingido."))
      })
      api.activityRecord({ kind: 'budget', from: w.name, text: tr("Orçamento de {0} atingido ({1}); agentes interrompidos.", [money(w.budget), spent]) })
      notify(tr("Orçamento atingido: {0}", [w.name]), tr("Gasto estimado {0} de {1}. Agentes interrompidos e fluxos parados.", [spent, money(w.budget)]), { always: true })
    }
    budgetHit.current = over
  }, [byNode, budgetKey])
  const usage = useMemo(() => ({ byNode, limited }), [byNode, limited])

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
  // An agent called canvas_done: remember it on its node (drives the "Concluído" badge).
  useEffect(() => api.onDone(({ from, summary, t }) => setState((s) => ({ ...s, list: s.list.map((w) => (w.nodes.some((n) => n.id === from) ? { ...w, nodes: w.nodes.map((n) => (n.id === from ? { ...n, data: { ...n.data, lastDone: { summary, t } } } : n)) } : w)) }))), [])
  useEffect(() => api.onDone(({ from, name, summary }) => {
    if (settingsRef.current?.notifyDone) notify(tr("{0} concluiu", [name || from]), summary, { nodeId: from })
  }), [])
  const [focus, setFocus] = useState(null) // { nodeId, n }: Canvas pans to it
  const [palette, setPalette] = useState(false)
  const goTo = useCallback((wsId, nodeId) => {
    if (wsId) setState((s) => ({ ...s, active: wsId }))
    if (nodeId) setFocus({ nodeId, n: Date.now() })
  }, [])
  // A clicked notification (or anything else) asks to show a node: open its workspace and pan to it.
  useEffect(() => {
    const h = (e) => {
      const id = e.detail?.nodeId
      const w = stateRef.current?.list.find((x) => x.nodes.some((n) => n.id === id))
      if (w) goTo(w.id, id)
    }
    window.addEventListener('ac:goto', h)
    return () => window.removeEventListener('ac:goto', h)
  }, [goTo])
  // Demo workspace (simulated agents, no AI CLI needed): opened from the welcome screen, an empty canvas or Ctrl+K.
  // Reuses the existing demo workspace if there is one.
  useEffect(() => {
    const open = () => setState((s) => {
      const existing = s.list.find((w) => w.demo)
      if (existing) return { ...s, active: existing.id }
      const w = demoWorkspace(uid)
      return { ...s, list: [...s.list, w], active: w.id }
    })
    window.addEventListener('ac:demo', open)
    return () => window.removeEventListener('ac:demo', open)
  }, [])
  // Agent history dialog: { start: node id | '' } while open.
  const [history, setHistory] = useState(null)
  useEffect(() => {
    const h = (e) => setHistory({ start: e.detail?.nodeId || '' })
    window.addEventListener('ac:agent-history', h)
    return () => window.removeEventListener('ac:agent-history', h)
  }, [])
  const historyAgents = useMemo(() => (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal').map((n) => ({ id: n.id, name: state.list.length > 1 ? `${n.data.name} (${w.name})` : n.data.name }))), [state])

  // Restore points: a named copy of every workspace. Restoring makes one of the current state first,
  // stops terminals that do not exist in the restored version and keeps the others running.
  const points = useMemo(() => ({
    list: () => api.pointList(),
    create: (label) => api.pointCreate(label || tr('Ponto manual'), stateRef.current),
    restore: async (id) => {
      const r = await api.pointLoad(id)
      if (r.error) return r.error
      await api.pointCreate(tr('Antes de restaurar'), stateRef.current)
      const keep = new Set(r.data.list.flatMap((w) => w.nodes.map((n) => n.id)))
      stateRef.current.list.forEach((w) => w.nodes.forEach((n) => n.type === 'terminal' && !keep.has(n.id) && api.kill(n.id)))
      setState({ ...r.data, active: r.data.list.some((w) => w.id === r.data.active) ? r.data.active : r.data.list[0]?.id })
      return ''
    },
  }), [])
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o) }
    }
    window.addEventListener('keydown', key, true) // capture: works while a terminal has focus
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  // What a routine can aim at: every terminal and every pipeline, in every workspace.
  const targets = useMemo(() => (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal' || n.type === 'pipeline').map((n) => (n.type === 'terminal' ? { type: 'agent', id: n.id, label: `${n.data.name} (${w.name})` } : { type: 'pipeline', id: n.id, label: `${n.data.name || 'Fluxo'} (${w.name})` }))), [state])
  useEffect(() => api.onRoutinePipeline(({ id }) => pipe.start(id)), [pipe])
  // macOS application menu -> same actions as the keyboard shortcuts.
  useEffect(() => api.onMenu((cmd) => {
    if (cmd === 'settings') setSettingsOpen(true)
    else if (cmd === 'palette') setPalette((o) => !o)
    else if (cmd === 'undo' || cmd === 'redo') {
      const el = document.activeElement
      if (el?.matches?.('input, textarea, [contenteditable]')) document.execCommand(cmd) // text fields keep their own history
      else window.dispatchEvent(new CustomEvent('ac:history', { detail: cmd === 'undo' ? -1 : 1 }))
    }
  }), [])
  const exportWs = async () => {
    const r = await api.exportWorkspaces(exportable(state))
    return r.path ? `Exportado para ${r.path}` : ''
  }
  const importWs = async () => {
    const r = await api.importWorkspaces()
    if (r.canceled) return ''
    if (r.error) return r.error
    try {
      const { state: next, added } = mergeImport(state, r.data, uid)
      setState(next)
      return `${added} workspace(s) importado(s).`
    } catch (e) { return e.message }
  }
  const [updOpen, setUpdOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(() => {
    try { return localStorage.getItem('sideOpen') !== '0' } catch { return true }
  })
  const toggleSide = () =>
    setSideOpen((o) => {
      try { localStorage.setItem('sideOpen', o ? '0' : '1') } catch {}
      return !o
    })

  const paletteActions = useMemo(() => [
    { label: tr("Novo workspace"), run: () => setState((s) => { const w = { id: uid('w'), name: `Workspace ${s.list.length + 1}`, nodes: [], edges: [] }; return { ...s, list: [...s.list, w], active: w.id } }) },
    { label: tr("Criar time pronto"), run: () => window.dispatchEvent(new Event('ac:team')) },
    { label: tr("Abrir a demonstração"), run: () => window.dispatchEvent(new Event('ac:demo')) },
    { label: tr("Configurações"), run: () => setSettingsOpen(true) },
    { label: tr("Verificar atualizações"), run: () => { setUpdOpen(true); api.updateCheck() } },
    { label: tr("Mostrar/ocultar barra lateral"), run: toggleSide },
    { label: tr("Interromper todos os agentes"), run: () => api.interrupt() },
    { label: tr("Histórico dos agentes"), run: () => setHistory({ start: '' }) },
    { label: tr("Criar ponto de restauração"), run: () => points.create(tr('Ponto manual')) },
    { label: tr("Pontos de restauração…"), run: () => { setSettingsTab('dados'); setSettingsOpen(true) } },
  ], [points])

  const [confirm, setConfirm] = useState(null) // { msg, done }
  useEffect(() => {
    mem.askFn = (msg) => new Promise((done) => setConfirm({ msg, done }))
    return () => { mem.askFn = null }
  }, [])
  const answer = (v) => { confirm?.done(v); setConfirm(null) }

  if (!state || !settings) return null
  return (
    <SettingsCtx.Provider value={ctx}>
    <CommCtx.Provider value={talking}>
    <PipeCtx.Provider value={pipe}>
    <UsageCtx.Provider value={usage}>
    <div className={'app' + (settings.handCursor ? ' hand' : '')}>
      <Suspense fallback={null}>
        {settingsOpen && <SettingsDialog open={settingsOpen} onOpenChange={(o) => { setSettingsOpen(o); if (!o) setSettingsTab(null) }} startTab={settingsTab} settings={settings} api={api} mode={mode} update={{ targets, state: upd, open: () => setUpdOpen(true), io: { export: exportWs, import: importWs, points } }} />}
      </Suspense>
      <ApprovalDialog />
      <Suspense fallback={null}>{(!!settings && !settings.onboarded && !!state && state.list.every((w) => w.nodes.length === 0)) && <Onboarding open onClose={() => api.settingsSet({ onboarded: true })} onTeam={() => setTimeout(() => window.dispatchEvent(new Event('ac:team')), 200)} onDemo={() => window.dispatchEvent(new Event('ac:demo'))} />}</Suspense>
      <AwayDigest />
      <ErrorToast />
      <Suspense fallback={null}>{history && <HistoryDialog open onClose={() => setHistory(null)} agents={historyAgents} start={history.start} />}</Suspense>
      <Suspense fallback={null}>{state && palette && <Palette open={palette} onClose={() => setPalette(false)} state={state} goTo={goTo} actions={paletteActions} />}</Suspense>
      <UpdateToast state={upd} onOpen={() => { setUpdOpen(true); api.updateDownload() }} />
      <UpdateDialog open={updOpen} onOpenChange={setUpdOpen} state={upd} api={api} />
      <AlertDialog.Root open={!!confirm} onOpenChange={(o) => !o && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dlg-back" />
          <AlertDialog.Content className="dlg">
            <AlertDialog.Title className="dlg-title">{tr("Confirmar exclusão")}</AlertDialog.Title>
            <AlertDialog.Description>{confirm?.msg}</AlertDialog.Description>
            <div className="dlg-actions">
              <AlertDialog.Cancel asChild><button>{tr("Não")}</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><button className="primary danger" onClick={() => answer(true)}>{tr("Sim")}</button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <div className={'side-wrap' + (sideOpen ? '' : ' closed')} inert={!sideOpen}>
        <Sidebar state={state} setState={setState} onRemove={remove} onSettings={() => setSettingsOpen(true)} />
      </div>
      <main>
        <button className={"burger" + (sideOpen ? "" : " closed")} aria-label={sideOpen ? tr("Ocultar workspaces") : tr("Mostrar workspaces")} title={sideOpen ? tr("Ocultar workspaces") : tr("Mostrar workspaces")} onClick={toggleSide}>
          <MenuIcon size={18} />
        </button>
        <span className="ws-pill">{active.name}</span>
        <ReactFlowProvider key={active.id}>
          <Canvas ws={active} update={update} scores={state.scores || []} saveScore={saveScore} insertScore={insertScore} focus={focus} />
        </ReactFlowProvider>
      </main>
    </div>
    </UsageCtx.Provider>
    </PipeCtx.Provider>
    </CommCtx.Provider>
    </SettingsCtx.Provider>
  )
}
