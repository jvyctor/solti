// Pipeline run loop. Lives outside the node component so a run keeps going when you open another workspace
// (the node is unmounted then) and so routines can start it. State is written to the node's data via `patch`.
//
// Steps run group by group: a group is one step, or several marked "parallel" that run at the same time and are
// waited for together. After a group, a step's loop rule may send the run back to an earlier step.
// An approval step pauses the run until you allow it (desktop dialog or phone); denying stops the run.
import { MAX_ROUNDS, hint as hintText, fill, groupsOf, joinSummaries, loopDecision, shouldStop, timeoutMs, validate } from './pipeline.js'
import { runReport } from './report.js'
import { tr } from './i18n.js'

const BUDGET_CHECK = 5000
const KEEP_RUNS = 10
const active = new Map() // node id -> cancel(reason)

export const isRunning = (id) => active.has(id)
export const stopPipeline = (id, reason) => active.get(id)?.(reason)

// Waits for `agent` to call canvas_done. Resolves { summary } | { timeout } | { cancelled } | { budget }.
function waitDone(api, agent, ms, { onCancel, overBudget }) {
  return new Promise((resolve) => {
    const finish = (r) => { clearTimeout(t); clearInterval(b); off(); resolve(r) }
    const t = setTimeout(() => finish({ timeout: true }), ms)
    const b = setInterval(() => overBudget() && finish({ budget: true }), BUDGET_CHECK)
    const off = api.onDone(({ from, summary }) => { if (from === agent) finish({ summary }) })
    onCancel(() => finish({ cancelled: true }))
  })
}

