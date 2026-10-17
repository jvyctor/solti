import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Square, X } from 'lucide-react'
import { AGENT_COLORS, api, fmt } from './shared.js'
import { tr } from './i18n.js'

export const resetText = (ts) => {
  const m = Math.max(0, Math.round((ts * 1000 - Date.now()) / 60000))
  if (ts * 1000 < Date.now()) return tr('Janela reiniciada (sem dado novo)')
  if (m >= 2880) return tr('Redefine em {0} dias', [Math.round(m / 1440)])
  if (m >= 1440) return tr('Redefine amanhã')
  if (m >= 60) { const h = Math.round(m / 60); return h === 1 ? tr('Redefine em 1 hora') : tr('Redefine em {0} horas', [h]) }
  return m === 1 ? tr('Redefine em 1 minuto') : tr('Redefine em {0} minutos', [m])
}

// Two concentric rings: outer = session, inner = weekly.
export function Rings({ color, session = 0, weekly = 0, size = 72, stroke = 7 }) {
  const ring = (r, pct) => {
    const c = 2 * Math.PI * r
    return (
      <>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeOpacity=".22" strokeWidth={stroke} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * Math.min(pct, 100)) / 100} ${c}`} transform="rotate(-90 50 50)" />
      </>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {ring(42, session)}
      {ring(28, weekly)}
    </svg>
  )
}

export function SegBar({ color, pct }) {
  const N = 40
  const on = Math.round((Math.min(pct || 0, 100) / 100) * N)
  return (
    <div className="seg">
      {Array.from({ length: N }, (_, i) => (
        <i key={i} style={{ background: color, opacity: i < on ? 1 : 0.22 }} />
      ))}
    </div>
  )
}

export function AgentUsage({ name, plan, color, session, weekly, note }) {
  return (
    <section className="agent">
      <header>
        <Rings color={color} session={session?.pct ?? 0} weekly={weekly?.pct ?? 0} />
        <div>
          <b>{name}</b>
          <small>{plan}</small>
        </div>
      </header>
      {session ? (
        <>
          <div className="urow"><span>{tr("Sessão")}</span><b>{Math.round(session.pct)}%</b></div>
          <SegBar color={color} pct={session.pct} />
          <small>{session.resets_at ? resetText(session.resets_at) : ''}</small>
          {weekly && (
            <>
              <div className="urow"><span>{tr("Semanal")}</span><b>{Math.round(weekly.pct)}%</b></div>
              <SegBar color={color} pct={weekly.pct} />
              <small>{weekly.resets_at ? resetText(weekly.resets_at) : ''}</small>
            </>
          )}
        </>
      ) : (
        <small>{note}</small>
      )}
    </section>
  )
}

// Normalises each provider's payload to { pct, resets_at (unix seconds) }.
export function useAgents() {
  const [u, setU] = useState(null)
  const load = useCallback(() => api.usage().then(setU), [])
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])
  const cq = u?.claudeQuota
  const cx = u?.codex
  const agents = [
    {
      key: 'claude', name: 'Claude Code', plan: cq?.plan ? cq.plan[0].toUpperCase() + cq.plan.slice(1) : '',
      session: cq?.session && { pct: cq.session.utilization, resets_at: Date.parse(cq.session.resets_at) / 1000 },
      weekly: cq?.weekly && { pct: cq.weekly.utilization, resets_at: Date.parse(cq.weekly.resets_at) / 1000 },
      note: u?.claude ? tr("{0} · {1} tokens em 5 h, {2} em 7 dias", [cq?.error || 'sem dados', fmt(u.claude.h5), fmt(u.claude.d7)]) : tr("carregando…"),
    },
    {
      key: 'codex', name: 'Codex', plan: cx?.plan ? cx.plan[0].toUpperCase() + cx.plan.slice(1) : '',
      session: cx?.session && { pct: cx.session.used_percent, resets_at: cx.session.resets_at },
      weekly: cx?.weekly && { pct: cx.weekly.used_percent, resets_at: cx.weekly.resets_at },
      note: u ? tr("sem dados locais") : tr("carregando…"),
    },
    { key: 'gemini', name: 'Gemini / Antigravity', plan: '', note: tr("cota não disponível localmente") },
  ]
  return { agents, load }
}

export function UsageDock() {
  const [open, setOpen] = useState(false)
  const { agents, load } = useAgents()
  const root = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => !root.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={root} className="usage-root">
      {open && (
        <div className="usage">
          <h4>{tr("Uso dos agentes")} <span><button onClick={load} aria-label={tr("Atualizar")} title={tr("Atualizar")}><RefreshCw size={15} /></button><button onClick={() => setOpen(false)} aria-label={tr("Fechar")} title={tr("Fechar")}><X size={16} /></button></span></h4>
          <div className="usage-scroll">
            {agents.map((a) => <AgentUsage key={a.key} color={AGENT_COLORS[a.key]} {...a} />)}
          </div>
          <button className="stop-all" onClick={() => api.interrupt()} title={tr("Envia Esc e Ctrl+C para todos os terminais")}><Square size={13} /> {tr("Interromper todos os agentes")}</button>
        </div>
      )}
      <button className="dock" onClick={() => setOpen((o) => !o)} aria-label={tr("Uso dos agentes")} aria-expanded={open} title={tr("Uso dos agentes")}>
        {agents.map((a) => (
          <Rings key={a.key} size={26} stroke={10} color={AGENT_COLORS[a.key]} session={a.session?.pct ?? 0} weekly={a.weekly?.pct ?? 0} />
        ))}
      </button>
    </div>
  )
}
