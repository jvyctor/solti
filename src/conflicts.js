// Review helpers, pure so they are unit-tested:
//  - overlaps: agents in worktrees of the same repository changing the same files (a merge conflict waiting to happen)
//  - patchLines: a unified diff with old/new line numbers, so a comment can point at "file:line"
//  - reviewMessage: line comments -> the instruction typed into the agent

// changes: [{ id, repo, files: [file] }] -> [{ file, repo, agents: [id, …] }] for files touched by 2+ agents of one repo.
export function overlaps(changes) {
  const by = new Map() // repo \0 file -> Set(id)
  for (const c of changes) for (const f of c.files || []) {
    const k = `${c.repo}\0${f}`
    if (!by.has(k)) by.set(k, new Set())
    by.get(k).add(c.id)
  }
  return [...by].filter(([, ids]) => ids.size > 1).map(([k, ids]) => {
    const [repo, file] = k.split('\0')
    return { file, repo, agents: [...ids].sort() }
  }).sort((a, b) => a.file.localeCompare(b.file))
}

// "file|a|b" keys, to notify only about overlaps that are new since the last check.
export const overlapKeys = (list) => new Set(list.map((o) => [o.file, ...o.agents].join('|')))

// Unified diff -> [{ text, kind: add|del|ctx|hunk|meta, old, new }] with the line numbers in the old and new file.
export function patchLines(patch) {
  const out = []
  let o = 0, n = 0
  for (const text of String(patch || '').split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (h) { o = Number(h[1]); n = Number(h[2]); out.push({ text, kind: 'hunk' }); continue }
    if (!o && !n) { out.push({ text, kind: 'meta' }); continue } // diff --git, index, ---, +++
    if (text.startsWith('+')) out.push({ text, kind: 'add', new: n++ })
    else if (text.startsWith('-')) out.push({ text, kind: 'del', old: o++ })
    else if (text.startsWith('\\')) out.push({ text, kind: 'meta' }) // "\ No newline at end of file"
    else out.push({ text, kind: 'ctx', old: o++, new: n++ })
  }
  return out
}

// comments: [{ file, line, removed, code, text }] -> one message for the agent ('' when there are none).
export function reviewMessage(comments, { branch, tr = (s, a = []) => s.replace(/\{(\d)\}/g, (_m, i) => a[i]) } = {}) {
  if (!comments.length) return ''
  const items = comments.map((c) => {
    const where = c.removed ? tr('{0}, linha {1} removida', [c.file, c.line]) : `${c.file}:${c.line}`
    const code = String(c.code || '').trim().slice(0, 120)
    return `- ${where}${code ? ` (\`${code}\`)` : ''}: ${String(c.text).trim()}`
  })
  const head = branch ? tr('Revisão das suas mudanças na branch {0}. Ajuste cada ponto:', [branch]) : tr('Revisão das suas mudanças. Ajuste cada ponto:')
  return [head, ...items, tr('Ao terminar, chame canvas_done com o que mudou.')].join('\n')
}
