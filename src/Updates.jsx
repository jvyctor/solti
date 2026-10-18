import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { tr } from './i18n.js'

export function useUpdate(api) {
  const [state, setState] = useState({ status: 'idle' })
  useEffect(() => {
    api.updateState().then(setState)
    return api.onUpdate(setState)
  }, [])
  return state
}

const mb = (n) => (n / 1048576).toFixed(1) + ' MB'
const eta = (s) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.ceil(s / 60)} min`)

// Bottom-right toast announcing a new version (once per version per session).
export function UpdateToast({ state, onOpen }) {
  const [seen, setSeen] = useState(null)
  const show = state.status === 'available' && seen !== state.version
  if (!show) return null
  return (
    <div className="toast" role="status">
      <Download size={18} />
      <button className="toast-main" onClick={() => { setSeen(state.version); onOpen() }}>
        <b>{tr("Atualização disponível")}</b>
        <span>{tr("Versão")} {state.version} {tr("· clique para atualizar")}</span>
      </button>
      <button className="toast-x" aria-label={tr("Dispensar")} onClick={() => setSeen(state.version)}><X size={14} /></button>
    </div>
  )
}

export function UpdateDialog({ open, onOpenChange, state, api }) {
  const { status } = state
  const busy = status === 'downloading'
  const t0 = useRef(0)
  useEffect(() => { if (status === 'downloading' && !t0.current) t0.current = Date.now(); if (status !== 'downloading') t0.current = 0 }, [status])
  const left = state.speed > 0 ? (state.total - state.done) / state.speed : 0
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg upd" aria-describedby={undefined} onInteractOutside={(e) => busy && e.preventDefault()}>
          <Dialog.Title className="dlg-title">{tr("Atualização do Solti")}</Dialog.Title>

          {status === 'checking' && <p>{tr("Verificando atualizações…")}</p>}
          {status === 'none' && <p className="upd-ok"><CheckCircle2 size={16} /> {state.dev ? tr("Atualizações só funcionam no app instalado.") : tr("Você já está na versão mais recente ({0}).", [state.current])}</p>}
          {status === 'error' && <p className="upd-err"><AlertTriangle size={16} /> {state.message}</p>}

          {status === 'available' && (
            <>
              <p>{tr("Nova versão")} <b>{state.version}</b> {tr("(você tem")} {state.current}).</p>
              {state.notes && <pre className="upd-notes">{state.notes}</pre>}
              {state.managed && <p className="upd-meta">{tr("Instalado por gerenciador de pacotes. Para atualizar, rode:")} <code>{state.upgrade}</code></p>}
            </>
          )}

          {busy && (
            <>
              <p>{tr("Baixando a versão")} <b>{state.version}</b>…</p>
              <div className="upd-bar" role="progressbar" aria-valuenow={Math.round(state.percent || 0)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${state.percent || 0}%` }} /></div>
              <p className="upd-meta">
                {Math.round(state.percent || 0)}%{state.total ? tr(" · {0} de {1}", [mb(state.done), mb(state.total)]) : ''}{state.speed ? ` · ${mb(state.speed)}/s` : ''}{left ? tr(" · faltam {0}", [eta(left)]) : ''}
              </p>
            </>
          )}

          {status === 'downloaded' && (
            <p className="upd-ok"><CheckCircle2 size={16} /> {tr("Versão")} {state.version} {tr("baixada. Ao instalar, o app reinicia e os terminais abertos são encerrados (o texto deles é salvo).")}</p>
          )}

          <div className="dlg-actions">
            {!busy && <button onClick={() => onOpenChange(false)}>{status === 'available' || status === 'downloaded' ? tr("Depois") : tr("Fechar")}</button>}
            {status === 'available' && !state.managed && <button className="primary" onClick={() => api.updateDownload()}>{tr("Baixar e instalar")}</button>}
            {status === 'available' && state.managed && <button className="primary" onClick={() => navigator.clipboard?.writeText(state.upgrade)}>{tr("Copiar o comando")}</button>}
            {status === 'downloaded' && <button className="primary" onClick={() => api.updateInstall()}>{tr("Instalar e reiniciar")}</button>}
            {status === 'error' && <button className="primary" onClick={() => api.updateCheck()}>{tr("Tentar de novo")}</button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Settings tab body; Section/Row/Switch come from Settings.jsx.
export function UpdatesTab({ s, set, api, state, onOpen, ui: { Section, Row, Switch } }) {
  const checking = state.status === 'checking'
  const msg = {
    none: state.dev ? tr('Modo de desenvolvimento: atualizações desativadas.') : tr('Você está na versão mais recente.'),
    checking: 'Verificando…',
    error: state.message,
    downloading: tr('Baixando atualização…'),
    downloaded: tr('Versão {0} pronta para instalar.', [state.version]),
    available: tr('Versão {0} disponível.', [state.version]),
  }[state.status]
  return (
    <>
      <Section title={tr("ATUALIZAÇÕES AUTOMÁTICAS")}>
        <Row title={tr("Verificar atualizações automaticamente")} desc={tr("Ao abrir o app e a cada 4 horas, em segundo plano. Se houver versão nova, um aviso aparece no canto da tela.")}>
          <Switch label={tr("Verificar automaticamente")} checked={s.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
        </Row>
      </Section>
      <Section title={tr("VERIFICAÇÃO MANUAL")}>
        <Row title={tr("Solti {0}", [state.current || ''])} desc={msg}>
          {['available', 'downloading', 'downloaded'].includes(state.status)
            ? <button className="set-btn" onClick={onOpen}>{tr("Ver atualização")}</button>
            : <button className="set-btn" disabled={checking} onClick={() => api.updateCheck()}>{tr("Verificar atualizações…")}</button>}
        </Row>
      </Section>
    </>
  )
}
