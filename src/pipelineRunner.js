// Pipeline run loop. Lives outside the node component so a run keeps going when you open another workspace
// (the node is unmounted then) and so routines can start it. State is written to the node's data via `patch`.
import { HINT, fill, shouldStop } from './pipeline.js'
import { tr } from './i18n.js'

const STEP_TIMEOUT = 15 * 60 * 1000
const active = new Map() // node id -> cancel()

export const isRunning = (id) => active.has(id)
export const stopPipeline = (id) => active.get(id)?.()

// Waits for `agent` to call canvas_done. Resolves { summary } | { timeout } | { cancelled }.
const waitDone = (api, agent, onCancel) =>
  new Promise((resolve) => {
    const t = setTimeout(() => { off(); resolve({ timeout: true }) }, STEP_TIMEOUT)
    const off = api.onDone(({ from, summary }) => { if (from === agent) { clearTimeout(t); off(); resolve({ summary }) } })
    onCancel(() => { clearTimeout(t); off(); resolve({ cancelled: true }) })
  })

// deps: { api, getNode(id) -> node|null, patch(id, partialData), agentExists(agentId) }
export async function runPipeline(id, { api, getNode, patch, agentExists }) {
  if (active.has(id)) return
  let cancelStep = () => {}
  let cancelled = false
  active.set(id, () => { cancelled = true; cancelStep() })
  try {
    const node = getNode(id)
    if (!node) return
    const steps = node.data.steps || []
    const results = []
    patch(id, { state: 'running', results: [], note: '', at: 0 })
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const data = getNode(id)?.data || node.data
      if (!agentExists(step.agent)) { results.push({ state: 'stopped', summary: tr('Agente não escolhido ou removido.') }); patch(id, { results: [...results], state: 'stopped' }); return }
      patch(id, { at: i, results: [...results, { state: 'running' }] })
      api.promptAgent(step.agent, fill(step.prompt, { input: data.input, results }) + (data.hint === false ? '' : HINT))
      const r = await waitDone(api, step.agent, (c) => { cancelStep = c })
      if (cancelled || r.cancelled) { results.push({ state: 'stopped', summary: tr('Parado por você.') }); patch(id, { results: [...results], state: 'stopped' }); return }
      if (r.timeout) { results.push({ state: 'timeout', summary: tr('Sem resposta em 15 minutos.') }); patch(id, { results: [...results], state: 'stopped' }); return }
      results.push({ state: 'ok', summary: r.summary })
      if (shouldStop(step, r.summary)) { patch(id, { results: [...results], state: 'stopped', note: tr("Parou: o resumo contém “{0}”.", [step.stopIf]) }); return }
      patch(id, { results: [...results] })
    }
    patch(id, { state: 'done' })
  } finally {
    active.delete(id)
  }
}
