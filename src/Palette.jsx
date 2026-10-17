import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, SquareTerminal, Folder, Zap, FileText } from 'lucide-react'
import { tr } from './i18n.js'

const api = window.api
const norm = (s) => String(s).toLowerCase()

// Ctrl+K: jump to a workspace or terminal, search what terminals printed, run an app action.
export default function Palette({ open, onClose, state, goTo, actions }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([]) // lines found in terminal output
  const [sel, setSel] = useState(0)
  const list = useRef(null)

  useEffect(() => { if (open) { setQ(''); setHits([]); setSel(0) } }, [open])
  useEffect(() => {
    if (q.trim().length < 3) return setHits([])
    const t = setTimeout(() => api.searchTerminals(q.trim()).then(setHits), 200)
    return () => clearTimeout(t)
  }, [q])

  const items = useMemo(() => {
    const all = []
    for (const w of state.list) {
      all.push({ icon: Folder, label: w.name, hint: tr("workspace"), run: () => goTo(w.id) })
      for (const n of w.nodes) if (n.type === 'terminal') all.push({ icon: SquareTerminal, label: n.data.name, hint: tr("terminal · {0}", [w.name]), run: () => goTo(w.id, n.id) })
    }
    for (const a of actions) all.push({ icon: Zap, label: a.label, hint: tr("ação"), run: a.run })
    const f = norm(q.trim())
    const base = f ? all.filter((i) => norm(i.label).includes(f)) : all
    const where = new Map(state.list.flatMap((w) => w.nodes.map((n) => [n.id, w])))
    const found = hits.map((h) => ({ icon: FileText, label: h.line, hint: tr("saída de {0}", [h.name]), run: () => goTo(where.get(h.id)?.id, h.id) }))
    return [...base.slice(0, 40), ...found]
  }, [q, hits, state, actions, goTo])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { list.current?.children[sel]?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const pick = (i) => { onClose(); i?.run() }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[sel]) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg palette" aria-describedby={undefined} onKeyDown={onKey}>
          <Dialog.Title className="sr-only">{tr("Paleta de comandos")}</Dialog.Title>
          <label className="pal-input"><Search size={16} /><input autoFocus value={q} placeholder={tr("Ir para workspace ou terminal, buscar na saída, executar ação…")} onChange={(e) => setQ(e.target.value)} /></label>
          <ul ref={list} className="pal-list" role="listbox">
            {items.length === 0 && <li className="pal-none">{tr("Nada encontrado.")}</li>}
            {items.map((i, k) => (
              <li key={k} role="option" aria-selected={k === sel} className={k === sel ? 'on' : ''} onMouseMove={() => setSel(k)} onClick={() => pick(i)}>
                <i.icon size={14} /> <span className="pal-label">{i.label}</span> <small>{i.hint}</small>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
