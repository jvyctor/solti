import { tr } from './i18n.js'
// Pipeline ("fluxo") logic: prompt templates and stop criteria. The run loop lives in PipelineNode.jsx.
export const HINT = ' (Ao terminar, chame a ferramenta canvas_done com um resumo curto do resultado.)'

// {{input}} = the pipeline's input, {{prev}} = summary of the previous step, {{step1}}.. = summary of step N.
export function fill(template, { input = '', results = [] }) {
  const prev = results.at(-1)?.summary || ''
  return String(template || '')
    .replace(/\{\{\s*input\s*\}\}/gi, input)
    .replace(/\{\{\s*prev\s*\}\}/gi, prev)
    .replace(/\{\{\s*step(\d+)\s*\}\}/gi, (_m, n) => results[Number(n) - 1]?.summary || '')
}

// Stop criterion: the step's `stopIf` text appearing in its summary (case-insensitive) ends the pipeline.
export const shouldStop = (step, summary) => !!step.stopIf?.trim() && String(summary || '').toLowerCase().includes(step.stopIf.trim().toLowerCase())

// A run left "running" by a closed workspace or a restart is reported as interrupted.
export const settle = (data, live) => (data.state === 'running' && !live ? { ...data, state: 'stopped', note: tr("Interrompido (o workspace foi fechado ou o app reiniciou).") } : data)
