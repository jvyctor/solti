// Ctrl+K search over what lives on the canvases: notes, texts, project knowledge, pipelines (steps and run reports),
// groups and file/diff node names. Pure, so it is unit-tested.
const norm = (s) => String(s || '').toLowerCase()

// A short piece of `text` around the first match of `needle` (already lower-case).
export function excerpt(text, needle, span = 60) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const at = norm(t).indexOf(needle)
  if (at < 0) return t.slice(0, span * 2)
  const from = Math.max(0, at - span / 2)
  return (from > 0 ? '…' : '') + t.slice(from, from + span * 2) + (from + span * 2 < t.length ? '…' : '')
}

// What a node offers to search: [kind, text] pairs.
function fields(n) {
  const d = n.data || {}
  switch (n.type) {
    case 'note': return [['note', `${d.title || ''} ${d.text || ''}`]]
    case 'text': return [['text', d.text]]
    case 'knowledge': return [['knowledge', d.text]]
    case 'group': return [['group', d.name]]
    case 'pipeline': return [
      ['pipeline', `${d.name || ''} ${d.input || ''} ${(d.steps || []).map((s) => s.prompt).join(' ')}`],
      ...(d.runs || []).filter((r) => r.report).map((r) => ['report', r.report]),
    ]
    default: return []
  }
}

// state: { list: [{ id, name, nodes }] }. Returns [{ kind, wsId, wsName, nodeId, label, text }], at most `limit`.
export function searchNodes(state, q, limit = 20) {
  const needle = norm(q).trim()
  if (needle.length < 2) return []
  const out = []
  for (const w of state?.list || []) {
    for (const n of w.nodes) {
      for (const [kind, text] of fields(n)) {
        if (!norm(text).includes(needle)) continue
        out.push({ kind, wsId: w.id, wsName: w.name, nodeId: n.id, label: excerpt(text, needle), text })
        if (out.length >= limit) return out
      }
    }
  }
  return out
}
