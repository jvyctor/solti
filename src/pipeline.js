import { tr } from './i18n.js'
// Pipeline ("fluxo") logic: prompt templates, grouping, loops and stop criteria. The run loop lives in pipelineRunner.js.
export const HINT = ' (Ao terminar, chame a ferramenta canvas_done com um resumo curto do resultado.)'
export const DEFAULT_TIMEOUT_MIN = 15
export const MAX_ROUNDS = 100 // safety net against loops that keep jumping back

// {{input}} = the pipeline's input, {{prev}} = what the previous step (or parallel group) concluded, {{step1}}.. = latest summary of step N.
// `prev` may be given explicitly (after a loop jumps back, the previous *run* is not the previous step in the list).
export function fill(template, { input = '', results = [], prev }) {
  const before = prev ?? results.filter(Boolean).at(-1)?.summary ?? ''
  return String(template || '')
    .replace(/\{\{\s*input\s*\}\}/gi, input)
    .replace(/\{\{\s*prev\s*\}\}/gi, before)
    .replace(/\{\{\s*step(\d+)\s*\}\}/gi, (_m, n) => results[Number(n) - 1]?.summary || '')
}

const has = (text, needle) => !!String(needle || '').trim() && String(text || '').toLowerCase().includes(String(needle).trim().toLowerCase())

// Stop criterion: the step's `stopIf` text appearing in its summary (case-insensitive) ends the pipeline.
export const shouldStop = (step, summary) => has(summary, step.stopIf)

// A step marked `parallel` runs at the same time as the step above it. Returns groups of step indexes, in order.
export function groupsOf(steps) {
  const groups = []
  steps.forEach((s, i) => (i > 0 && s.parallel ? groups.at(-1).push(i) : groups.push([i])))
  return groups
}
export const groupOfStep = (groups, i) => groups.findIndex((g) => g.includes(i))

// What {{prev}} becomes after a group: the summary itself, or one "name: summary" line per parallel step.
export const joinSummaries = (entries) => (entries.length === 1 ? entries[0].summary : entries.map((e) => `${e.name}: ${e.summary}`).join('\n'))

// Loop rule ("se o resumo contiver X, voltar ao passo N, no máximo M vezes"):
// { jump: group index } while repetitions are left, { exhausted: true } when the text matched but the limit was reached, or null.
export function loopDecision(step, summary, taken, groups) {
  if (!has(summary, step.loopIf)) return null
  const target = groupOfStep(groups, Number(step.loopTo) - 1)
  if (target < 0) return null
  const max = Math.max(1, Number(step.loopMax) || 3)
  return taken < max ? { jump: target } : { exhausted: true }
}

// Problems that make a run impossible, checked before anything is sent.
// An approval step ("wait for my OK") has no agent and must run alone.
export function validate(steps, agentExists) {
  if (!steps.length) return tr('O fluxo não tem passos.')
  for (const [i, s] of steps.entries()) if (!s.approval && !agentExists(s.agent)) return tr('Passo {0}: agente não escolhido ou removido.', [i + 1])
  for (const g of groupsOf(steps)) {
    if (g.length > 1 && g.some((i) => steps[i].approval)) return tr('Uma aprovação não roda em paralelo com outros passos (passos {0}).', [g.map((i) => i + 1).join(', ')])
    const ids = g.map((i) => steps[i].agent)
    if (new Set(ids).size !== ids.length) return tr('Passos em paralelo precisam de agentes diferentes (passos {0}).', [g.map((i) => i + 1).join(', ')])
  }
  for (const [i, s] of steps.entries()) {
    if (s.approval || !String(s.loopIf || '').trim()) continue
    const to = Number(s.loopTo)
    if (!(to >= 1 && to <= i + 1)) return tr('Passo {0}: “voltar ao passo” deve ser um passo anterior (1 a {1}).', [i + 1, i + 1])
  }
  return ''
}

export const DEFAULT_APPROVAL_MIN = 60
export const timeoutMs = (step) => Math.max(1, Number(step.timeout) || (step.approval ? DEFAULT_APPROVAL_MIN : DEFAULT_TIMEOUT_MIN)) * 60 * 1000

// A run left "running" by a closed workspace or a restart is reported as interrupted.
export const settle = (data, live) => (data.state === 'running' && !live ? { ...data, state: 'stopped', note: tr("Interrompido (o workspace foi fechado ou o app reiniciou).") } : data)
