// Spending guards: the per-agent token limit and the workspace budgets. Both interrupt agents once per crossing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmt, money } from '../shared.js'
import { overBudget, wsCost } from '../costs.js'
import { isRunning, stopPipeline } from '../pipelineRunner.js'
import { notify } from '../notify.js'
import { tr } from '../i18n.js'

export function useGuards({ state, byNode, settings, findNode }) {
  // Per-agent token limit: over it, the agent is interrupted once (until it drops below, e.g. a new conversation).
  const [limited, setLimited] = useState(() => new Set())
  const limitedRef = useRef(limited)
  useEffect(() => {
    const max = settings?.tokenLimit || 0
    const next = new Set(Object.entries(byNode).filter(([, u]) => max > 0 && u.tokens >= max).map(([id]) => id))
    for (const id of next) {
      if (limitedRef.current.has(id)) continue
      api.interrupt(id)
      notify(findNode(id)?.data.name || id, tr("Limite de {0} tokens atingido; agente interrompido.", [fmt(max)]), { nodeId: id, always: true })
    }
    limitedRef.current = next
    setLimited(next)
  }, [byNode, settings?.tokenLimit])

  // Workspace budget (US$, estimated): reaching it stops that workspace's pipelines and interrupts its agents once.
  // You can still type to the agents; raising the budget re-arms it.
  const budgetHit = useRef(new Set())
  const budgetReady = useRef(false)
  const budgetKey = (state?.list || []).map((w) => `${w.id}:${w.budget || 0}`).join('|')
  useEffect(() => {
    if (!state) return
    const over = new Set(overBudget(state, byNode).map((w) => w.id))
    // The first reading after start is the baseline: agents being resumed are not interrupted for a budget
    // that was already used up (its pipelines stay blocked anyway). Only crossings while the app runs act.
    if (!budgetReady.current) {
      if (!Object.keys(byNode).length) return
      budgetReady.current = true
      budgetHit.current = over
      return
    }
    for (const w of state.list) {
      if (!over.has(w.id) || budgetHit.current.has(w.id)) continue
      const spent = money(wsCost(w, byNode).total)
      w.nodes.forEach((n) => {
        if (n.type === 'terminal') api.interrupt(n.id)
        if (n.type === 'pipeline' && isRunning(n.id)) stopPipeline(n.id, tr("Orçamento do workspace atingido."))
      })
      api.activityRecord({ kind: 'budget', from: w.name, text: tr("Orçamento de {0} atingido ({1}); agentes interrompidos.", [money(w.budget), spent]) })
      notify(tr("Orçamento atingido: {0}", [w.name]), tr("Gasto estimado {0} de {1}. Agentes interrompidos e fluxos parados.", [spent, money(w.budget)]), { always: true })
    }
    budgetHit.current = over
  }, [byNode, budgetKey])

  // What components read through UsageCtx.
  return useMemo(() => ({ byNode, limited }), [byNode, limited])
}
