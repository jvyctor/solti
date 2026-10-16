import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react'
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, FolderTree, RefreshCw, X } from 'lucide-react'
import { api } from './shared.js'
import { Ring } from './Ring.jsx'

// Tiny markdown view: #/## headings, "- " bullets, "1. " items, everything else monospace text.
export function MdLite({ text }) {
  return (
    <>
      {text.split('\n').map((l, i) => {
        if (l.startsWith('## ')) return <h3 key={i}>{l.slice(3)}</h3>
        if (l.startsWith('# ')) return <h2 key={i}>{l.slice(2)}</h2>
        if (/^(- |\d+\. )/.test(l)) return <p key={i} className="li">{l}</p>
        return <p key={i}>{l || ' '}</p>
      })}
    </>
  )
}

// Shared project memory: one per workspace. Agents read it at startup and via canvas_knowledge; they append via canvas_remember.
export function KnowledgeNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  return (
    <div className={'note knowledge' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={240} minHeight={160} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="note-head">
        <BookOpen size={14} aria-label="Conhecimento" />
        <span className="k-title">Conhecimento do projeto</span>
        <button aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={12} /></button>
      </div>
      <textarea className="note-body nodrag nowheel" value={data.text || ''} placeholder="Fatos que todos os agentes devem saber: stack, comandos, decisões…" onChange={(e) => updateNodeData(id, { text: e.target.value })} />
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}

export function NoteNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const [edit, setEdit] = useState(!data.text)
  return (
    <div className={'note' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={180} minHeight={110} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <div className="note-head">
        <input className="nodrag" value={data.title || ''} placeholder="Nota" onChange={(e) => updateNodeData(id, { title: e.target.value })} />
        <button aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={12} /></button>
      </div>
      {edit ? (
        <textarea className="note-body nodrag nowheel" autoFocus value={data.text || ''} onChange={(e) => updateNodeData(id, { text: e.target.value })} onBlur={() => setEdit(false)} />
      ) : (
        <div className="note-body view nowheel" onDoubleClick={() => setEdit(true)} title="Duplo clique para editar">
          <MdLite text={data.text || ''} />
        </div>
      )}
      <Handle type="source" position={Position.Right} /><Ring />
    </div>
  )
}

// Frame that labels a cluster of nodes. shortcut: children are not parented, so moving the group does not move them.
export function GroupNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className="group">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <input value={data.name || ''} placeholder="Grupo" onChange={(e) => updateNodeData(id, { name: e.target.value })} />
    </div>
  )
}

export function TextNode({ id, data }) {
  const { updateNodeData } = useReactFlow()
  return <textarea className="textnode nodrag" value={data.text || ''} placeholder="Texto" onChange={(e) => updateNodeData(id, { text: e.target.value })} />
}

// Browser portal: an embedded webview with a URL bar.
export function PortalNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const view = useRef(null)
  const [url, setUrl] = useState(data.url || 'https://www.google.com')
  // Lets agents read the page: main finds this <webview>'s webContents by node id.
  useEffect(() => {
    const v = view.current
    const reg = () => api.portalRegister(id, v.getWebContentsId())
    v?.addEventListener('dom-ready', reg)
    return () => v?.removeEventListener('dom-ready', reg)
  }, [id])
  const go = () => {
    const u = /^[a-z]+:\/\//i.test(url) ? url : 'https://' + url
    updateNodeData(id, { url: u })
    view.current?.loadURL?.(u)
  }
  return (
    <div className={'tnode' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={320} minHeight={220} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} /><Ring />
      <div className="thead">
        <button className="x on" aria-label="Voltar" onClick={() => view.current?.goBack?.()}><ArrowLeft size={14} /></button>
        <button className="x on" aria-label="Recarregar" onClick={() => view.current?.reload?.()}><RefreshCw size={14} /></button>
        <input className="role" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <webview ref={view} src={data.url || 'https://www.google.com'} className="tbody nodrag nowheel" style={{ flex: 1, background: '#fff' }} partition="persist:portal" />
    </div>
  )
}

// Lazy directory tree. shortcut: listing is not watched; re-open the folder to refresh.
// Windows paths use \, everything else /.
const sepOf = (p) => (p.includes('/') && !p.includes('\\') ? '/' : '\\')

export function Dir({ path, name, depth = 0, tick = 0 }) {
  const [kids, setKids] = useState(null)
  const [open, setOpen] = useState(depth === 0)
  // Re-listed on every tick (see FilesNode); the state only changes when the listing really did.
  useEffect(() => {
    if (open) api.ls(path).then((r) => setKids((prev) => (JSON.stringify(prev) === JSON.stringify(r.entries || []) ? prev : r.entries || [])))
  }, [open, tick])
  return (
    <div>
      <div className="ftree-row" style={{ paddingLeft: depth * 12 }} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={14} /> : <Folder size={14} />} {name}
      </div>
      {open && kids?.map((k) =>
        k.dir ? (
          <Dir key={k.name} path={path + sepOf(path) + k.name} name={k.name} depth={depth + 1} tick={tick} />
        ) : (
          <div key={k.name} className="ftree-row file" style={{ paddingLeft: (depth + 1) * 12 + 13 }}><FileText size={13} /> {k.name}</div>
        ),
      )}
    </div>
  )
}

export function FilesNode({ id, data, selected }) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const [path, setPath] = useState(data.path || '')
  const [root, setRoot] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => document.hasFocus() && setTick((n) => n + 1), 4000)
    return () => clearInterval(t)
  }, [])
  const load = (p) => api.ls(p).then((r) => { if (!r.error) { setRoot(r.dir); setPath(r.dir); updateNodeData(id, { path: r.dir }) } })
  useEffect(() => { load(data.path || '') }, [])
  return (
    <div className={'tnode' + (selected ? ' selected' : '')}>
      <NodeResizer minWidth={220} minHeight={180} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} /><Ring />
      <div className="thead">
        <FolderTree size={15} aria-label="Árvore de arquivos" />
        <input className="pathin" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(path)} />
        <button className="x" aria-label="Excluir" onClick={() => deleteElements({ nodes: [{ id }] })}><X size={14} /></button>
      </div>
      <div className="tbody ftree nodrag nowheel">{root && <Dir key={root} path={root} name={root.split(/[\\/]/).pop() || root} tick={tick} />}</div>
    </div>
  )
}
