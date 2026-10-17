import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { History as HistoryIcon, Search, X } from 'lucide-react'
import { getLang, tr } from './i18n.js'

const api = window.api

// How an entry reads from the point of view of the agent whose history this is.
const KINDS = [
  ['input', tr('Digitado por você')],
  ['prompt', tr('Pedidos')],
  ['send', tr('Mensagens')],
  ['ask', tr('Perguntas')],
  ['done', tr('Concluídos')],
  ['routine', tr('Rotinas')],
  ['spawn', tr('Agentes criados')],
  ['pipeline', tr('Fluxos')],
]
function describe(e, me) {
  const mine = me && (e.fromId === me.id || (!e.fromId && e.from === me.name))
  switch (e.kind) {
    case 'input': return tr('{0} digitou', [e.from])
    case 'pipeline': return tr('fluxo “{0}”', [e.from])
    case 'approval': return tr('{0}: aprovação', [e.from])
    case 'prompt': return tr('{0} pediu', [e.from])
    case 'routine': return tr('rotina “{0}” pediu', [e.from])
    case 'done': return tr('{0} concluiu', [e.from])
    case 'send': return mine ? tr('enviou para {0}', [e.to]) : tr('mensagem de {0}', [e.from])
    case 'ask': return mine ? tr('perguntou a {0}', [e.to]) : tr('pergunta de {0}', [e.from])
    case 'spawn': return tr('{0} criou o agente {1}', [e.from, e.to])
    case 'portal': return tr('{0} usou o navegador {1}', [e.from, e.to])
    case 'budget': return tr('orçamento: {0}', [e.from])
    case 'point': return tr('ponto de restauração')
    default: return `${e.from} ${e.kind}${e.to ? ' → ' + e.to : ''}`
  }
}
const when = (t) => new Date(t).toLocaleString(getLang() === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Timeline of one agent (what it was asked, what it said, what it concluded), or of everything; searchable.
// agents: [{ id, name }] for the picker; start: the agent to open on (or null = all).
export default function HistoryDialog({ open, onClose, agents, start }) {
  const [agentId, setAgentId] = useState(start || '')
  const [q, setQ] = useState('')
  const [kinds, setKinds] = useState([])
  const [rows, setRows] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  useEffect(() => { setAgentId(start || '') }, [start])
  const me = useMemo(() => agents.find((a) => a.id === agentId) || null, [agents, agentId])
  useEffect(() => {
    if (!open) return
    let alive = true
    const t = setTimeout(() => api.historyQuery({ agent: me ? { id: me.id, name: me.name } : null, q, kinds }).then((r) => alive && setRows(r)), 150)
    return () => { alive = false; clearTimeout(t) }
  }, [open, me, q, kinds.join()])
  const toggleKind = (k) => setKinds((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))
  const toggleRow = (i) => setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide hist" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title"><HistoryIcon size={16} /> {me ? tr('Histórico de {0}', [me.name]) : tr('Histórico dos agentes')}</Dialog.Title>
          <div className="hist-bar">
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label={tr('Agente')}>
              <option value="">{tr('Todos os agentes')}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="hist-search"><Search size={14} /><input autoFocus placeholder={tr('Buscar no histórico…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('Buscar no histórico')} /></label>
          </div>
          <div className="hist-kinds" role="group" aria-label={tr('Tipos')}>
            {KINDS.map(([k, l]) => <button key={k} className={'chip' + (kinds.includes(k) ? ' on' : '')} aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>{l}</button>)}
          </div>
          <div className="hist-list" role="log">
            {!rows && <p className="act-empty">{tr('Carregando…')}</p>}
            {rows?.length === 0 && <p className="act-empty">{q || kinds.length ? tr('Nada encontrado.') : tr('Nada registrado ainda. Pedidos de fluxos e rotinas, mensagens entre agentes e conclusões aparecem aqui.')}</p>}
            {rows?.map((e, i) => {
              const long = e.text && e.text.length > 280
              const full = expanded.has(i)
              return (
                <div key={i} className={'hist-row k-' + e.kind + (e.outcome === 'denied' ? ' denied' : '')}>
                  <div className="act-head"><b>{describe(e, me)}</b>{!me && e.kind !== 'done' && e.to && e.kind !== 'spawn' ? <span className="hist-to">→ {e.to}</span> : null}<time>{when(e.t)}</time></div>
                  {e.text && <div className="act-text">{long && !full ? e.text.slice(0, 280) + '…' : e.text}</div>}
                  {long && <button className="link" onClick={() => toggleRow(i)}>{full ? tr('mostrar menos') : tr('mostrar tudo')}</button>}
                  {e.outcome === 'denied' && <div className="act-flag">{tr('negado por você')}</div>}
                </div>
              )
            })}
          </div>
          <Dialog.Close asChild><button className="set-close hist-close" aria-label={tr('Fechar')}><X size={16} /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
