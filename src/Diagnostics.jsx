import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, X, Minus } from 'lucide-react'
import { tr } from './i18n.js'
import { copyReport } from './ErrorToast.jsx'

const api = window.api

const Chip = ({ ok, yes, no, unknown = tr('não sei') }) => (
  <span className={'diag-chip ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'unk')}>
    {ok === true ? <Check size={12} /> : ok === false ? <X size={12} /> : <Minus size={12} />} {ok === true ? yes : ok === false ? no : unknown}
  </span>
)

// The CLI table, used in Settings → Diagnóstico and in the first-run welcome.
// onRows: told the check results (the welcome screen leads with the demo when no CLI is installed).
export function DiagList({ onRows }) {
  const [rows, setRowsState] = useState(null)
  const [busy, setBusy] = useState('')
  const setRows = (r) => { setRowsState(r); onRows?.(r) }
  const load = () => api.diagRun().then(setRows)
  useEffect(() => { load() }, [])
  const fix = async (id) => { setBusy(id); setRows(await api.diagFix(id)); setBusy('') }
  if (!rows) return <p className="set-note-left">{tr("Verificando…")}</p>
  return (
    <div className="diag">
      {rows.map((r) => (
        <div key={r.id} className="diag-row">
          <div className="diag-name"><b>{r.label}</b><small>{r.installed ? r.version || tr("instalado") : tr("comando “{0}” não encontrado", [r.bin])}</small></div>
          <Chip ok={r.installed} yes={tr("instalado")} no={tr("não instalado")} />
          <Chip ok={r.authenticated} yes={tr("logado")} no={tr("sem login")} unknown={tr("login?")} />
          <Chip ok={r.mcp} yes={tr("canvas conectado")} no={tr("canvas ausente")} unknown={tr("canvas?")} />
          {r.installed && r.mcp === false && <button className="set-btn" disabled={!!busy} onClick={() => fix(r.id)}>{busy === r.id ? tr("Consertando…") : tr("Consertar")}</button>}
          {r.installed && r.authenticated === false && <small className="diag-hint">{tr("Abra um terminal deste agente e faça o login.")}</small>}
          {!r.installed && <small className="diag-hint">{tr("Instale o CLI e reabra o app.")}</small>}
        </div>
      ))}
      <button className="set-btn" onClick={load}>{tr("Verificar de novo")}</button>
    </div>
  )
}

export function DiagTab({ ui: { Section } }) {
  const [msg, setMsg] = useState('')
  const copy = async () => setMsg((await copyReport()) ? tr("Diagnóstico copiado. Cole no relato do problema.") : tr("Não foi possível copiar."))
  return (
    <>
      <Section title={tr("AGENTES NESTE COMPUTADOR")}>
        <p className="set-note-left" style={{ margin: '0 0 12px' }}>
          {tr("Confere, para cada agente, se o programa está instalado, se há login (leitura dos arquivos do próprio CLI: é uma estimativa) e se o canvas está registrado nele. “Consertar” registra o canvas e instala as skills.")}
        </p>
        <DiagList />
      </Section>
      <Section title={tr("RELATAR UM PROBLEMA")}>
        <p className="set-note-left" style={{ margin: '0 0 12px' }}>
          {tr("Erros internos ficam registrados num log. “Copiar diagnóstico” junta versões, o estado dos agentes e o log recente (sem conteúdo dos seus arquivos).")}
        </p>
        <div className="row">
          <button className="set-btn" onClick={copy}>{tr("Copiar diagnóstico")}</button>
          <button className="set-btn" onClick={() => api.openLogs()}>{tr("Abrir pasta de logs")}</button>
        </div>
        {msg && <p className="set-note-left" role="status">{msg}</p>}
      </Section>
    </>
  )
}

// First run: what the app is, and whether the agents are ready. Shown once.
export function Onboarding({ open, onClose, onTeam, onDemo }) {
  const [noAgents, setNoAgents] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide" aria-describedby={undefined}>
          <Dialog.Title className="dlg-title">{tr("Bem-vindo ao Solti")}</Dialog.Title>
          <p>{tr("Terminais de agentes de IA lado a lado, ligados por cordas: um Maestro delega e os agentes executam e se comunicam. Veja se os seus agentes estão prontos:")}</p>
          <DiagList onRows={(rows) => setNoAgents(rows.every((r) => !r.installed))} />
          {noAgents && <p className="set-note-left">{tr("Nenhum CLI de agente encontrado. Veja a demonstração (agentes simulados) enquanto instala o Claude Code, o Codex ou o Gemini CLI.")}</p>}
          <div className="dlg-actions">
            <button onClick={onClose}>{tr("Começar vazio")}</button>
            <button className={noAgents ? 'primary' : ''} onClick={() => { onClose(); onDemo?.() }}>{tr("Ver a demonstração")}</button>
            {!noAgents && <button className="primary" onClick={() => { onClose(); onTeam() }}>{tr("Criar um time")}</button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
