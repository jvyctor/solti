// The app shell: wires the state hooks (src/app/) to the canvas, the sidebar and the dialogs.
//   useWorkspaces (canvas state, agents' events, demo, restore points, import/export) · useAppSettings (settings, theme)
//   useUsage + useGuards (cost, token limit, budgets) · usePipelines (pipeline runs) · useTalking (animated ropes)
//   useConflicts (same file changed in two worktrees)
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Menu as MenuIcon } from 'lucide-react'
import { useUpdate, UpdateToast, UpdateDialog } from './Updates.jsx'
import { ApprovalDialog, AwayDigest } from './Activity.jsx'
import { ErrorToast } from './ErrorToast.jsx'
import { Canvas } from './Canvas.jsx'
import { Sidebar } from './Sidebar.jsx'
import { useUsage } from './costs.js'
import { notify } from './notify.js'
import { CommCtx, ConflictCtx, PipeCtx, SettingsCtx, UsageCtx, api, uid } from './shared.js'
import { tr } from './i18n.js'
import { useWorkspaces } from './app/useWorkspaces.js'
import { useAppSettings } from './app/useAppSettings.js'
import { useGuards } from './app/useGuards.js'
import { usePipelines } from './app/usePipelines.js'
import { useTalking } from './app/useTalking.js'
import { useConflicts } from './app/useConflicts.js'
import { ConfirmDialog } from './app/ConfirmDialog.jsx'
import { WhatsNew } from './WhatsNew.jsx'
// Dialogs load when first opened.
const SettingsDialog = lazy(() => import('./Settings.jsx'))
const Palette = lazy(() => import('./Palette.jsx'))
const HistoryDialog = lazy(() => import('./History.jsx'))
const TemplatesDialog = lazy(() => import('./TemplatesDialog.jsx'))
const Onboarding = lazy(() => import('./Diagnostics.jsx').then((m) => ({ default: m.Onboarding })))

