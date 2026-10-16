import { useEffect, useRef, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { ScrollText, X, ShieldAlert } from 'lucide-react'

const api = window.api
const KIND = { send: 'mensagem', ask: 'pergunta', spawn: 'criou agente', portal: 'navegador', done: 'concluiu', remote: 'celular' }
const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR')

// Timeline of what agents did to each other; opens from a dock button.
export function ActivityDock() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const root = useRef(null)
  useEffect(() => {
    api.activityList().then(setItems)
    return api.onActivity((e) => setItems((l) => [...l.slice(-199), e]))
  }, [])
  useEffect(() => {
    if (!open) return
    const away = (e) => !root.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  return (
    <div ref={root} className="usage-root">
      {open && (
        <div className="usage activity" role="log" aria-label="Atividade dos agentes">
          <h4>Atividade <span><button onClick={() => setOpen(false)} aria-label="Fechar"><X size={16} /></button></span></h4>
          <div className="usage-scroll">
            {items.length === 0 && <p className="act-empty">Nada ainda. Mensagens, criação de agentes e uso do navegador aparecem aqui.</p>}
            {[...items].reverse().map((e, i) => (
              <div key={i} className={'act-row' + (e.outcome === 'denied' ? ' denied' : '')}>
                <div className="act-head"><b>{e.from}</b> {KIND[e.kind] || e.kind}{e.to ? <> → <b>{e.to}</b></> : null}<time>{hhmm(e.t)}</time></div>
                {e.text && <div className="act-text">{e.text}</div>}
                {e.outcome === 'denied' && <div className="act-flag">negado por você</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <button className={'mapbtn' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-label="Atividade dos agentes" title="Atividade dos agentes"><ScrollText size={18} /></button>
    </div>
  )
}

// "While you were away": summaries of agents that finished while the window was not focused, shown when you come back.
export function AwayDigest() {
  const [items, setItems] = useState([])
  const away = useRef([])
  useEffect(() => {
    const off = api.onDone((d) => { if (!document.hasFocus()) { away.current = [...away.current, d]; } })
    const back = () => { if (away.current.length) { setItems(away.current); away.current = [] } }
    window.addEventListener('focus', back)
    return () => { off(); window.removeEventListener('focus', back) }
  }, [])
  if (!items.length) return null
  return (
    <div className="toast digest" role="status">
      <ScrollText size={18} />
      <div className="toast-main">
        <b>Enquanto você estava fora, {items.length} {items.length === 1 ? 'agente concluiu' : 'agentes concluíram'}</b>
        {items.slice(-5).map((d, i) => <span key={i}>{d.name ? d.name + ': ' : ''}{d.summary}</span>)}
      </div>
      <button className="toast-x" aria-label="Fechar" onClick={() => setItems([])}><X size={14} /></button>
    </div>
  )
}

const WHAT = {
  spawn: (r) => `quer criar o agente “${r.to}”.`,
  send: (r) => `quer enviar uma mensagem para “${r.to}”.`,
  ask: (r) => `quer fazer uma pergunta a “${r.to}”.`,
  portal: (r) => `quer controlar o navegador “${r.to}”.`,
}

// One request at a time; the rest wait in the queue. No answer in 2 minutes counts as "Negar" (main side).
export function ApprovalDialog() {
  const [queue, setQueue] = useState([])
  useEffect(() => {
    const offReq = api.onApproval((r) => {
      setQueue((q) => [...q, r])
      if (!document.hasFocus()) new Notification('Agent Canvas', { body: `${r.from} ${(WHAT[r.kind] || (() => 'quer agir'))(r)}` })
    })
    const offClose = api.onApprovalClose((id) => setQueue((q) => q.filter((x) => x.id !== id)))
    return () => { offReq(); offClose() }
  }, [])
  const cur = queue[0]
  const answer = (ok) => { api.approvalAnswer(cur.id, ok); setQueue((q) => q.slice(1)) }
  return (
    <AlertDialog.Root open={!!cur} onOpenChange={(o) => !o && cur && answer(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dlg-back" />
        <AlertDialog.Content className="dlg wide">
          <AlertDialog.Title className="dlg-title"><ShieldAlert size={16} /> Pedido de um agente</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>
              <p><b>{cur?.from}</b> {cur && (WHAT[cur.kind] || (() => 'quer agir.'))(cur)}</p>
              {cur?.text && <pre className="upd-notes">{cur.text}</pre>}
              {queue.length > 1 && <p className="hint">Mais {queue.length - 1} pedido(s) na fila.</p>}
            </div>
          </AlertDialog.Description>
          <div className="dlg-actions">
            <AlertDialog.Cancel asChild><button onClick={() => answer(false)}>Negar</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className="primary" onClick={() => answer(true)}>Permitir</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
