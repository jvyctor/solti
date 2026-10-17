import { useContext, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useNodes, useReactFlow } from '@xyflow/react'
import { Workflow, X, Play, Square, Plus, Trash2, Columns2, Repeat, SlidersHorizontal, ShieldCheck } from 'lucide-react'
import { DEFAULT_APPROVAL_MIN, DEFAULT_TIMEOUT_MIN, settle } from './pipeline.js'
import { isRunning } from './pipelineRunner.js'
import { PipeCtx, money } from './shared.js'
import { tr } from './i18n.js'

const MARK = { ok: '✓', stopped: '■', timeout: '⏱', running: '…' }
const hasAdvanced = (s) => !!(String(s.loopIf || '').trim() || s.timeout)

// Steps editor and progress view; the run itself is in pipelineRunner.js (started through PipeCtx).
export default function PipelineNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const { start, stop } = useContext(PipeCtx)
  const agents = useNodes().filter((n) => n.type === 'terminal')
  const steps = data.steps || []
  const dataRef = useRef(data)
  dataRef.current = data
  const [open, setOpen] = useState(() => new Set(steps.map((s, i) => (hasAdvanced(s) ? i : -1)).filter((i) => i >= 0)))
  const set = (p) => updateNodeData(id, p)
  const setStep = (i, p) => set({ steps: steps.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  const toggle = (i) => setOpen((o) => { const n = new Set(o); n.has(i) ? n.delete(i) : n.add(i); return n })
  const removeStep = (i) => {
    // Later loop targets shift with the list; a loop that pointed at the removed step is cleared.
    const next = steps.filter((_, k) => k !== i).map((s) => {
      const to = Number(s.loopTo)
      if (!s.loopTo || to < i + 1) return s
      return to === i + 1 ? { ...s, loopIf: '', loopTo: '' } : { ...s, loopTo: to - 1 }
    })
    if (next[0]) next[0] = { ...next[0], parallel: false }
    set({ steps: next })
  }

  useEffect(() => { // left "running" by a restart (a run survives workspace switches, a restart does not)
    const s = settle(dataRef.current, isRunning(id))
    if (s !== dataRef.current) set({ state: s.state, note: s.note })
  }, [])

  const running = data.state === 'running'

  return (
    <div className={'tnode pipe' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={360} minHeight={260} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <Workflow size={15} aria-label={tr("Fluxo")} />
        <span className="diff-title">{tr("Fluxo")}</span>
        <span className="spacer" />
        <button className="x" aria-label={tr("Excluir")} onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="pipe-body nodrag nowheel">
        <label className="pipe-lab"><span>{tr("Entrada (usada como")} <code>{tr("{{input}}")}</code>)</span>
          <textarea rows={2} value={data.input || ''} placeholder={tr("O que este fluxo deve produzir")} disabled={running} onChange={(e) => set({ input: e.target.value })} />
        </label>
        {steps.map((s, i) => {
          const r = data.results?.[i]
          const par = i > 0 && s.parallel
          if (s.approval) return (
            <div key={i} className={'pipe-step approval ' + (r?.state || '') + (data.at === i && running ? ' current' : '')}>
              <div className="pipe-row">
                <b>{i + 1}</b>
                <span className="pipe-appr-lab"><ShieldCheck size={13} /> {tr("Aprovação humana")}</span>
                <span className="pipe-mark" title={r?.state}>{MARK[r?.state] || ''}</span>
                <button className="x" aria-label={tr("Remover passo")} disabled={running} onClick={() => removeStep(i)}><Trash2 size={13} /></button>
              </div>
              <textarea rows={2} value={s.prompt || ''} placeholder={tr("O que revisar antes de continuar. Use {{prev}} para mostrar o resultado anterior.")} disabled={running} onChange={(e) => setStep(i, { prompt: e.target.value })} />
              <div className="pipe-adv-row">
                <span>{tr("Esperar até")}</span>
                <input className="num" type="number" min={1} max={1440} value={s.timeout || ''} placeholder={String(DEFAULT_APPROVAL_MIN)} disabled={running} onChange={(e) => setStep(i, { timeout: e.target.value ? Math.min(1440, Math.max(1, Number(e.target.value))) : '' })} aria-label={tr("Tempo para aprovar em minutos")} />
                <span>{tr("min; sem resposta, o fluxo para.")}</span>
              </div>
              {r?.state === 'running' && <p className="pipe-note">{tr("Esperando sua aprovação (diálogo no app ou no celular).")}</p>}
              {r?.summary && r.state !== 'running' && <p className="pipe-sum">{r.summary}</p>}
            </div>
          )
          return (
            <div key={i} className={'pipe-step ' + (r?.state || '') + (par ? ' par' : '') + (data.at === i && running ? ' current' : '')}>
              {par && <div className="pipe-par-lab">{tr("ao mesmo tempo que o passo {0}", [i])}</div>}
              <div className="pipe-row">
                <b>{i + 1}</b>
                <select value={s.agent || ''} disabled={running} onChange={(e) => setStep(i, { agent: e.target.value })} aria-label={tr("Agente do passo {0}", [i + 1])}>
                  <option value="">{tr("— agente —")}</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.data.name}</option>)}
                </select>
                <span className="pipe-mark" title={r?.state}>{MARK[r?.state] || ''}{r?.runs > 1 ? <small title={tr("Execuções deste passo")}>×{r.runs}</small> : null}</span>
                {i > 0 && (
                  <button className={'x' + (par ? ' on' : '')} aria-pressed={!!par} disabled={running} title={tr("Rodar ao mesmo tempo que o passo anterior")} aria-label={tr("Rodar ao mesmo tempo que o passo anterior")} onClick={() => setStep(i, { parallel: !par })}><Columns2 size={13} /></button>
                )}
                <button className={'x' + (open.has(i) ? ' on' : '')} aria-expanded={open.has(i)} title={tr("Repetição e tempo limite")} aria-label={tr("Repetição e tempo limite")} onClick={() => toggle(i)}>{s.loopIf ? <Repeat size={13} /> : <SlidersHorizontal size={13} />}</button>
                <button className="x" aria-label={tr("Remover passo")} disabled={running} onClick={() => removeStep(i)}><Trash2 size={13} /></button>
              </div>
              <textarea rows={2} value={s.prompt || ''} placeholder={tr("Instrução. Use {{input}}, {{prev}} ou {{step1}}…")} disabled={running} onChange={(e) => setStep(i, { prompt: e.target.value })} />
              <input value={s.stopIf || ''} placeholder={tr("Parar se o resumo contiver… (opcional)")} disabled={running} onChange={(e) => setStep(i, { stopIf: e.target.value })} />
              {open.has(i) && (
                <div className="pipe-adv">
                  <div className="pipe-adv-row">
                    <span>{tr("Se o resumo contiver")}</span>
                    <input value={s.loopIf || ''} placeholder={tr("ex.: REPROVADO")} disabled={running} onChange={(e) => setStep(i, { loopIf: e.target.value, loopTo: s.loopTo || 1, loopMax: s.loopMax || 3 })} aria-label={tr("Texto que faz repetir")} />
                  </div>
                  <div className="pipe-adv-row">
                    <span>{tr("voltar ao passo")}</span>
                    <select value={s.loopTo || 1} disabled={running || !s.loopIf} onChange={(e) => setStep(i, { loopTo: Number(e.target.value) })} aria-label={tr("Passo para onde voltar")}>
                      {steps.slice(0, i + 1).map((_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
                    </select>
                    <span>{tr("no máximo")}</span>
                    <input className="num" type="number" min={1} max={20} value={s.loopMax || 3} disabled={running || !s.loopIf} onChange={(e) => setStep(i, { loopMax: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} aria-label={tr("Máximo de repetições")} />
                    <span>{tr("vezes")}</span>
                  </div>
                  <div className="pipe-adv-row">
                    <span>{tr("Tempo limite")}</span>
                    <input className="num" type="number" min={1} max={600} value={s.timeout || ''} placeholder={String(DEFAULT_TIMEOUT_MIN)} disabled={running} onChange={(e) => setStep(i, { timeout: e.target.value ? Math.min(600, Math.max(1, Number(e.target.value))) : '' })} aria-label={tr("Tempo limite em minutos")} />
                    <span>{tr("min sem resposta")}</span>
                  </div>
                  {s.loopIf && data.loops?.[i] > 0 && <small>{tr("Repetiu {0} vez(es) na última execução.", [data.loops[i]])}</small>}
                </div>
              )}
              {r?.summary && <p className="pipe-sum">{r.summary}</p>}
              {r?.note && <p className="pipe-note">{r.note}</p>}
            </div>
          )
        })}
        <div className="pipe-add">
          <button className="set-btn" disabled={running} onClick={() => set({ steps: [...steps, { agent: '', prompt: '', stopIf: '' }] })}><Plus size={13} /> {tr("Passo")}</button>
          <button className="set-btn" disabled={running} title={tr("Pausa o fluxo até você permitir (no app ou no celular)")} onClick={() => set({ steps: [...steps, { approval: true, prompt: tr('Revise antes de continuar: {{prev}}') }] })}><ShieldCheck size={13} /> {tr("Aprovação")}</button>
        </div>
        {data.runs?.length > 0 && (
          <details className="pipe-runs">
            <summary>{tr("Últimas execuções")}</summary>
            {[...data.runs].reverse().map((r) => (
              <div key={r.t} className={'pipe-run ' + r.state}>
                <time>{new Date(r.t).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                <span>{r.state === 'done' ? tr('concluído') : tr('parado')}</span>
                <span>{tr('{0} rodada(s)', [r.rounds])} · {Math.max(1, Math.round(r.ms / 60000))} min</span>
                <b>{money(r.spent || 0)}</b>
              </div>
            ))}
          </details>
        )}
      </div>
      <div className="diff-foot nodrag">
        {data.note && <p className="err">{data.note}</p>}
        {data.state === 'done' && <p className="ok">{tr("Fluxo concluído.")}</p>}
        <div className="pipe-budget">
          <label>{tr("Orçamento (US$)")} <input inputMode="decimal" placeholder={tr("sem limite")} value={data.budget || ''} disabled={running} onChange={(e) => set({ budget: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} /></label>
          {(running || data.spent > 0) && <span title={tr("Gasto estimado dos agentes deste fluxo desde o início da execução")}>{tr("gasto")} {money(data.spent || 0)}</span>}
        </div>
        <div className="row">
          <label className="pipe-hint"><input type="checkbox" checked={data.hint !== false} disabled={running} onChange={(e) => set({ hint: e.target.checked })} /> {tr("lembrar o agente de chamar")} <code>{tr("canvas_done")}</code></label>
          {running
            ? <button onClick={() => stop(id)}><Square size={12} /> {tr("Parar")}</button>
            : <button disabled={!steps.length} onClick={() => start(id)}><Play size={12} /> {tr("Executar")}</button>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle id="ring" type="source" position={Position.Right} className="ring" />
    </div>
  )
}