export default function App() {
  const [focus, setFocus] = useState(null) // { nodeId, n }: Canvas pans to it
  const ws = useWorkspaces({ onSpawned: (nodeId) => setFocus({ nodeId, n: Date.now() }) })
  const { state, setState, stateRef, update, remove, saveScore, insertScore, points, io } = ws
  const { settings, settingsRef, mode, ctx } = useAppSettings()

  const byNode = useUsage(state)
  const usageRef = useRef(byNode)
  usageRef.current = byNode
  const usage = useGuards({ state, byNode, settings, findNode: ws.findNode })
  const pipe = usePipelines(ws, usageRef, settingsRef)
  const talking = useTalking(settingsRef)
  const conflicts = useConflicts(stateRef)
  const upd = useUpdate(api)

  useEffect(() => api.onDone(({ from, name, summary }) => {
    if (settingsRef.current?.notifyDone) notify(tr("{0} concluiu", [name || from]), summary, { nodeId: from })
  }), [])

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

  // Agent history dialog: { start: node id | '' } while open.
  const [history, setHistory] = useState(null)
  useEffect(() => {
    const h = (e) => setHistory({ start: e.detail?.nodeId || '' })
    window.addEventListener('ac:agent-history', h)
    return () => window.removeEventListener('ac:agent-history', h)
  }, [])
  // Template gallery, opened from the sidebar or Ctrl+K.
  const [templates, setTemplates] = useState(false)
  useEffect(() => {
    const h = () => setTemplates(true)
    window.addEventListener('ac:templates', h)
    return () => window.removeEventListener('ac:templates', h)
  }, [])
  const historyAgents = useMemo(() => (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal').map((n) => ({ id: n.id, name: state.list.length > 1 ? `${n.data.name} (${w.name})` : n.data.name }))), [state])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState(null) // tab to open on (e.g. 'dados' from the palette)
  const [palette, setPalette] = useState(false)
  const [updOpen, setUpdOpen] = useState(false)
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o) }
    }
    window.addEventListener('keydown', key, true) // capture: works while a terminal has focus
    return () => window.removeEventListener('keydown', key, true)
  }, [])
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

  // What a routine can aim at: every terminal and every pipeline, in every workspace.
  const targets = useMemo(() => (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal' || n.type === 'pipeline').map((n) => (n.type === 'terminal' ? { type: 'agent', id: n.id, label: `${n.data.name} (${w.name})` } : { type: 'pipeline', id: n.id, label: `${n.data.name || 'Fluxo'} (${w.name})` }))), [state])

  const [sideOpen, setSideOpen] = useState(() => {
    try { return localStorage.getItem('sideOpen') !== '0' } catch { return true }
  })
  const toggleSide = () => setSideOpen((o) => {
    try { localStorage.setItem('sideOpen', o ? '0' : '1') } catch {}
    return !o
  })

  const paletteActions = useMemo(() => [
    { label: tr("Novo workspace"), run: () => setState((s) => { const w = { id: uid('w'), name: `Workspace ${s.list.length + 1}`, nodes: [], edges: [] }; return { ...s, list: [...s.list, w], active: w.id } }) },
    { label: tr("Criar time pronto"), run: () => window.dispatchEvent(new Event('ac:team')) },
    { label: tr("Modelos de workspace…"), run: () => setTemplates(true) },
    { label: tr("Abrir a demonstração"), run: () => window.dispatchEvent(new Event('ac:demo')) },
    { label: tr("Configurações"), run: () => setSettingsOpen(true) },
    { label: tr("Verificar atualizações"), run: () => { setUpdOpen(true); api.updateCheck() } },
    { label: tr("Novidades desta versão"), run: () => window.dispatchEvent(new Event('ac:whats-new')) },
    { label: tr("Mostrar/ocultar barra lateral"), run: toggleSide },
    { label: tr("Interromper todos os agentes"), run: () => api.interrupt() },
    { label: tr("Histórico dos agentes"), run: () => setHistory({ start: '' }) },
    { label: tr("Criar ponto de restauração"), run: () => points.create(tr('Ponto manual')) },
    { label: tr("Pontos de restauração…"), run: () => { setSettingsTab('dados'); setSettingsOpen(true) } },
  ], [points])

  if (!state || !settings) return null
  const active = state.list.find((w) => w.id === state.active)
  return (
    <SettingsCtx.Provider value={ctx}>
    <CommCtx.Provider value={talking}>
    <PipeCtx.Provider value={pipe}>
    <UsageCtx.Provider value={usage}>
    <ConflictCtx.Provider value={conflicts}>
    <div className={'app' + (settings.handCursor ? ' hand' : '')}>
      <Suspense fallback={null}>
        {settingsOpen && <SettingsDialog open={settingsOpen} onOpenChange={(o) => { setSettingsOpen(o); if (!o) setSettingsTab(null) }} startTab={settingsTab} settings={settings} api={api} mode={mode} update={{ targets, state: upd, open: () => setUpdOpen(true), io }} />}
      </Suspense>
      <ApprovalDialog />
      <Suspense fallback={null}>{!settings.onboarded && state.list.every((w) => w.nodes.length === 0) && <Onboarding open onClose={() => api.settingsSet({ onboarded: true })} onTeam={() => setTimeout(() => window.dispatchEvent(new Event('ac:team')), 200)} onDemo={() => window.dispatchEvent(new Event('ac:demo'))} />}</Suspense>
      <AwayDigest />
      <ErrorToast />
      <WhatsNew settings={settings} />
      <Suspense fallback={null}>{history && <HistoryDialog open onClose={() => setHistory(null)} agents={historyAgents} start={history.start} />}</Suspense>
      <Suspense fallback={null}>{templates && <TemplatesDialog state={state} setState={setState} onUse={ws.addWorkspace} onClose={() => setTemplates(false)} />}</Suspense>
      <Suspense fallback={null}>{palette && <Palette open={palette} onClose={() => setPalette(false)} state={state} goTo={goTo} actions={paletteActions} />}</Suspense>
      <UpdateToast state={upd} onOpen={() => { setUpdOpen(true); api.updateDownload() }} />
      <UpdateDialog open={updOpen} onOpenChange={setUpdOpen} state={upd} api={api} />
      <ConfirmDialog />
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
    </ConflictCtx.Provider>
    </UsageCtx.Provider>
    </PipeCtx.Provider>
    </CommCtx.Provider>
    </SettingsCtx.Provider>
  )
}
