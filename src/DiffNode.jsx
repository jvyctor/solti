import { useCallback, useContext, useEffect, useState } from 'react'
import { Handle, NodeResizer, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react'
import { AlertTriangle, GitCompare, MessageSquarePlus, Send, X, RefreshCw } from 'lucide-react'
import { ConflictCtx } from './shared.js'
import { patchLines, reviewMessage } from './conflicts.js'
import { tr } from './i18n.js'

const api = window.api
const LETTER = { M: 'M', A: 'A', D: 'D', R: 'R', N: 'N' }

// Review node: rope it to an agent that works in a worktree to see, comment line by line (sent back to the agent),
// approve (commit), merge or open a PR. Files another worktree agent of the same repo also changed are flagged.
export default function DiffNode({ id, data, selected }) {
  const { deleteElements, updateNodeData } = useReactFlow()
  const nodes = useNodes()
  const edges = useEdges()
  const agent = nodes.find((n) => n.type === 'terminal' && n.data.git?.worktree && edges.some((e) => (e.source === id && e.target === n.id) || (e.target === id && e.source === n.id)))
  const g = agent?.data.git
  const cwd = agent?.data.cwd
  const conflicts = useContext(ConflictCtx).filter((c) => agent && c.agents.includes(agent.id))
  const others = (c) => c.agents.filter((a) => a !== agent.id).map((a) => nodes.find((n) => n.id === a)?.data.name || a).join(', ')

  const [files, setFiles] = useState([])
  const [sel, setSel] = useState(null)
  const [patch, setPatch] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null) // { text, error }
  const [draft, setDraft] = useState(null) // { key, file, line, removed, code, text }: comment being written
  const comments = data?.comments || [] // [{ file, line, removed, code, text }], kept until sent

  const refresh = useCallback(async () => {
    if (!g) return
    const r = await api.gitChanges(cwd, g.base)
    if (r.error) return setNote({ text: r.error, error: true })
    setFiles(r.files)
    setSel((s) => (r.files.some((f) => f.file === s?.file) ? s : null))
  }, [cwd, g?.base])
  useEffect(() => { setFiles([]); setSel(null); setPatch(''); setNote(null); refresh() }, [cwd, g?.base])
  useEffect(() => {
    if (!sel) return setPatch('')
    api.gitPatch(cwd, g.base, sel.file, sel.status === 'N').then((r) => setPatch(r.error || r.patch))
  }, [sel?.file, files])

  const run = async (label, fn, ok) => {
    setBusy(label); setNote(null)
    const r = await fn()
    setBusy('')
    if (r.error) setNote({ text: r.error, error: true })
    else { setNote({ text: ok(r) }); refresh() }
  }
  const approve = () => run(tr('Salvando…'), () => api.gitCommit(cwd, msg), (r) => (r.committed ? tr('Alterações salvas (commit) na branch do agente.') : tr('Nada para salvar.'))).then(() => setMsg(''))
  const merge = () => run(tr('Fazendo merge…'), () => api.gitMerge(g.repo, g.base, g.branch), () => tr('Merge de {0} em {1} concluído.', [g.branch, g.base]))
  const pr = () => run(tr('Enviando branch…'), () => api.gitPr(g.repo, g.base, g.branch), () => tr('Branch enviada; página do PR aberta no navegador.'))

  const lines = patchLines(patch)
  const startComment = (l, k) => {
    if (l.kind !== 'add' && l.kind !== 'del' && l.kind !== 'ctx') return
    const removed = l.kind === 'del'
    setDraft({ key: k, file: sel.file, line: removed ? l.old : l.new, removed, code: l.text.slice(1), text: '' })
  }
  const saveDraft = () => {
    if (draft?.text.trim()) updateNodeData(id, { comments: [...comments, { file: draft.file, line: draft.line, removed: draft.removed, code: draft.code, text: draft.text.trim() }] })
    setDraft(null)
  }
  const removeComment = (i) => updateNodeData(id, { comments: comments.filter((_, k) => k !== i) })
  const sendReview = () => {
    const text = reviewMessage(comments, { branch: g.branch, tr })
    api.promptAgent(agent.id, text, tr('Revisão ({0})', [g.branch]))
    updateNodeData(id, { comments: [] })
    setNote({ text: tr('{0} comentário(s) enviado(s) a {1}.', [comments.length, agent.data.name]) })
  }
  const commentsOn = (f) => comments.filter((c) => c.file === f).length

  return (
    <div className={'tnode diff' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={360} minHeight={260} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <GitCompare size={15} aria-label={tr("Revisão")} />
        <span className="diff-title">{g ? `${g.branch} → ${g.base}` : tr("Revisão")}</span>
        <span className="spacer" />
        {g && <button className="x on" aria-label={tr("Atualizar")} title={tr("Atualizar")} onClick={() => { refresh(); window.dispatchEvent(new Event('ac:conflicts-check')) }}><RefreshCw size={13} /></button>}
        <button className="x" aria-label={tr("Excluir")} onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      {!g ? (
        <p className="diff-empty">{tr("Ligue este nó, com uma corda, a um terminal criado com “Isolar em worktree”.")}</p>
      ) : (
        <>
          {conflicts.length > 0 && (
            <div className="diff-conflict nodrag" role="alert">
              <AlertTriangle size={14} />
              <span>{tr('Possível conflito: {0} também mudou {1}.', [others(conflicts[0]), conflicts.map((c) => c.file).join(', ')])}</span>
            </div>
          )}
          <div className="diff-body nodrag nowheel">
            <ul className="diff-files">
              {files.length === 0 && <li className="diff-none">{tr("Sem alterações em relação a")} {g.base}.</li>}
              {files.map((f) => {
                const clash = conflicts.find((c) => c.file === f.file)
                const n = commentsOn(f.file)
                return (
                  <li key={f.file} className={(sel?.file === f.file ? 'on' : '') + (clash ? ' clash' : '')} onClick={() => { setSel(f); setDraft(null) }} title={clash ? tr('{0} — também alterado por {1}', [f.file, others(clash)]) : f.file}>
                    <b className={'st-' + f.status}>{LETTER[f.status] || f.status}</b> {f.file}
                    {clash && <AlertTriangle size={12} className="diff-clash" aria-label={tr('Possível conflito')} />}
                    {n > 0 && <span className="diff-count">{n}</span>}
                  </li>
                )
              })}
            </ul>
            <div className="diff-patch" role="list" aria-label={tr('Alterações do arquivo (clique numa linha para comentar)')}>
              {!patch && (sel ? '' : <span className="diff-hint">{tr("Escolha um arquivo. Clique numa linha para comentar.")}</span>)}
              {lines.map((l, k) => {
                const mine = comments.map((c, i) => ({ ...c, i })).filter((c) => sel && c.file === sel.file && !!c.removed === (l.kind === 'del') && c.line === (l.kind === 'del' ? l.old : l.new) && l.kind !== 'hunk' && l.kind !== 'meta')
                return (
                  <div key={k} role="listitem">
                    <div className={'dl ' + l.kind} onClick={() => startComment(l, k)}>
                      <span className="dl-no">{l.kind === 'del' ? l.old : l.new ?? ''}</span>
                      <span className="dl-text">{l.text || ' '}</span>
                      {(l.kind === 'add' || l.kind === 'del' || l.kind === 'ctx') && <MessageSquarePlus size={12} className="dl-add" aria-hidden />}
                    </div>
                    {mine.map((c) => (
                      <div key={c.i} className="dl-comment">
                        <span>{c.text}</span>
                        <button className="x" aria-label={tr('Remover comentário')} onClick={() => removeComment(c.i)}><X size={12} /></button>
                      </div>
                    ))}
                    {draft?.key === k && (
                      <div className="dl-draft">
                        <textarea autoFocus rows={2} value={draft.text} placeholder={tr('O que o agente deve mudar nesta linha?')} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDraft(); if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) } }} />
                        <div className="row">
                          <button onClick={() => setDraft(null)}>{tr('Cancelar')}</button>
                          <button className="primary" disabled={!draft.text.trim()} onClick={saveDraft}>{tr('Comentar')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      {g && (
        <div className="diff-foot nodrag">
          {note && <p className={note.error ? 'err' : 'ok'}>{note.text}</p>}
          {comments.length > 0 && (
            <div className="row diff-review">
              <span>{tr('{0} comentário(s) prontos para o agente', [comments.length])}</span>
              <button onClick={() => updateNodeData(id, { comments: [] })}>{tr('Descartar')}</button>
              <button className="primary" onClick={sendReview}><Send size={13} /> {tr('Enviar ao agente')}</button>
            </div>
          )}
          <div className="row">
            <input value={msg} placeholder={tr("Mensagem do commit (opcional)")} onChange={(e) => setMsg(e.target.value)} />
            <button disabled={!!busy} onClick={approve}>{busy === tr('Salvando…') ? busy : tr("Aprovar")}</button>
            <button disabled={!!busy} onClick={merge}>{busy === tr('Fazendo merge…') ? busy : tr("Merge em {0}", [g.base])}</button>
            <button disabled={!!busy} onClick={pr}>{busy === tr('Enviando branch…') ? busy : tr("PR")}</button>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
      <Handle id="ring" type="source" position={Position.Right} className="ring" />
    </div>
  )
}
