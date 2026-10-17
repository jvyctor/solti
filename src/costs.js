// Agent usage and estimated cost, polled for every agent in every workspace (not only the open one), so
// budgets hold for agents working in the background. Pure helpers are exported for the tests.
import { useEffect, useRef, useState } from 'react'
import { api } from './shared.js'

const POLL = 15000
const METERED = ['claude', 'codex', 'gemini']

export const meteredAgents = (state) =>
  (state?.list || []).flatMap((w) => w.nodes.filter((n) => n.type === 'terminal' && METERED.includes(n.data.preset) && n.data.sid).map((n) => ({ ws: w.id, n })))

// { total, partial } for one workspace: partial = some agent's model has no known price.
export function wsCost(w, byNode) {
  let total = 0, partial = false
  for (const n of w.nodes) {
    const u = byNode[n.id]
    if (!u || !u.tokens) continue
    if (u.cost == null) partial = true
    else total += u.cost
  }
  return { total, partial }
}

// Workspaces whose spending reached their budget (ws.budget, US$; 0/empty = no budget).
export const overBudget = (state, byNode) => (state?.list || []).filter((w) => w.budget > 0 && wsCost(w, byNode).total >= w.budget)

export function useUsage(state) {
  const [byNode, setByNode] = useState({})
  const stateRef = useRef(state)
  stateRef.current = state
  // Re-poll at once when agents are added, removed or restarted with a new conversation.
  const key = meteredAgents(state).map(({ n }) => `${n.id}:${n.data.sid}:${n.data.preset}`).join('|')
  useEffect(() => {
    let alive = true
    let busy = false
    const poll = async () => {
      if (busy) return
      busy = true
      const next = {}
      const agents = meteredAgents(stateRef.current)
      for (const { n } of agents) {
        try { next[n.id] = await api.agentTokens(n.id, n.data.preset, n.data.sid, n.data.cwd) } catch {}
      }
      busy = false
      // The main process books what grew since the last reading on today (daily spend per workspace).
      api.costsTick(agents.filter(({ n }) => next[n.id]).map(({ ws, n }) => ({ id: n.id, ws, sid: n.data.sid, cost: next[n.id].cost })))
      if (alive) setByNode(next)
    }
    poll()
    const t = setInterval(poll, POLL)
    return () => { alive = false; clearInterval(t) }
  }, [key])
  return byNode
}
