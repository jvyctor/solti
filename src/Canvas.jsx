import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, useViewport } from '@xyflow/react'
import { Map as MapIcon, Minus, Plus, X } from 'lucide-react'
import { createHistory, snapshot, applySnapshot } from './history.js'
import { kidsInside } from './geometry.js'
import DiffNode from './DiffNode.jsx'
import PipelineNode from './PipelineNode.jsx'
import { ActivityDock } from './Activity.jsx'
import { Menu } from './Menu.jsx'
import { NewTerminalDialog } from './NewTerminalDialog.jsx'
const TeamDialog = lazy(() => import('./TeamDialog.jsx'))
const LookDialog = lazy(() => import('./LookDialog.jsx'))
import { TerminalNode } from './TerminalNode.jsx'
import { FilesNode, GroupNode, KnowledgeNode, NoteNode, PortalNode, TextNode } from './Nodes.jsx'
import { edgeTypes } from './edges.jsx'
import { UsageDock } from './Usage.jsx'
import { PRESET_LABELS, SettingsCtx, api, ask, fresh, mem, randomName, terms, uid } from './shared.js'
import { tr } from './i18n.js'

export const GRID_VARIANT = { lines: BackgroundVariant.Lines, dots: BackgroundVariant.Dots, cross: BackgroundVariant.Cross }

export const nodeTypes = { terminal: TerminalNode, note: NoteNode, group: GroupNode, text: TextNode, portal: PortalNode, files: FilesNode, diff: DiffNode, knowledge: KnowledgeNode, pipeline: PipelineNode }

export function Zoom({ children }) {
  const { zoomIn, zoomOut, setViewport } = useReactFlow()
  const { zoom } = useViewport()
  const [map, setMap] = useState(useContext(SettingsCtx).showMinimap)
  const color = (n) => (n.type === 'note' ? '#cfc27a' : n.type === 'group' ? '#2a2f3a' : '#2f7bff')
  return (
    <div className="zoom">
      {map && (
        <div className="mapbox">
          <MiniMap pannable zoomable nodeColor={color} nodeStrokeWidth={0} maskColor="rgba(15,17,21,.6)" style={{ position: 'static', margin: 0, width: 260, height: 150, background: 'transparent' }} />
          <button onClick={() => setMap(false)} aria-label={tr("Fechar mapa")}><X size={12} /></button>
        </div>
      )}
      {children}
      <button className={'mapbtn' + (map ? ' on' : '')} onClick={() => setMap((m) => !m)} aria-label={tr("Navegação")} title={tr("Navegação")}><MapIcon size={18} /></button>
      <div className="zoompill">
        <button onClick={() => zoomOut({ duration: 150 })} aria-label={tr("Diminuir zoom")}><Minus size={16} /></button>
        <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 150 })} title="100%">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomIn({ duration: 150 })} aria-label={tr("Aumentar zoom")}><Plus size={16} /></button>
      </div>
    </div>
  )
}

