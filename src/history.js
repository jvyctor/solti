// Undo/redo of a canvas (nodes + edges). Snapshots are compared without UI noise (selection, drag flags, measured size)
// and without runtime state that must survive an undo (conversation id, worktree, "done").
const NOISE = ['selected', 'dragging', 'resizing', 'measured']
export const RUNTIME = ['sid', 'ran', 'git', 'lastDone', 'unloaded', 'rev']

const strip = (n) => {
  const o = { ...n }
  for (const k of NOISE) delete o[k]
  return o
}
const comparable = (n) => {
  const o = strip(n)
  if (o.data) { o.data = { ...o.data }; for (const k of RUNTIME) delete o.data[k] }
  return o
}
export const snapshot = (ws) => ({ nodes: ws.nodes.map(strip), edges: ws.edges })
export const keyOf = (s) => JSON.stringify([s.nodes.map(comparable), s.edges])

export function createHistory(limit = 50) {
  let past = []
  let future = []
  let present = null
  return {
    reset(s) { past = []; future = []; present = s },
    push(s) {
      if (present && keyOf(present) === keyOf(s)) { present = s; return false } // only noise changed
      if (present) past.push(present)
      if (past.length > limit) past.shift()
      present = s
      future = []
      return true
    },
    undo() { if (!past.length) return null; future.push(present); present = past.pop(); return present },
    redo() { if (!future.length) return null; past.push(present); present = future.pop(); return present },
  }
}

// Restored nodes keep the runtime state of the node currently on the canvas.
export function applySnapshot(s, current) {
  const now = new Map(current.map((n) => [n.id, n]))
  return {
    nodes: s.nodes.map((n) => {
      const cur = now.get(n.id)
      if (!cur) return { ...n, selected: false }
      const data = { ...n.data }
      for (const k of RUNTIME) if (k in (cur.data || {})) data[k] = cur.data[k]; else delete data[k]
      return { ...n, selected: false, data }
    }),
    edges: s.edges,
  }
}
