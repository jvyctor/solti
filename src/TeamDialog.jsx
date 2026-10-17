import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { TEAMS, teamNodes } from './teams.js'
import { PRESET_LABELS, api, uid } from './shared.js'
import { tr } from './i18n.js'

const AGENT_PRESETS = Object.entries(PRESET_LABELS).filter(([k]) => k !== 'shell')

// "Time pronto…": pick a team, the CLI of each member and (optionally) a project folder; specialists get their own worktree.
export default function TeamDialog({ taken, origin, hasMaestro, onCreate, onClose }) {
  const [team, setTeam] = useState('dev')
  const [presets, setPresets] = useState({})
  const [dir, setDir] = useState('')
  const [info, setInfo] = useState(null)
  const [base, setBase] = useState('')
  const [isolate, setIsolate] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const inspect = async (d) => {
    setErr(''); setInfo(null)
    if (!d) return
    const r = await api.gitInfo(d)
    setInfo(r)
    if (r.isRepo) setBase(r.branch)
  }
  const pick = async () => { const d = await api.pickFolder(); if (d) { setDir(d); inspect(d) } }

  const create = async (e) => {
    e.preventDefault()
    setErr('')
    const { nodes, edges } = teamNodes(team, { origin, presets, taken, uid })
    if (hasMaestro) nodes[0].data.maestro = false // a workspace has one maestro: the existing one keeps the role
    if (dir) {
      setBusy(tr("Preparando as pastas…"))
      for (const n of nodes) {
        if (info?.isRepo && isolate && !n.data.maestro && n !== nodes[0]) {
          const r = await api.gitPrepare({ dir, base, isolate: true, agent: n.data.name })
          if (r.error) { setBusy(''); return setErr(r.error) }
          n.data.cwd = r.cwd
          n.data.git = r.git
        } else {
          n.data.cwd = info?.isRepo ? info.root : dir
        }
      }
      setBusy('')
    }
    onCreate({ nodes, edges })
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-back" />
        <Dialog.Content className="dlg wide" aria-describedby={undefined}>
          <form onSubmit={create}>
            <Dialog.Title className="dlg-title">{tr("Time pronto")}</Dialog.Title>
            <div className="team-list" role="radiogroup" aria-label={tr("Modelo de time")}>
              {Object.entries(TEAMS).map(([id, t]) => (
                <label key={id} className={'team-opt' + (team === id ? ' on' : '')}>
                  <input type="radio" name="team" checked={team === id} onChange={() => setTeam(id)} />
                  <span><b>{t.label}</b><small>{t.desc}</small></span>
                </label>
              ))}
            </div>
            <div className="team-members">
              {TEAMS[team].members.map((m) => (
                <label key={m.key}>{m.name}{m.maestro ? tr(" (maestro)") : ''}
                  <select value={presets[m.key] || m.preset} onChange={(e) => setPresets({ ...presets, [m.key]: e.target.value })}>
                    {AGENT_PRESETS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label>{tr("Pasta do projeto (opcional)")}
              <span className="row"><input value={dir} placeholder={tr("C:\\projetos\\meu-app")} onChange={(e) => { setDir(e.target.value); setInfo(null) }} onBlur={() => inspect(dir)} /><button type="button" onClick={pick}>{tr("Escolher…")}</button></span>
            </label>
            {dir && info && !info.isRepo && <p className="hint">{tr("Não é um repositório git: todos abrem na mesma pasta, sem isolamento.")}</p>}
            {info?.isRepo && (
              <>
                <label>{tr("Branch de partida")}
                  <select value={base} onChange={(e) => setBase(e.target.value)}>{info.branches.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} />
                  <span>{tr("Isolar cada especialista em worktree")} <small>{tr("(branch própria; o maestro fica na pasta principal)")}</small></span>
                </label>
              </>
            )}
            {hasMaestro && <p className="hint">{tr("Este workspace já tem um maestro: ele continua no papel e o novo “maestro” entra como agente.")}</p>}
            {err && <p className="err">{err}</p>}
            <div className="dlg-actions">
              <Dialog.Close asChild><button type="button" disabled={!!busy}>{tr("Cancelar")}</button></Dialog.Close>
              <button type="submit" className="primary" disabled={!!busy}>{busy || tr("Criar time")}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
