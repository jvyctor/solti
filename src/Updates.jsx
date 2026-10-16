import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, X, CheckCircle2, AlertTriangle } from 'lucide-react'

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
        <b>Atualização disponível</b>
        <span>Versão {state.version} · clique para atualizar</span>
      </button>
      <button className="toast-x" aria-label="Dispensar" onClick={() => setSeen(state.version)}><X size={14} /></button>
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
          <Dialog.Title className="dlg-title">Atualização do Agent Canvas</Dialog.Title>

          {status === 'checking' && <p>Verificando atualizações…</p>}
          {status === 'none' && <p className="upd-ok"><CheckCircle2 size={16} /> {state.dev ? 'Atualizações só funcionam no app instalado.' : `Você já está na versão mais recente (${state.current}).`}</p>}
          {status === 'error' && <p className="upd-err"><AlertTriangle size={16} /> {state.message}</p>}

          {status === 'available' && (
            <>
              <p>Nova versão <b>{state.version}</b> (você tem {state.current}).</p>
              {state.notes && <pre className="upd-notes">{state.notes}</pre>}
            </>
          )}

          {busy && (
            <>
              <p>Baixando a versão <b>{state.version}</b>…</p>
              <div className="upd-bar" role="progressbar" aria-valuenow={Math.round(state.percent || 0)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${state.percent || 0}%` }} /></div>
              <p className="upd-meta">
                {Math.round(state.percent || 0)}%{state.total ? ` · ${mb(state.done)} de ${mb(state.total)}` : ''}{state.speed ? ` · ${mb(state.speed)}/s` : ''}{left ? ` · faltam ${eta(left)}` : ''}
              </p>
            </>
          )}

          {status === 'downloaded' && (
            <p className="upd-ok"><CheckCircle2 size={16} /> Versão {state.version} baixada. Ao instalar, o app reinicia e os terminais abertos são encerrados (o texto deles é salvo).</p>
          )}

          <div className="dlg-actions">
            {!busy && <button onClick={() => onOpenChange(false)}>{status === 'available' || status === 'downloaded' ? 'Depois' : 'Fechar'}</button>}
            {status === 'available' && <button className="primary" onClick={() => api.updateDownload()}>Baixar e instalar</button>}
            {status === 'downloaded' && <button className="primary" onClick={() => api.updateInstall()}>Instalar e reiniciar</button>}
            {status === 'error' && <button className="primary" onClick={() => api.updateCheck()}>Tentar de novo</button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Settings tab body; Section/Row/Switch come from Settings.jsx.
export function UpdatesTab({ s, set, api, state, onOpen, ui: { Section, Row, Switch } }) {
  const [token, setToken] = useState('')
  const checking = state.status === 'checking'
  const msg = {
    none: state.dev ? 'Modo de desenvolvimento: atualizações desativadas.' : 'Você está na versão mais recente.',
    checking: 'Verificando…',
    error: state.message,
    downloading: 'Baixando atualização…',
    downloaded: `Versão ${state.version} pronta para instalar.`,
    available: `Versão ${state.version} disponível.`,
  }[state.status]
  return (
    <>
      <Section title="ATUALIZAÇÕES AUTOMÁTICAS">
        <Row title="Verificar atualizações automaticamente" desc="Ao abrir o app e a cada 4 horas, em segundo plano. Se houver versão nova, um aviso aparece no canto da tela.">
          <Switch label="Verificar automaticamente" checked={s.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
        </Row>
      </Section>
      <Section title="VERIFICAÇÃO MANUAL">
        <Row title={`Agent Canvas ${state.current || ''}`} desc={msg}>
          {['available', 'downloading', 'downloaded'].includes(state.status)
            ? <button className="set-btn" onClick={onOpen}>Ver atualização</button>
            : <button className="set-btn" disabled={checking} onClick={() => api.updateCheck()}>Verificar atualizações…</button>}
        </Row>
      </Section>
      <Section title="ACESSO AO REPOSITÓRIO">
        <Row title="Token do GitHub" desc="O repositório é privado: cole um token fine-grained só de leitura (Contents: Read). Fica criptografado neste computador.">
          <span className="set-token">
            <input className="set-input" type="password" aria-label="Token do GitHub" placeholder={state.hasToken ? '•••••••• (salvo)' : 'github_pat_…'} value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="set-btn" disabled={!token} onClick={() => api.updateToken(token).then(() => setToken(''))}>Salvar</button>
            {state.hasToken && <button className="set-link" onClick={() => api.updateToken('')}>remover</button>}
          </span>
        </Row>
      </Section>
    </>
  )
}
