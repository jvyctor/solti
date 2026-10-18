import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { RefreshCw, Square, X } from 'lucide-react'
import { AGENT_COLORS, UsageCtx, api, fmt, money } from './shared.js'
import { wsCost } from './costs.js'
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

// Why the Claude quota is unavailable, from the main process's short code.
const quotaError = (code) => {
  if (!code) return tr('sem dados')
  if (code === 'off') return tr('consulta da cota desligada nas configurações')
  if (code === 'nocred') return tr('cota indisponível (sem credencial local do Claude Code)')
  if (code === 'expired') return tr('login expirado: abra o Claude Code')
  if (code === 'offline') return tr('sem conexão')
  if (code === 'unreadable') return tr('credencial ilegível')
  if (code.startsWith('http-')) return tr('cota indisponível (HTTP {0})', [code.slice(5)])
  return tr('sem dados')
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
      note: u?.claude ? tr("{0} · {1} tokens em 5 h, {2} em 7 dias", [quotaError(cq?.error), fmt(u.claude.h5), fmt(u.claude.d7)]) : tr("carregando…"),
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

// Spend per day for the last 14 days (main process ledger): one series, so no legend; the extreme is labeled,
// each column has a hover tooltip, and a hidden table carries the values for screen readers.
const DAYS = 14
function DailySpend({ ws }) {
  const [rows, setRows] = useState(null)
  const [hover, setHover] = useState(-1)
  useEffect(() => {
    let alive = true
    const load = () => api.costsSeries(ws.id, DAYS).then((r) => alive && setRows(r))
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [ws.id])
  if (!rows) return null
  const W = 300, H = 64, TOP = 14, GAP = 2
  const slot = W / rows.length
  const bw = Math.min(16, slot - GAP)
  const max = Math.max(...rows.map((r) => r.cost), 0)
  const peak = rows.findIndex((r) => r.cost === max && max > 0)
  const label = (day) => new Date(day + 'T12:00').toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
  const total = rows.reduce((s, r) => s + r.cost, 0)
  const bar = (r, i) => {
    const h = max > 0 ? Math.max(r.cost > 0 ? 2 : 0, ((H - TOP) * r.cost) / max) : 0
    const x = i * slot + (slot - bw) / 2, y = H - h, rad = Math.min(4, h, bw / 2)
    // 4px rounded data-end, square at the baseline.
    return h > 0 ? `M${x},${H} V${y + rad} Q${x},${y} ${x + rad},${y} H${x + bw - rad} Q${x + bw},${y} ${x + bw},${y + rad} V${H} Z` : ''
  }
  const cur = hover >= 0 ? rows[hover] : null
  return (
    <div className="daily">
      <div className="daily-head">
        <span>{tr("Gasto por dia")}</span>
        <small>{cur ? `${label(cur.day)} · ${money(cur.cost)}` : tr("{0} dias: {1}", [DAYS, money(total)])}</small>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={tr("Gasto estimado por dia nos últimos {0} dias, total {1}", [DAYS, money(total)])} onMouseLeave={() => setHover(-1)}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="daily-axis" />
        {rows.map((r, i) => <path key={r.day} d={bar(r, i)} className={'daily-bar' + (hover === i ? ' on' : '')} />)}
        {peak >= 0 && <text x={Math.min(Math.max(peak * slot + slot / 2, 18), W - 18)} y={TOP - 4} textAnchor="middle" className="daily-val">{money(max)}</text>}{/* the tallest column always reaches TOP */}
        <text x="0" y={H + 12} className="daily-tick">{label(rows[0].day)}</text>
        <text x={W} y={H + 12} textAnchor="end" className="daily-tick">{tr("hoje")}</text>
        {/* hit targets: the whole column slot, taller than the mark */}
        {rows.map((r, i) => <rect key={'h' + r.day} x={i * slot} y="0" width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)}><title>{`${label(r.day)}: ${money(r.cost)}`}</title></rect>)}
      </svg>
      <table className="visually-hidden">
        <caption>{tr("Gasto por dia")}</caption>
        <tbody>{rows.map((r) => <tr key={r.day}><th scope="row">{label(r.day)}</th><td>{money(r.cost)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// This workspace's estimated spend per agent, and its budget (stored on the workspace; App enforces it).
export function CostPanel({ ws, update }) {
  const { byNode } = useContext(UsageCtx)
  const rows = ws.nodes.filter((n) => n.type === 'terminal' && byNode[n.id]?.tokens > 0).map((n) => ({ id: n.id, name: n.data.name, ...byNode[n.id] })).sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1))
  const { total, partial } = wsCost(ws, byNode)
  const budget = ws.budget || 0
  const pct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0
  const [draft, setDraft] = useState(budget ? String(budget) : '')
  useEffect(() => setDraft(budget ? String(budget) : ''), [ws.id, budget])
  const save = () => {
    const v = Number(String(draft).replace(',', '.'))
    update((w) => ({ ...w, budget: v > 0 ? Math.round(v * 100) / 100 : 0 }))
  }
  return (
    <section className="agent cost-panel">
      <header className="cost-head">
        <div><b>{tr("Custo estimado")}</b><small>{tr("deste workspace, pelo preço de API")}</small></div>
        <b className="cost-total" title={partial ? tr("Parcial: há agente com modelo sem preço conhecido") : ''}>{money(total)}{partial ? '+' : ''}</b>
      </header>
      {rows.length === 0 && <small>{tr("Nenhum gasto registrado ainda.")}</small>}
      {rows.map((r) => (
        <div key={r.id} className="cost-row">
          <button className="link" onClick={() => window.dispatchEvent(new CustomEvent('ac:goto', { detail: { nodeId: r.id } }))}>{r.name}</button>
          <small title={r.model}>{r.model || ''}</small>
          <span>{fmt(r.tokens)} {tr("tok")}</span>
          <b>{money(r.cost)}</b>
        </div>
      ))}
      <label className="cost-budget">
        <span>{tr("Orçamento (US$)")}</span>
        <input inputMode="decimal" placeholder={tr("sem limite")} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={tr("Orçamento do workspace em dólares")} />
      </label>
      {budget > 0 && (
        <>
          <SegBar color={total >= budget ? 'var(--danger)' : pct >= 80 ? 'var(--maestro)' : 'var(--success)'} pct={pct} />
          <small>{total >= budget ? tr("Atingido: agentes interrompidos e fluxos bloqueados. Aumente para continuar.") : tr("{0}% usado. Ao atingir, os agentes são interrompidos e os fluxos param.", [Math.round(pct)])}</small>
        </>
      )}
      <DailySpend ws={ws} />
      <small className="cost-note">{tr("Estimativa a partir dos logs dos CLIs. Em planos por assinatura não há cobrança por token. Preços em Configurações → Agentes.")}</small>
    </section>
  )
}

export function UsageDock({ ws, update }) {
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
            {ws && <CostPanel ws={ws} update={update} />}
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
