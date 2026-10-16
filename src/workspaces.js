// Export / import of workspaces as a JSON file. Imported terminals start fresh: no worktree, conversation or "done" state.
const FORMAT = 'agent-canvas-workspaces'

export const exportable = (state) => ({ format: FORMAT, version: 1, list: state.list, scores: state.scores || [] })

const fresh = (d) => {
  const { git, sid, ran, lastDone, unloaded, rev, ...rest } = d || {}
  return rest
}

// New ids everywhere (nodes become pty ids, so they must not collide with existing ones).
export function mergeImport(state, file, uid) {
  if (file?.format !== FORMAT || !Array.isArray(file.list)) throw new Error('Arquivo não é uma exportação do Agent Canvas.')
  const names = new Set(state.list.map((w) => w.name))
  const added = file.list.map((w) => {
    const ids = new Map((w.nodes || []).map((n) => [n.id, uid('n')]))
    let name = w.name || 'Importado'
    for (let i = 2; names.has(name); i++) name = `${w.name} (${i})`
    names.add(name)
    return {
      ...w,
      id: uid('w'),
      name,
      locked: false,
      nodes: (w.nodes || []).map((n) => ({ ...n, id: ids.get(n.id), selected: false, data: fresh(n.data) })),
      edges: (w.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, id: uid('e'), source: ids.get(e.source), target: ids.get(e.target) })),
    }
  })
  return { state: { ...state, list: [...state.list, ...added], scores: [...(state.scores || []), ...(file.scores || [])] }, added: added.length }
}
