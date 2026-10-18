// Every workspace (the canvas state), kept in sync with the main process and on disk, plus everything that changes
// it from outside the canvas: agents (spawn, remember, done), the demo, restore points, scores, import/export.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRESET_LABELS, api, ask, describe, fresh, uid } from '../shared.js'
import { exportable, mergeImport } from '../workspaces.js'
import { demoWorkspace } from '../demo.js'
import { tr } from '../i18n.js'

const patchIn = (s, id, p) => ({ ...s, list: s.list.map((w) => (w.nodes.some((n) => n.id === id) ? { ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)) } : w)) })

// onSpawned(nodeId): a new agent appeared (the canvas pans to it).
export function useWorkspaces({ onSpawned } = {}) {
  const [state, setState] = useState(null) // { list:[{id,name,nodes,edges,…}], active, scores }
  const loaded = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = state

  const patchNode = useCallback((id, p) => setState((s) => patchIn(s, id, p)), [])
  const findNode = useCallback((nid) => stateRef.current?.list.flatMap((w) => w.nodes).find((n) => n.id === nid) || null, [])
  const wsOf = useCallback((nid) => stateRef.current?.list.find((w) => w.nodes.some((n) => n.id === nid)) || null, [])
  // Changes the active workspace.
  const update = useCallback((fn) => setState((s) => ({ ...s, list: s.list.map((w) => (w.id === s.active ? fn(w) : w)) })), [])

  useEffect(() => {
    api.load().then((saved) => {
      const first = { id: uid('w'), name: 'Principal', nodes: [], edges: [] }
      if (saved?.list) setState(saved)
      else if (saved?.nodes) setState({ list: [{ ...first, nodes: saved.nodes, edges: saved.edges }], active: first.id }) // legacy single-canvas file
      else setState({ list: [first], active: first.id })
      loaded.current = true
    })
  }, [])

  // The bridge sees every workspace so background agents keep talking; the file is saved shortly after each change.
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

  // An agent called canvas_remember: append to its workspace's knowledge node (created on first use).
  useEffect(() => api.onKnowledge(({ from, text }) => setState((s) => {
    const w = s.list.find((x) => x.nodes.some((n) => n.id === from))
    if (!w) return s
    const k = w.nodes.find((n) => n.type === 'knowledge')
    const nodes = k
      ? w.nodes.map((n) => (n === k ? { ...n, data: { ...n.data, text: ((n.data.text || '') + '\n' + text).trim() } } : n))
      : [...w.nodes, { id: uid('n'), type: 'knowledge', style: { width: 320, height: 240 }, position: { x: 40, y: -300 }, data: { text } }]
    return { ...s, list: s.list.map((x) => (x === w ? { ...x, nodes } : x)) }
  })), [])

  // The maestro asked (canvas_spawn) for a new agent: add it next to the maestro, roped to it, in the maestro's workspace.
  const onSpawnedRef = useRef(onSpawned)
  onSpawnedRef.current = onSpawned
  useEffect(() => api.onSpawn(({ from, name, preset, instructions }) => {
    const id = uid('n')
    onSpawnedRef.current?.(id)
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
  }), [])

  // An agent called canvas_done: remember it on its node (drives the "Concluído" badge).
  useEffect(() => api.onDone(({ from, summary, t }) => setState((s) => patchIn(s, from, { lastDone: { summary, t } }))), [])

  // Demo workspace (simulated agents, no AI CLI needed). Reuses the existing one.
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

  // Adds a workspace (from a template, an import…) and opens it.
  const addWorkspace = useCallback((w) => setState((s) => ({ ...s, list: [...s.list, w], active: w.id })), [])

  const remove = useCallback(async (id) => {
    const w = stateRef.current.list.find((x) => x.id === id)
    if (!(await ask(tr("Excluir o workspace \"{0}\" e seus terminais?", [w?.name])))) return
    w?.nodes.forEach((n) => n.type === 'terminal' && api.kill(n.id))
    setState((s) => {
      const list = s.list.filter((x) => x.id !== id)
      return { ...s, list, active: s.active === id ? list[0].id : s.active }
    })
  }, [])

  // Scores = saved layouts (nodes + edges). Inserting remaps ids so terminals get fresh ptys.
  const saveScore = () => setState((s) => {
    const w = s.list.find((x) => x.id === s.active)
    const nodes = w.nodes.map((n) => ({ ...n, selected: false, data: { ...n.data, maestro: false } }))
    return { ...s, scores: [...(s.scores || []), { name: `${w.name} ${(s.scores?.length || 0) + 1}`, nodes, edges: w.edges }] }
  })
  const insertScore = (sc) => update((w) => {
    const ids = new Map(sc.nodes.map((n) => [n.id, uid('n')]))
    const nodes = sc.nodes.map((n) => ({ ...n, id: ids.get(n.id), data: { ...fresh(n.data), rev: 0, unloaded: false } }))
    const edges = sc.edges.map((e) => ({ ...e, id: uid('e'), source: ids.get(e.source), target: ids.get(e.target) }))
    return { ...w, nodes: [...w.nodes, ...nodes], edges: [...w.edges, ...edges] }
  })

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

  const io = useMemo(() => ({
    export: async () => {
      const r = await api.exportWorkspaces(exportable(stateRef.current))
      return r.path ? `Exportado para ${r.path}` : ''
    },
    import: async () => {
      const r = await api.importWorkspaces()
      if (r.canceled) return ''
      if (r.error) return r.error
      try {
        const { state: next, added } = mergeImport(stateRef.current, r.data, uid)
        setState(next)
        return `${added} workspace(s) importado(s).`
      } catch (e) { return e.message }
    },
    points,
  }), [points])

  return { state, setState, stateRef, patchNode, findNode, wsOf, update, addWorkspace, remove, saveScore, insertScore, points, io }
}