// deps: { api, getNode(id), patch(id, partialData), agentExists(id), agentName?(id), cost?(id) -> US$,
//         snapshot?(label), notify?(title, body), approve?({ key, title, step, text, timeoutMs }) -> Promise<bool>,
//         cancelApproval?(key), changes?(agentId) -> Promise<{ branch, base, files } | null> (for the run report) }
export async function runPipeline(id, deps) {
  const { api, getNode, patch, agentExists, agentName = (a) => a, cost = () => 0, snapshot, notify, approve, cancelApproval, changes } = deps
  if (active.has(id)) return
  const cancels = new Set()
  let cancelReason = ''
  active.set(id, (reason) => { cancelReason = reason || tr('Parado por você.'); cancels.forEach((c) => c()) })
  const node = getNode(id)
  const title = node?.data.name || tr('Fluxo')
  const started = Date.now()
  let spent = () => 0
  let rounds = 0
  let steps = [], results = [], agents = [], spentFrom = {}
  // Ends the run: final state on the node, one line in the run list and the history, and a notification.
  const end = (data, body) => {
    const run = { t: started, ms: Date.now() - started, state: data.state, spent: spent(), rounds, note: data.note || '' }
    patch(id, { ...data, spent: run.spent, runs: [...(getNode(id)?.data.runs || []), run].slice(-KEEP_RUNS) })
    api.activityRecord?.({ kind: 'pipeline', from: title, fromId: id, cost: run.spent, text: `${data.state === 'done' ? tr('concluído') : tr('parado')} · ${tr('{0} rodada(s)', [rounds])} · ${tr('gasto estimado')} $${run.spent.toFixed(2)}${data.note ? ' · ' + data.note : ''}` })
    notify?.(data.state === 'done' ? tr('Fluxo concluído: {0}', [title]) : tr('Fluxo parado: {0}', [title]), body || data.note || '')
    // Markdown report (Últimas execuções → Relatório): needs each agent's changed files, so it is added when ready.
    const snap = { title, input: node?.data.input || '', state: data.state, note: data.note || '', t: started, ms: run.ms, rounds, steps, results: results.map((r) => r && { ...r }),
      costs: agents.map((a) => ({ id: a, cost: Math.max((cost(a) || 0) - (spentFrom[a] || 0), 0) })) }
    Promise.all(agents.map((a) => (changes ? changes(a).catch(() => null) : null))).then(async (ch) => {
      await new Promise((r) => setTimeout(r, 50)) // let the run above reach the node first
      const report = runReport({ ...snap, changes: ch.map((c, k) => c && { id: agents[k], ...c }).filter(Boolean) }, agentName)
      patch(id, { runs: (getNode(id)?.data.runs || []).map((r) => (r.t === started ? { ...r, report } : r)) })
    })
  }
  try {
    if (!node) return
    steps = node.data.steps || []
    const problem = validate(steps, agentExists)
    if (problem) return patch(id, { state: 'stopped', note: problem, results: [], at: -1 })

    const groups = groupsOf(steps)
    const input = node.data.input || ''
    const hint = node.data.hint === false ? '' : hintText()
    const budget = Number(node.data.budget) || 0
    agents = [...new Set(steps.filter((s) => !s.approval).map((s) => s.agent))]
    spentFrom = Object.fromEntries(agents.map((a) => [a, cost(a) || 0]))
    spent = () => agents.reduce((sum, a) => sum + Math.max((cost(a) || 0) - spentFrom[a], 0), 0)
    const overBudget = () => budget > 0 && spent() >= budget

    snapshot?.(tr('Antes do fluxo “{0}”', [title]))
    results = steps.map(() => null) // latest result per step: { state, summary, runs, note }
    const loops = steps.map(() => 0) // jumps back taken from each step
    const show = (extra = {}) => patch(id, { results: results.map((r) => r && { ...r }), loops: [...loops], spent: spent(), ...extra })
    show({ state: 'running', note: '', at: 0 })

    let prev = ''
    for (let g = 0; g < groups.length;) {
      if (cancelReason) return end({ state: 'stopped', note: cancelReason }) // stopped between two groups
      if (++rounds > MAX_ROUNDS) return end({ state: 'stopped', note: tr('Parado: mais de {0} rodadas (verifique as repetições).', [MAX_ROUNDS]) })
      const idx = groups[g]

      // Approval step: wait for your OK; {{prev}} passes through unchanged to the step after it.
      if (steps[idx[0]].approval) {
        const i = idx[0]
        results[i] = { state: 'running', runs: (results[i]?.runs || 0) + 1, summary: '' }
        show({ at: i })
        const key = `${id}:${i}:${Date.now()}`
        const text = fill(steps[i].prompt, { input, results, prev }).trim() || tr('Continuar o fluxo?')
        cancels.add(() => cancelApproval?.(key))
        const ok = approve ? await approve({ key, title, step: i + 1, text, timeoutMs: timeoutMs(steps[i]) }) : false
        cancels.clear()
        if (cancelReason) { results[i] = { ...results[i], state: 'stopped', summary: cancelReason }; show(); return end({ state: 'stopped', note: cancelReason }) }
        if (!ok) {
          results[i] = { ...results[i], state: 'stopped', summary: tr('Negado (ou sem resposta a tempo).') }
          show()
          return end({ state: 'stopped', note: tr('Parou: a aprovação do passo {0} foi negada.', [i + 1]) })
        }
        results[i] = { ...results[i], state: 'ok', summary: tr('Aprovado.') }
        show()
        g++
        continue
      }

      if (!idx.every((i) => agentExists(steps[i].agent))) return end({ state: 'stopped', note: tr('Agente não escolhido ou removido.') })
      for (const i of idx) results[i] = { state: 'running', runs: (results[i]?.runs || 0) + 1, summary: results[i]?.summary || '' }
      show({ at: idx[0] })
      for (const i of idx) {
        const text = fill(steps[i].prompt, { input, results, prev }) + hint
        api.promptAgent(steps[i].agent, text, tr('Fluxo “{0}” · passo {1}', [title, i + 1]))
      }
      const outs = await Promise.all(idx.map((i) => {
        let cancel = () => {}
        const p = waitDone(api, steps[i].agent, timeoutMs(steps[i]), { onCancel: (c) => { cancel = c }, overBudget })
        cancels.add(() => cancel())
        return p
      }))
      cancels.clear()

      const failed = outs.find((r) => r.summary == null)
      if (failed) {
        idx.forEach((i, k) => {
          const r = outs[k]
          results[i] = r.summary != null ? { ...results[i], state: 'ok', summary: r.summary }
            : { ...results[i], state: r.timeout ? 'timeout' : 'stopped', summary: r.timeout ? tr('Sem resposta em {0} min.', [Math.round(timeoutMs(steps[i]) / 60000)]) : r.budget ? tr('Orçamento do fluxo atingido.') : cancelReason }
        })
        const note = failed.budget ? tr('Parou: orçamento do fluxo atingido ({0}).', [`$${spent().toFixed(2)}`]) : failed.timeout ? tr('Parou: um passo ficou sem resposta.') : cancelReason
        if (failed.budget) agents.forEach((a) => api.interrupt(a))
        show()
        return end({ state: 'stopped', note })
      }
      idx.forEach((i, k) => { results[i] = { ...results[i], state: 'ok', summary: outs[k].summary } })
      prev = joinSummaries(idx.map((i, k) => ({ name: agentName(steps[i].agent), summary: outs[k].summary })))

      const stopper = idx.find((i) => shouldStop(steps[i], results[i].summary))
      if (stopper != null) {
        show()
        return end({ state: 'stopped', note: tr('Parou: o resumo contém “{0}”.', [steps[stopper].stopIf]) })
      }
      let jump = null
      for (const i of idx) {
        const d = loopDecision(steps[i], results[i].summary, loops[i], groups)
        if (d?.jump != null) { loops[i]++; jump = d.jump; break }
        if (d?.exhausted) results[i].note = tr('Limite de {0} repetições atingido; seguiu adiante.', [Math.max(1, Number(steps[i].loopMax) || 3)])
      }
      show()
      g = jump ?? g + 1
    }
    end({ state: 'done', note: '' }, prev)
  } finally {
    active.delete(id)
  }
}
