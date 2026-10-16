import { useState } from 'react'
import { Folder, Lock, Plus, Search, Settings as SettingsIcon, SquareTerminal, X } from 'lucide-react'
import { uid } from './shared.js'

export const WS_COLORS = ['#f2c230', '#3b8cff', '#a66bff', '#3fc28a', '#ff6b6b', '#ff9a4a']

export function Sidebar({ state, setState, onRemove, onSettings }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const list = state.list.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()))
  const rename = (id, name) => setState((s) => ({ ...s, list: s.list.map((w) => (w.id === id ? { ...w, name: name || w.name } : w)) }))
  const create = () => {
    const w = { id: uid('w'), name: `Workspace ${state.list.length + 1}`, nodes: [], edges: [] }
    setState((s) => ({ ...s, list: [...s.list, w], active: w.id }))
    setEditing(w.id)
  }
  return (
    <aside className="side">
      <div className="side-top">
        <label className="search">
          <Search size={16} />
          <input placeholder="Filtrar" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button onClick={create} aria-label="Novo workspace" title="Novo workspace"><Plus size={20} /></button>
      </div>
      <div className="side-title">WORKSPACES</div>
      {list.map((w, i) => {
        const color = w.color || WS_COLORS[state.list.indexOf(w) % WS_COLORS.length]
        const terms = w.nodes.filter((n) => n.type === 'terminal').length
        const patchWs = (p) => setState((s) => ({ ...s, list: s.list.map((x) => (x.id === w.id ? { ...x, ...p } : x)) }))
        return (
          <div key={w.id} className={'ws' + (w.id === state.active ? ' active' : '')} onClick={() => setState((s) => ({ ...s, active: w.id }))} onDoubleClick={() => setEditing(w.id)}>
            <button className="ws-folder" aria-label="Trocar cor" title="Trocar cor" onClick={(e) => { e.stopPropagation(); patchWs({ color: WS_COLORS[(WS_COLORS.indexOf(color) + 1) % WS_COLORS.length] }) }}><Folder size={18} color={color} /></button>
            {editing === w.id ? (
              <input autoFocus defaultValue={w.name} onBlur={(e) => { rename(w.id, e.target.value); setEditing(null) }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className="ws-name">{w.name}</span>
            )}
            <button className={'ws-lock' + (w.locked ? ' on' : '')} aria-label={w.locked ? 'Desbloquear' : 'Bloquear exclusão'} title={w.locked ? 'Desbloquear' : 'Bloquear exclusão'} onClick={(e) => { e.stopPropagation(); patchWs({ locked: !w.locked }) }}><Lock size={13} /></button>
            <span className="ws-count">
              <SquareTerminal size={15} />
              {terms}
            </span>
            {state.list.length > 1 && !w.locked && <button className="ws-del" aria-label="Excluir workspace" onClick={(e) => { e.stopPropagation(); onRemove(w.id) }}><X size={14} /></button>}
          </div>
        )
      })}
      <footer className="side-foot">
        <button className="side-new" onClick={create}><Folder size={15} /> Novo workspace</button>
        <button className="side-gear" aria-label="Configurações" title="Configurações" onClick={onSettings}><SettingsIcon size={16} /></button>
      </footer>
    </aside>
  )
}
