import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useNodes, useReactFlow } from '@xyflow/react'
import { Workflow, X, Play, Square, Plus, Trash2 } from 'lucide-react'
import { HINT, fill, settle, shouldStop } from './pipeline.js'

const api = window.api
const STEP_TIMEOUT = 15 * 60 * 1000
const MARK = { ok: '✓', stopped: '■', timeout: '⏱', running: '…' }

// Waits for `agent` to call canvas_done. Resolves { summary } or { timeout } or { cancelled }.
const waitDone = (agent, cancel) =>
  new Promise((resolve) => {
    const t = setTimeout(() => { off(); resolve({ timeout: true }) }, STEP_TIMEOUT)
    const off = api.onDone(({ from, summary }) => { if (from === agent) { clearTimeout(t); off(); resolve({ summary }) } })
    cancel.current = () => { clearTimeout(t); off(); resolve({ cancelled: true }) }
  })

// Runs saved steps one after another: type the prompt into an agent, wait for its canvas_done, hand the summary on.
export default function PipelineNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const agents = useNodes().filter((n) => n.type === 'terminal')
  const steps = data.steps || []
  const live = useRef(false)
  const cancel = useRef(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const set = (p) => updateNodeData(id, p)
  const setStep = (i, p) => set({ steps: steps.map((s, k) => (k === i ? { ...s, ...p } : s)) })

  useEffect(() => { // left "running" by a closed workspace / restart
    const s = settle(dataRef.current, live.current)
    if (s !== dataRef.current) set({ state: s.state, note: s.note })
    return () => { cancel.current?.() }
  }, [])

  const run = async () => {
    live.current = true
    const results = []
    set({ state: 'running', results: [], note: '', at: 0 })
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!agents.some((a) => a.id === step.agent)) { results.push({ state: 'stopped', summary: 'Agente não escolhido ou removido.' }); set({ results: [...results], state: 'stopped' }); break }
      set({ at: i, results: [...results, { state: 'running' }] })
      const text = fill(step.prompt, { input: data.input, results }) + (data.hint === false ? '' : HINT)
      api.promptAgent(step.agent, text)
      const r = await waitDone(step.agent, cancel)
      if (r.cancelled) { results.push({ state: 'stopped', summary: 'Parado por você.' }); set({ results: [...results], state: 'stopped' }); break }
      if (r.timeout) { results.push({ state: 'timeout', summary: 'Sem resposta em 15 minutos.' }); set({ results: [...results], state: 'stopped' }); break }
      results.push({ state: 'ok', summary: r.summary })
      if (shouldStop(step, r.summary)) { set({ results: [...results], state: 'stopped', note: `Parou: o resumo contém “${step.stopIf}”.` }); break }
      set({ results: [...results] })
      if (i === steps.length - 1) set({ state: 'done' })
    }
    live.current = false
  }
  const running = data.state === 'running'

  return (
    <div className={'tnode pipe' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={340} minHeight={240} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <Workflow size={15} aria-label="Fluxo" />
        <span className="diff-title">Fluxo</span>
        <span className="spacer" />
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="pipe-body nodrag nowheel">
        <label className="pipe-lab"><span>Entrada (usada como <code>{'{{input}}'}</code>)</span>
          <textarea rows={2} value={data.input || ''} placeholder="O que este fluxo deve produzir" disabled={running} onChange={(e) => set({ input: e.target.value })} />
        </label>
        {steps.map((s, i) => (
          <div key={i} className={'pipe-step ' + (data.results?.[i]?.state || '')}>
            <div className="pipe-row">
              <b>{i + 1}</b>
              <select value={s.agent || ''} disabled={running} onChange={(e) => setStep(i, { agent: e.target.value })}>
                <option value="">— agente —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.data.name}</option>)}
              </select>
              <span className="pipe-mark" title={data.results?.[i]?.state}>{MARK[data.results?.[i]?.state] || ''}</span>
              <button className="x" aria-label="Remover passo" disabled={running} onClick={() => set({ steps: steps.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
            </div>
            <textarea rows={2} value={s.prompt || ''} placeholder="Instrução. Use {{input}}, {{prev}} ou {{step1}}…" disabled={running} onChange={(e) => setStep(i, { prompt: e.target.value })} />
            <input value={s.stopIf || ''} placeholder="Parar se o resumo contiver… (opcional)" disabled={running} onChange={(e) => setStep(i, { stopIf: e.target.value })} />
            {data.results?.[i]?.summary && <p className="pipe-sum">{data.results[i].summary}</p>}
          </div>
        ))}
        <button className="set-btn" disabled={running} onClick={() => set({ steps: [...steps, { agent: '', prompt: '', stopIf: '' }] })}><Plus size={13} /> Passo</button>
      </div>
      <div className="diff-foot nodrag">
        {data.note && <p className="err">{data.note}</p>}
        {data.state === 'done' && <p className="ok">Fluxo concluído.</p>}
        <div className="row">
          <label className="pipe-hint"><input type="checkbox" checked={data.hint !== false} disabled={running} onChange={(e) => set({ hint: e.target.checked })} /> lembrar o agente de chamar <code>canvas_done</code></label>
          {running
            ? <button onClick={() => cancel.current?.()}><Square size={12} /> Parar</button>
            : <button disabled={!steps.length} onClick={run}><Play size={12} /> Executar</button>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle id="ring" type="source" position={Position.Right} className="ring" />
    </div>
  )
}
