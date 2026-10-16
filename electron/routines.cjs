// Scheduled routines: send an instruction to an agent, or start a pipeline, on a schedule. Runs only while the app is open.
const fs = require('fs')
const path = require('path')
const { dueAt, nextRun } = require('./schedule.cjs')

const clean = (r, old) => {
  const s = r.schedule || {}
  const schedule = s.kind === 'daily' ? { kind: 'daily', time: /^\d{1,2}:\d{2}$/.test(s.time) ? s.time : '09:00', days: (s.days || []).map(Number).filter((d) => d >= 0 && d <= 6) }
    : s.kind === 'once' ? { kind: 'once', at: Number(s.at) || Date.now() }
    : { kind: 'interval', minutes: Math.min(Number(s.minutes) > 0 ? Number(s.minutes) : 60, 60 * 24 * 30) }
  return {
    id: String(r.id || Math.random().toString(36).slice(2, 10)),
    name: String(r.name || 'Rotina').slice(0, 80),
    enabled: r.enabled !== false,
    target: { type: r.target?.type === 'pipeline' ? 'pipeline' : 'agent', id: String(r.target?.id || '') },
    prompt: String(r.prompt || '').slice(0, 4000),
    schedule,
    created: old?.created || r.created || Date.now(),
    lastRun: old?.lastRun || 0, // owned by the scheduler, not by the editor
    lastResult: old?.lastResult || '',
  }
}

// run(routine) -> Promise<string note> (throws on failure); injected so the scheduler is testable without Electron.
function create({ dir, run, now = () => Date.now(), tickMs = 15000 }) {
  const file = path.join(dir, 'routines.json')
  let list = []
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')).map((r) => clean(r, r)) } catch {}
  let timer
  const save = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(list, null, 2)) }

  async function fire(r, slot) {
    r.lastRun = r.schedule.kind === 'daily' ? slot : now() // daily needs the slot (no double run); an interval counts from the actual run
    try { r.lastResult = 'ok: ' + (await run(r)) } catch (e) { r.lastResult = 'erro: ' + e.message }
    save()
  }
  async function tick() {
    const t = now()
    for (const r of list) {
      const slot = dueAt(r, t)
      if (slot !== null) await fire(r, slot)
    }
  }
  return {
    list: () => list.map((r) => ({ ...r, next: nextRun(r, now()) })),
    save(next) {
      const byId = new Map(list.map((r) => [r.id, r]))
      list = next.map((r) => clean(r, byId.get(String(r.id))))
      save()
      return this.list()
    },
    async runNow(id) { const r = list.find((x) => x.id === id); if (r) await fire(r, now()) },
    tick,
    start() { timer = setInterval(tick, tickMs); setTimeout(tick, 3000) },
    stop() { clearInterval(timer) },
  }
}

module.exports = { create }
