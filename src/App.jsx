import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Menu as MenuIcon } from 'lucide-react'
import SettingsDialog from './Settings.jsx'
import { useUpdate, UpdateToast, UpdateDialog } from './Updates.jsx'
import { exportable, mergeImport } from './workspaces.js'
import Palette from './Palette.jsx'
import { ApprovalDialog, AwayDigest } from './Activity.jsx'
import { resolveTheme, applyTheme } from './themes.js'
import { Canvas } from './Canvas.jsx'
import { Sidebar } from './Sidebar.jsx'
import { CommCtx, PRESET_LABELS, SettingsCtx, api, ask, describe, fresh, mem, uid } from './shared.js'

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
  // An agent called canvas_done: remember it on its node (drives the "Concluído" badge).
  useEffect(() => api.onDone(({ from, summary, t }) => setState((s) => ({ ...s, list: s.list.map((w) => (w.nodes.some((n) => n.id === from) ? { ...w, nodes: w.nodes.map((n) => (n.id === from ? { ...n, data: { ...n.data, lastDone: { summary, t } } } : n)) } : w)) }))), [])
  const [focus, setFocus] = useState(null) // { nodeId, n }: Canvas pans to it
  const [palette, setPalette] = useState(false)
  const goTo = useCallback((wsId, nodeId) => {
    if (wsId) setState((s) => ({ ...s, active: wsId }))
    if (nodeId) setFocus({ nodeId, n: Date.now() })
  }, [])
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o) }
    }
    window.addEventListener('keydown', key, true) // capture: works while a terminal has focus
    return () => window.removeEventListener('keydown', key, true)
  }, [])
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
    { label: 'Novo workspace', run: () => setState((s) => { const w = { id: uid('w'), name: `Workspace ${s.list.length + 1}`, nodes: [], edges: [] }; return { ...s, list: [...s.list, w], active: w.id } }) },
    { label: 'Configurações', run: () => setSettingsOpen(true) },
    { label: 'Verificar atualizações', run: () => { setUpdOpen(true); api.updateCheck() } },
    { label: 'Mostrar/ocultar barra lateral', run: toggleSide },
    { label: 'Interromper todos os agentes', run: () => api.interrupt() },
  ], [])

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
    <div className={'app' + (settings.handCursor ? ' hand' : '')}>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} api={api} mode={mode} update={{ state: upd, open: () => setUpdOpen(true), io: { export: exportWs, import: importWs } }} />
      <ApprovalDialog />
      <AwayDigest />
      {state && <Palette open={palette} onClose={() => setPalette(false)} state={state} goTo={goTo} actions={paletteActions} />}
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
          <Canvas ws={active} update={update} scores={state.scores || []} saveScore={saveScore} insertScore={insertScore} focus={focus} />
        </ReactFlowProvider>
      </main>
    </div>
    </CommCtx.Provider>
    </SettingsCtx.Provider>
  )
}
