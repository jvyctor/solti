// Markdown report of one pipeline run: what each step concluded, the estimated cost per agent and the files each
// agent changed in its worktree. Ready to paste as a PR description. Pure, so it is unit-tested.
import { getLang, tr } from './i18n.js'

const MARK = { ok: '✓', stopped: '■', timeout: '⏱', running: '…' }
const usd = (v) => `$${(Number(v) || 0).toFixed(2)}`
const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''))
const STATUS = { M: 'M', A: 'A', D: 'D', R: 'R', N: 'A' } // untracked new files show as added

// run: { title, input, state, note, t, ms, rounds, steps, results, costs: [{ id, cost }], changes: [{ id, branch, base, files: [{ file, status }] }] }
// name(id): agent name.
export function runReport(run, name = (id) => id) {
  const when = new Date(run.t).toLocaleString(getLang() === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const total = (run.costs || []).reduce((s, c) => s + (c.cost || 0), 0)
  const out = [`# ${tr('Fluxo “{0}”', [run.title])}: ${run.state === 'done' ? tr('concluído') : tr('parado')}`, '']
  if (String(run.input || '').trim()) out.push(`- **${tr('Entrada')}:** ${clip(run.input, 500)}`)
  out.push(`- **${tr('Quando')}:** ${when} · ${Math.max(1, Math.round((run.ms || 0) / 60000))} min · ${tr('{0} rodada(s)', [run.rounds || 0])}`)
  const per = (run.costs || []).filter((c) => c.cost > 0).map((c) => `${name(c.id)} ${usd(c.cost)}`)
  out.push(`- **${tr('Gasto estimado')}:** ${usd(total)}${per.length ? ` (${per.join(', ')})` : ''}`)
  if (run.note) out.push(`- **${tr('Observação')}:** ${run.note}`)
  out.push('', `## ${tr('Passos')}`, '')
  ;(run.steps || []).forEach((s, i) => {
    const r = run.results?.[i]
    const who = s.approval ? tr('Aprovação humana') : name(s.agent)
    out.push(`### ${i + 1}. ${who} ${MARK[r?.state] || '–'}${r?.runs > 1 ? ` (×${r.runs})` : ''}`, '')
    out.push(r?.summary ? clip(r.summary, 2000) : `_${tr('não executado')}_`, '')
  })
  const changed = (run.changes || []).filter((c) => c.files?.length)
  if (changed.length) {
    out.push(`## ${tr('Mudanças no código')}`, '')
    for (const c of changed) {
      out.push(`### ${name(c.id)}: \`${c.branch}\` → \`${c.base}\``, '')
      c.files.slice(0, 100).forEach((f) => out.push(`- ${STATUS[f.status] || f.status} \`${f.file}\``))
      if (c.files.length > 100) out.push(`- ${tr('… e mais {0} arquivo(s)', [c.files.length - 100])}`)
      out.push('')
    }
  }
  out.push('---', `_${tr('Gerado pelo Solti')}_`)
  return out.join('\n')
}
