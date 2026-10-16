import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, X, Minus } from 'lucide-react'

const api = window.api

const Chip = ({ ok, yes, no, unknown = 'não sei' }) => (
  <span className={'diag-chip ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'unk')}>
    {ok === true ? <Check size={12} /> : ok === false ? <X size={12} /> : <Minus size={12} />} {ok === true ? yes : ok === false ? no : unknown}
  </span>
)

// The CLI table, used in Settings → Diagnóstico and in the first-run welcome.
export function DiagList() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState('')
  const load = () => api.diagRun().then(setRows)
  useEffect(() => { load() }, [])
  const fix = async (id) => { setBusy(id); setRows(await api.diagFix(id)); setBusy('') }
  if (!rows) return <p className="set-note-left">Verificando…</p>
  return (
    <div className="diag">
      {rows.map((r) => (
        <div key={r.id} className="diag-row">
          <div className="diag-name"><b>{r.label}</b><small>{r.installed ? r.version || 'instalado' : `comando “${r.bin}” não encontrado`}</small></div>
          <Chip ok={r.installed} yes="instalado" no="não instalado" />
          <Chip ok={r.authenticated} yes="logado" no="sem login" unknown="login?" />
          <Chip ok={r.mcp} yes="canvas conectado" no="canvas ausente" unknown="canvas?" />
          {r.installed && r.mcp === false && <button className="set-btn" disabled={!!busy} onClick={() => fix(r.id)}>{busy === r.id ? 'Consertando…' : 'Consertar'}</button>}
          {r.installed && r.authenticated === false && <small className="diag-hint">Abra um terminal deste agente e faça o login.</small>}
          {!r.installed && <small className="diag-hint">Instale o CLI e reabra o app.</small>}
        </div>
      ))}
      <button className="set-btn" onClick={load}>Verificar de novo</button>
    </div>
  )
}

export function DiagTab({ ui: { Section } }) {
  return (
    <Section title="AGENTES NESTE COMPUTADOR">
      <p className="set-note-left" style={{ margin: '0 0 12px' }}>
        Confere, para cada agente, se o programa está instalado, se há login (leitura dos arquivos do próprio CLI: é uma estimativa) e se o canvas está registrado nele. “Consertar” registra o canvas e instala as skills.
      </p>
      <DiagList />
    </Section>
  )
}

// First run: what the app is, and whether the agents are ready. Shown once.
export function Onboarding({ open, onClose, onTeam }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title">Bem-vindo ao Agent Canvas</Dialog.Title>
          <p>Terminais de agentes de IA lado a lado, ligados por cordas: um Maestro delega e os agentes executam e se comunicam. Veja se os seus agentes estão prontos:</p>
          <DiagList />
          <div className="dlg-actions">
            <button onClick={onClose}>Começar vazio</button>
            <button className="primary" onClick={() => { onClose(); onTeam() }}>Criar um time</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
