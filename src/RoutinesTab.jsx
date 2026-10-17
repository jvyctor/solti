import { useEffect, useState } from 'react'
import { Plus, Trash2, Play } from 'lucide-react'
import { getLang, tr } from './i18n.js'

const api = window.api
const DAYS = [tr('Dom'), tr('Seg'), tr('Ter'), tr('Qua'), tr('Qui'), tr('Sex'), tr('Sáb')]
const when = (t) => (t ? new Date(t).toLocaleString(getLang() === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

const blank = (targets) => ({
  id: 'r' + Date.now().toString(36),
  name: 'Nova rotina',
  enabled: true,
  target: { type: targets[0]?.type || 'agent', id: targets[0]?.id || '' },
  prompt: '',
  schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
})

// Settings → Rotinas. targets: [{ type: 'agent' | 'pipeline', id, label }] from every workspace. Section/Row/Switch from Settings.jsx.
export default function RoutinesTab({ targets, ui: { Section, Row, Switch } }) {
  const [list, setList] = useState([])
  const load = () => api.routinesList().then(setList)
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  const persist = (next) => { setList(next); return api.routinesSave(next).then(setList) }
  const patch = (id, p) => persist(list.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const label = (r) => targets.find((t) => t.type === r.target.type && t.id === r.target.id)?.label || tr('alvo removido')

  return (
    <>
      <Section title={tr("ROTINAS AGENDADAS")}>
        <p className="set-note-left" style={{ margin: '0 0 12px' }}>
          {tr("Mandam uma instrução a um agente, ou iniciam um fluxo, em horário marcado. Funcionam enquanto o app estiver aberto; um horário diário perdido com o app fechado é pulado. O agente precisa estar com o terminal aberto (workspace já aberto nesta sessão).")}
        </p>
        {list.length === 0 && <p className="set-note-left">{tr("Nenhuma rotina.")}</p>}
        {list.map((r) => (
          <div key={r.id} className="routine">
            <div className="routine-head">
              <input className="set-input" aria-label={tr("Nome da rotina")} value={r.name} onChange={(e) => setList(list.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} onBlur={() => persist(list)} />
              <Switch label={tr("Ativar {0}", [r.name])} checked={r.enabled} onChange={(v) => patch(r.id, { enabled: v })} />
              <button className="set-btn" title={tr("Executar agora")} aria-label={tr("Executar agora")} onClick={() => api.routinesRun(r.id).then(load)}><Play size={13} /></button>
              <button className="set-btn danger" title={tr("Excluir")} aria-label={tr("Excluir rotina")} onClick={() => persist(list.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
            </div>
            <div className="routine-grid">
              <label>{tr("Alvo")}
                <select value={`${r.target.type}:${r.target.id}`} onChange={(e) => { const [type, ...id] = e.target.value.split(':'); patch(r.id, { target: { type, id: id.join(':') } }) }}>
                  {!targets.some((t) => t.type === r.target.type && t.id === r.target.id) && <option value={`${r.target.type}:${r.target.id}`}>{label(r)}</option>}
                  {targets.map((t) => <option key={t.type + t.id} value={`${t.type}:${t.id}`}>{t.type === 'pipeline' ? tr("Fluxo · ") : tr("Agente · ")}{t.label}</option>)}
                </select>
              </label>
              <label>{tr("Quando")}
                <select value={r.schedule.kind} onChange={(e) => patch(r.id, { schedule: e.target.value === 'daily' ? { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } : e.target.value === 'once' ? { kind: 'once', at: Date.now() + 3600e3 } : { kind: 'interval', minutes: 60 } })}>
                  <option value="daily">{tr("Todo dia, em horário fixo")}</option>
                  <option value="interval">{tr("A cada N minutos")}</option>
                  <option value="once">{tr("Uma vez")}</option>
                </select>
              </label>
            </div>
            {r.schedule.kind === 'daily' && (
              <div className="routine-when">
                <input type="time" aria-label={tr("Horário")} value={r.schedule.time} onChange={(e) => patch(r.id, { schedule: { ...r.schedule, time: e.target.value } })} />
                {DAYS.map((d, i) => (
                  <label key={d} className="routine-day"><input type="checkbox" checked={r.schedule.days.includes(i)} onChange={(e) => patch(r.id, { schedule: { ...r.schedule, days: e.target.checked ? [...r.schedule.days, i] : r.schedule.days.filter((x) => x !== i) } })} />{d}</label>
                ))}
              </div>
            )}
            {r.schedule.kind === 'interval' && (
              <div className="routine-when"><input type="number" min="1" aria-label={tr("Minutos")} value={r.schedule.minutes} onChange={(e) => patch(r.id, { schedule: { kind: 'interval', minutes: Number(e.target.value) } })} /> {tr("minutos")}</div>
            )}
            {r.schedule.kind === 'once' && (
              <div className="routine-when"><input type="datetime-local" aria-label={tr("Data e hora")} value={toLocalInput(r.schedule.at)} onChange={(e) => e.target.value && patch(r.id, { schedule: { kind: 'once', at: new Date(e.target.value).getTime() } })} /></div>
            )}
            {r.target.type === 'agent' && (
              <textarea rows={2} aria-label={tr("Instrução")} placeholder={tr("Instrução enviada ao agente")} value={r.prompt} onChange={(e) => setList(list.map((x) => (x.id === r.id ? { ...x, prompt: e.target.value } : x)))} onBlur={() => persist(list)} />
            )}
            <p className="set-note-left">{tr("Próxima:")} {r.enabled ? when(r.next) : tr("desativada")} {tr("· Última:")} {when(r.lastRun)} {r.lastResult && `(${r.lastResult})`}</p>
          </div>
        ))}
        <button className="set-btn" onClick={() => persist([...list, blank(targets)])}><Plus size={13} /> {tr("Nova rotina")}</button>
      </Section>
    </>
  )
}
