// Agents in worktrees of the same repository that change the same files: checked every 30 s (only when two or more
// such agents exist). A new overlap is notified once and goes to the activity timeline; the Diff node shows them.
import { useEffect, useRef, useState } from 'react'
import { api } from '../shared.js'
import { overlapKeys, overlaps } from '../conflicts.js'
import { notify } from '../notify.js'
import { tr } from '../i18n.js'

const EVERY = 30000

export function useConflicts(stateRef) {
  const [list, setList] = useState([]) // [{ file, repo, agents }]
  const known = useRef(new Set())
  useEffect(() => {
    let alive = true
    const check = async () => {
      const agents = (stateRef.current?.list || []).flatMap((w) => w.nodes).filter((n) => n.type === 'terminal' && n.data.git?.worktree && n.data.cwd)
      const repos = new Map()
      agents.forEach((n) => repos.set(n.data.git.repo, (repos.get(n.data.git.repo) || 0) + 1))
      const watched = agents.filter((n) => repos.get(n.data.git.repo) > 1)
      if (!watched.length) { if (alive) setList([]); known.current = new Set(); return }
      const changes = await Promise.all(watched.map(async (n) => {
        const r = await api.gitChanges(n.data.cwd, n.data.git.base).catch(() => ({ files: [] }))
        return { id: n.id, repo: n.data.git.repo, files: (r.files || []).map((f) => f.file) }
      }))
      if (!alive) return
      const found = overlaps(changes)
      const keys = overlapKeys(found)
      const name = (id) => agents.find((n) => n.id === id)?.data.name || id
      for (const o of found) {
        const k = [o.file, ...o.agents].join('|')
        if (known.current.has(k)) continue
        const who = o.agents.map(name).join(', ')
        notify(tr('Possível conflito: {0}', [o.file]), tr('{0} estão mudando o mesmo arquivo em worktrees diferentes.', [who]), { nodeId: o.agents[0] })
        api.activityRecord({ kind: 'conflict', from: who, text: tr('Mesmo arquivo alterado em worktrees diferentes: {0}', [o.file]) })
      }
      known.current = keys
      setList(found)
    }
    check()
    const t = setInterval(check, EVERY)
    window.addEventListener('ac:conflicts-check', check)
    return () => { alive = false; clearInterval(t); window.removeEventListener('ac:conflicts-check', check) }
  }, [])
  return list
}
