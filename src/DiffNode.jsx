import { useCallback, useEffect, useState } from 'react'
import { Handle, NodeResizer, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react'
import { GitCompare, X, RefreshCw } from 'lucide-react'

const api = window.api
const LETTER = { M: 'M', A: 'A', D: 'D', R: 'R', N: 'N' }

// Review node: rope it to an agent that works in a worktree to see, approve (commit), merge or open a PR.
export default function DiffNode({ id, selected }) {
  const { deleteElements } = useReactFlow()
  const nodes = useNodes()
  const edges = useEdges()
  const agent = nodes.find((n) => n.type === 'terminal' && n.data.git?.worktree && edges.some((e) => (e.source === id && e.target === n.id) || (e.target === id && e.source === n.id)))
  const g = agent?.data.git
  const cwd = agent?.data.cwd

  const [files, setFiles] = useState([])
  const [sel, setSel] = useState(null)
  const [patch, setPatch] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null) // { text, error }

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
  const approve = () => run('Salvando…', () => api.gitCommit(cwd, msg), (r) => (r.committed ? 'Alterações salvas (commit) na branch do agente.' : 'Nada para salvar.')).then(() => setMsg(''))
  const merge = () => run('Fazendo merge…', () => api.gitMerge(g.repo, g.base, g.branch), () => `Merge de ${g.branch} em ${g.base} concluído.`)
  const pr = () => run('Enviando branch…', () => api.gitPr(g.repo, g.base, g.branch), () => 'Branch enviada; página do PR aberta no navegador.')

  return (
    <div className={'tnode diff' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={360} minHeight={260} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="thead">
        <GitCompare size={15} aria-label="Revisão" />
        <span className="diff-title">{g ? `${g.branch} → ${g.base}` : 'Revisão'}</span>
        <span className="spacer" />
        {g && <button className="x on" aria-label="Atualizar" title="Atualizar" onClick={refresh}><RefreshCw size={13} /></button>}
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      {!g ? (
        <p className="diff-empty">Ligue este nó, com uma corda, a um terminal criado com “Isolar em worktree”.</p>
      ) : (
        <div className="diff-body nodrag nowheel">
          <ul className="diff-files">
            {files.length === 0 && <li className="diff-none">Sem alterações em relação a {g.base}.</li>}
            {files.map((f) => (
              <li key={f.file} className={sel?.file === f.file ? 'on' : ''} onClick={() => setSel(f)} title={f.file}>
                <b className={'st-' + f.status}>{LETTER[f.status] || f.status}</b> {f.file}
              </li>
            ))}
          </ul>
          <pre className="diff-patch">
            {patch ? patch.split('\n').map((l, i) => <span key={i} className={l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l[0] === '@' ? 'hunk' : ''}>{l + '\n'}</span>) : sel ? '' : 'Escolha um arquivo.'}
          </pre>
        </div>
      )}
      {g && (
        <div className="diff-foot nodrag">
          {note && <p className={note.error ? 'err' : 'ok'}>{note.text}</p>}
          <div className="row">
            <input value={msg} placeholder="Mensagem do commit (opcional)" onChange={(e) => setMsg(e.target.value)} />
            <button disabled={!!busy} onClick={approve}>{busy === 'Salvando…' ? busy : 'Aprovar'}</button>
            <button disabled={!!busy} onClick={merge}>{busy === 'Fazendo merge…' ? busy : `Merge em ${g.base}`}</button>
            <button disabled={!!busy} onClick={pr}>{busy === 'Enviando branch…' ? busy : 'PR'}</button>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
      <Handle id="ring" type="source" position={Position.Right} className="ring" />
    </div>
  )
}
