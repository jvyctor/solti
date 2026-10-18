// Template gallery: ready-made teams with their pipeline, plus your own (saved from a workspace or imported from a
// file). Using one opens it as a new workspace; any template can be exported to share.
import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, LayoutTemplate, Trash2, Upload, X } from 'lucide-react'
import { builtinTemplates, checkTemplate, instantiate, toTemplate } from './templates.js'
import { PRESET_LABELS, api, ask, uid } from './shared.js'
import { tr } from './i18n.js'

// state.templates: your templates. onUse(workspace): add it and open it.
export default function TemplatesDialog({ state, setState, onUse, onClose }) {
  const builtin = useMemo(() => builtinTemplates(), [])
  const mine = state.templates || []
  const all = [...builtin.map((t) => ({ t, own: false })), ...mine.map((t, i) => ({ t, own: true, i }))]
  const [sel, setSel] = useState(0)
  const [note, setNote] = useState(null) // { text, error }
  const cur = all[Math.min(sel, all.length - 1)]
  const active = state.list.find((w) => w.id === state.active)

  const use = () => {
    const w = instantiate(cur.t, uid, new Set(state.list.map((x) => x.name)))
    onUse(w)
    onClose()
  }
  const saveCurrent = () => {
    if (!active?.nodes.length) return setNote({ text: tr('O workspace atual está vazio.'), error: true })
    const t = toTemplate(active, { name: active.name })
    setState((s) => ({ ...s, templates: [...(s.templates || []), t] }))
    setSel(all.length)
    setNote({ text: tr('Modelo “{0}” salvo.', [t.name]) })
  }
  const exportOne = async () => {
    const { key, ...t } = cur.t
    const r = await api.exportWorkspaces(t, `solti-${t.name}`)
    if (r.path) setNote({ text: tr('Exportado para {0}', [r.path]) })
  }
  const importFile = async () => {
    const r = await api.importWorkspaces()
    if (r.canceled) return
    if (r.error) return setNote({ text: r.error, error: true })
    try {
      const t = checkTemplate(r.data)
      setState((s) => ({ ...s, templates: [...(s.templates || []), t] }))
      setSel(all.length)
      setNote({ text: tr('Modelo “{0}” importado.', [t.name]) })
    } catch (e) { setNote({ text: e.message, error: true }) }
  }
  const remove = async () => {
    if (!(await ask(tr('Excluir o modelo “{0}”?', [cur.t.name])))) return
    setState((s) => ({ ...s, templates: (s.templates || []).filter((_, k) => k !== cur.i) }))
    setSel(0)
  }

  const agents = cur.t.nodes.filter((n) => n.type === 'terminal')
  const names = new Map(agents.map((n) => [n.id, n.data.name]))
  const flows = cur.t.nodes.filter((n) => n.type === 'pipeline')
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide tpl-dlg" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title"><LayoutTemplate size={16} /> {tr('Modelos')}</Dialog.Title>
          <div className="tpl-body">
            <ul className="tpl-list" role="listbox" aria-label={tr('Modelos')}>
              {all.map(({ t, own }, i) => (
                <li key={i} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => { setSel(i); setNote(null) }}>
                  <b>{t.name}</b>
                  <small>{own ? tr('Seu modelo') : tr('Modelo pronto')} · {tr('{0} agente(s)', [t.nodes.filter((n) => n.type === 'terminal').length])}</small>
                </li>
              ))}
            </ul>
            <div className="tpl-detail">
              <h3>{cur.t.name}</h3>
              {cur.t.desc && <p>{cur.t.desc}</p>}
              {!!agents.length && (
                <>
                  <h4>{tr('Agentes')}</h4>
                  <ul>{agents.map((n) => <li key={n.id}><b>{n.data.name}</b>{n.data.maestro ? tr(' (maestro)') : ''} · {PRESET_LABELS[n.data.preset] || n.data.preset}</li>)}</ul>
                </>
              )}
              {flows.map((f) => (
                <div key={f.id}>
                  <h4>{tr('Fluxo “{0}”', [f.data.name || tr('Fluxo')])}</h4>
                  <ol>{(f.data.steps || []).map((s, k) => <li key={k}>{s.approval ? tr('Espera o seu OK') : names.get(s.agent) || '?'}{s.parallel ? tr(' (em paralelo)') : ''}{s.loopIf ? tr(' · volta ao passo {0} se o resumo tiver “{1}”', [s.loopTo, s.loopIf]) : ''}</li>)}</ol>
                </div>
              ))}
              <p className="hint">{tr('Os agentes abrem sem pasta: escolha a pasta do projeto em cada terminal (ou use “Time pronto” para worktrees).')}</p>
            </div>
          </div>
          {note && <p className={note.error ? 'err' : 'ok'}>{note.text}</p>}
          <div className="dlg-actions">
            <button onClick={importFile} title={tr('Importar um modelo de um arquivo .json')}><Upload size={14} /> {tr('Importar…')}</button>
            <button onClick={saveCurrent} title={tr('Salvar o workspace atual como modelo')}>{tr('Salvar o atual como modelo')}</button>
            <span className="spacer" />
            {cur.own && <button className="danger" aria-label={tr('Excluir modelo')} title={tr('Excluir modelo')} onClick={remove}><Trash2 size={14} /></button>}
            <button onClick={exportOne} title={tr('Exportar este modelo para compartilhar')}><Download size={14} /> {tr('Exportar')}</button>
            <button className="primary" onClick={use}>{tr('Usar modelo')}</button>
          </div>
          <Dialog.Close asChild><button className="set-close" aria-label={tr('Fechar')}><X size={16} /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