export function Canvas({ ws, update, scores, saveScore, insertScore, focus }) {
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

  const SIZES = { terminal: { width: 520, height: 340 }, portal: { width: 560, height: 380 }, group: { width: 640, height: 400 }, files: { width: 280, height: 360 }, diff: { width: 560, height: 400 }, knowledge: { width: 320, height: 240 }, pipeline: { width: 420, height: 480 }, note: { width: 280, height: 200 } }
  const { screenToFlowPosition, deleteElements } = useReactFlow()
  // Every deletion path (✕, menu, keyboard) funnels through here; ptys die in onNodesChange afterwards.
  const onBeforeDelete = async ({ nodes, edges }) => {
    const t = nodes.filter((n) => n.type === 'terminal')
    if (!t.length) return { nodes, edges }
    const wt = t.filter((n) => n.data.git?.worktree)
    const dirty = await Promise.all(wt.map(async (n) => (await api.gitDirty(n.data.cwd)).dirty))
    const note = !wt.length ? '' : dirty.some(Boolean) ? tr(' Há worktree com alterações não salvas: ele será mantido.') : tr(' O worktree será removido (a branch continua no repositório).')
    const msg = (t.length === 1 ? tr('Excluir o terminal "{0}"?', [t[0].data.name]) : tr('Excluir {0} terminais?', [t.length])) + note
    if (!(await ask(msg))) return false
    // The pty must die first or Windows keeps the folder locked.
    wt.forEach((n, i) => { if (!dirty[i]) { api.kill(n.id); setTimeout(() => api.gitRemoveWorktree(n.data.cwd), 500) } })
    return { nodes, edges }
  }
  const [dlg, setDlg] = useState(null) // { pos } while "Novo Terminal…" is open
  const [teamDlg, setTeamDlg] = useState(null) // { pos } while "Time pronto…" is open
  const [lookId, setLookId] = useState(null) // terminal whose appearance is being edited
  useEffect(() => {
    const open = () => setTeamDlg({ pos: { x: 80, y: 80 + ws.nodes.length * 20 } })
    window.addEventListener('ac:team', open) // from the command palette
    return () => window.removeEventListener('ac:team', open)
  }, [ws.nodes.length])

  // Pan to a node on request (palette, new agent). The node may need a moment to be measured after mount.
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!focus || !ws.nodes.some((n) => n.id === focus.nodeId)) return
    const t = setTimeout(() => fitView({ nodes: [{ id: focus.nodeId }], duration: 500, maxZoom: 1, padding: 0.35 }), 250)
    return () => clearTimeout(t)
  }, [focus?.n])

  // Moving a group carries the nodes sitting inside it (decided when the drag starts).
  const gdrag = useRef(null)
  const onNodeDragStart = (_e, n) => {
    gdrag.current = n.type === 'group' ? { id: n.id, from: n.position, kids: new Map(kidsInside(n, ws.nodes).map((k) => [k.id, k.position])) } : null
  }
  const onNodeDrag = (_e, n) => {
    const g = gdrag.current
    if (!g || g.id !== n.id || !g.kids.size) return
    const dx = n.position.x - g.from.x
    const dy = n.position.y - g.from.y
    setNodes((ns) => ns.map((k) => (g.kids.has(k.id) ? { ...k, position: { x: g.kids.get(k.id).x + dx, y: g.kids.get(k.id).y + dy } } : k)))
  }

  // Undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y). Typing inside terminals, inputs and notes keeps its own undo.
  const hist = useRef(createHistory())
  const restoring = useRef(false)
  useEffect(() => { hist.current.reset(snapshot(ws)) }, [])
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return }
    const t = setTimeout(() => hist.current.push(snapshot(ws)), 500)
    return () => clearTimeout(t)
  }, [ws.nodes, ws.edges])
  const wsRef = useRef(ws)
  wsRef.current = ws
  const travel = useCallback((dir) => {
    const s = dir < 0 ? hist.current.undo() : hist.current.redo()
    if (!s) return
    const keep = new Set(s.nodes.map((n) => n.id))
    wsRef.current.nodes.forEach((n) => n.type === 'terminal' && !keep.has(n.id) && api.kill(n.id)) // undoing an "add" must not leave its pty running
    restoring.current = true
    update((w) => ({ ...w, ...applySnapshot(s, w.nodes) }))
  }, [update])
  useEffect(() => {
    const menu = (e) => travel(e.detail)
    window.addEventListener('ac:history', menu)
    return () => window.removeEventListener('ac:history', menu)
  }, [travel])
  useEffect(() => {
    const key = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable], .xterm')) return
      const k = e.key.toLowerCase()
      if (k === 'z' || k === 'y') { e.preventDefault(); travel(k === 'y' || e.shiftKey ? 1 : -1) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [travel])
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
            { label: tr("Copiar"), run: () => navigator.clipboard.writeText(terms.get(n.id)?.getSelection() || ''), disabled: !terms.get(n.id)?.hasSelection() },
            { label: tr("Colar"), run: () => navigator.clipboard.readText().then((s) => api.write(n.id, s)) },
            { label: tr("Selecionar tudo"), run: () => terms.get(n.id)?.selectAll() },
            '-',
          ]
        : []),
      ...(n.type !== 'note' && n.type !== 'text' ? [{ label: tr("Renomear"), run: () => focusInput('data-rename', n.id) }] : []),
      ...(t ? [{ label: tr("Reenviar briefing do papel"), run: () => api.brief(n.id, { name: d.name, maestro: !!d.maestro, instructions: d.instructions, knowledge: ws.nodes.find((x) => x.type === 'knowledge')?.data.text || '' }) }, { label: tr("Monitorar atividade"), checked: d.monitor, run: () => patch(n.id, { monitor: !d.monitor }) }, '-'] : []),
      ...(t
        ? [
            { label: tr("Histórico…"), run: () => window.dispatchEvent(new CustomEvent('ac:agent-history', { detail: { nodeId: n.id } })) },
            { label: tr("Aparência…"), run: () => setLookId(n.id) },
            { label: d.blur ? tr("Focar") : tr("Desfocar"), run: () => patch(n.id, { blur: !d.blur }) },
            { label: tr("Recarregar (retoma a conversa)"), run: () => { api.kill(n.id); patch(n.id, { rev: (d.rev || 0) + 1, unloaded: false }) } },
            { label: tr("Nova conversa"), run: () => { api.kill(n.id); patch(n.id, { rev: (d.rev || 0) + 1, unloaded: false, sid: undefined, ran: false }) } },
            { label: tr("Descarregar"), run: () => { api.kill(n.id); patch(n.id, { unloaded: true }) } },
            { label: d.maestro ? tr("Papel: Maestro → Agente") : tr("Papel: Agente → Maestro"), run: () => setNodes((ns) => ns.map((x) => (x.type === 'terminal' ? { ...x, data: { ...x.data, maestro: x.id === n.id ? !d.maestro : false } } : x))) },
            '-',
          ]
        : []),
      { label: tr("Copiar elemento"), run: () => (mem.clip = { ...n, data: fresh(n.data) }) },
      { label: tr("Duplicar"), run: () => spawnCopy(n) },
      { label: d.locked ? tr("Desbloquear") : tr("Bloquear"), run: () => setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...x, draggable: !!d.locked, deletable: !!d.locked, data: { ...x.data, locked: !d.locked } } : x))) },
      { label: tr("Apagar"), danger: true, disabled: d.locked, run: () => deleteElements({ nodes: [{ id: n.id }] }) },
      '-',
      { label: tr("Partituras"), sub: scoreMenu() },
    ]
  }
  const scoreMenu = () => [
    { label: tr("Salvar workspace como partitura"), run: saveScore },
    ...scores.map((s) => ({ label: tr("Inserir: {0}", [s.name]), run: () => insertScore(s) })),
  ]
  const paneMenu = (pos) => [
    {
      label: tr("Adicionar"),
      sub: [
        {
          label: tr("Terminal"),
          sub: [
            { label: tr("Novo Terminal…"), run: () => setDlg({ pos }) },
            { label: tr("Time pronto…"), run: () => setTeamDlg({ pos }) },
            '-',
            ...Object.entries(PRESET_LABELS).map(([k, label]) => ({ label, run: () => addTerminal(k, pos) })),
          ],
        },
        { label: tr("Nota"), run: () => add('note', { text: '' }, pos) },
        { label: tr("Árvore de Arquivos"), run: () => add('files', {}, pos) },
        { label: tr("Revisão (Diff)"), run: () => add('diff', {}, pos) },
        { label: tr("Fluxo (pipeline)"), run: () => add('pipeline', { steps: [], input: '' }, pos) },
        { label: tr("Conhecimento do projeto"), disabled: ws.nodes.some((n) => n.type === 'knowledge'), run: () => add('knowledge', { text: '' }, pos) },
        { label: tr("Portal"), run: () => add('portal', { url: 'https://www.google.com' }, pos) },
        { label: tr("Texto"), run: () => add('text', { text: '' }, pos) },
        { label: tr("Grupo"), run: () => add('group', { name: 'Grupo' }, pos) },
      ],
    },
    { label: tr("Desfazer"), run: () => travel(-1) },
    { label: tr("Refazer"), run: () => travel(1) },
    { label: tr("Colar"), disabled: !mem.clip, run: () => mem.clip && setNodes((ns) => [...ns, { ...mem.clip, id: uid('n'), selected: false, position: pos }]) },
    { label: tr("Partituras"), sub: scoreMenu() },
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
      <Suspense fallback={null}>
      {lookId && ws.nodes.some((n) => n.id === lookId) && (
        <LookDialog node={ws.nodes.find((n) => n.id === lookId)} cfg={cfg} onClose={() => setLookId(null)} onChange={(look) => patch(lookId, { look })} />
      )}
      {teamDlg && (
        <TeamDialog
          taken={new Set(ws.nodes.map((n) => n.data.name))}
          origin={teamDlg.pos}
          hasMaestro={ws.nodes.some((n) => n.type === 'terminal' && n.data.maestro)}
          onClose={() => setTeamDlg(null)}
          onCreate={({ nodes, edges }) => { update((w) => ({ ...w, nodes: [...w.nodes, ...nodes], edges: [...w.edges, ...edges] })); setTeamDlg(null) }}
        />
      )}
      </Suspense>
      {ws.nodes.length === 0 && (
        <div className="empty-canvas" role="region" aria-label={tr("Canvas vazio")}>
          <h2>{tr("Este canvas está vazio")}</h2>
          <p>{tr("Crie um time de agentes já ligados entre si, ou comece com um terminal.")}</p>
          <div className="empty-actions">
            <button className="primary" onClick={() => setTeamDlg({ pos: { x: 80, y: 80 } })}>{tr("Criar um time")}</button>
            <button onClick={() => setDlg({ pos: { x: 80, y: 80 } })}>{tr("Novo terminal")}</button>
            <button onClick={() => window.dispatchEvent(new Event('ac:demo'))} title={tr("Agentes simulados, sem precisar de nenhum CLI de IA")}>{tr("Ver a demonstração")}</button>
          </div>
          <small>{tr("Dica: clique com o botão direito no fundo para adicionar qualquer coisa, ou use Ctrl+K.")}</small>
        </div>
      )}
      <ReactFlow deleteKeyCode={['Backspace', 'Delete']} onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} nodes={ws.nodes} edges={shownEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} connectionRadius={48} onBeforeDelete={onBeforeDelete} onConnectEnd={onConnectEnd} defaultEdgeOptions={{ type: 'floating' }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeContextMenu={(e, n) => openMenu(e, nodeMenu(n))} onPaneContextMenu={(e) => openMenu(e, paneMenu(screenToFlowPosition({ x: e.clientX, y: e.clientY })))} colorMode={cfg.mode} snapToGrid={cfg.eff.snap} snapGrid={[cfg.eff.snapSize, cfg.eff.snapSize]} className={cfg.eff.edgeFlow ? 'flow' : undefined} minZoom={0.1} fitView proOptions={{ hideAttribution: true }}>
        {cfg.eff.gridStyle !== 'none' && <Background variant={GRID_VARIANT[cfg.eff.gridStyle]} color={cfg.eff.grid} gap={cfg.eff.gap} size={cfg.eff.size} lineWidth={cfg.eff.size} />}
        <Zoom><UsageDock ws={ws} update={update} /><ActivityDock /></Zoom>
      </ReactFlow>
    </>
  )
}
