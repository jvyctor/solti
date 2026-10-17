// Spend per workspace per day (US$, estimated), kept in userData/costs.json.
// Agents report the cumulative cost of their current conversation; what grew since the last reading is booked on
// today, in the agent's workspace. A new conversation (another sid) starts again from zero.
// The very first reading after the ledger is created is only a baseline: older spending has no known day.
const fs = require('fs')
const path = require('path')

const KEEP_DAYS = 120
let file = ''
let data = null

const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function init(dir) {
  file = path.join(dir, 'costs.json')
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { data = null }
  if (!data || typeof data !== 'object' || !data.days) data = { fresh: true, last: {}, days: {} }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(data))
    fs.renameSync(file + '.tmp', file)
  } catch {}
}

// agents: [{ id, ws, sid, cost }] (cost null = unknown price: ignored)
function tick(agents, now = Date.now()) {
  if (!data) return
  const today = dayOf(now)
  let changed = false
  for (const a of agents) {
    if (a.cost == null || !a.id) continue
    const prev = data.last[a.id]
    let delta = 0
    if (!prev) delta = data.fresh ? 0 : a.cost // a new agent since the ledger exists: all of it is recent
    else if (prev.sid !== a.sid) delta = a.cost // new conversation
    else delta = a.cost - prev.cost
    if (!prev || prev.sid !== a.sid || prev.cost !== a.cost) { data.last[a.id] = { sid: a.sid, cost: a.cost }; changed = true }
    if (delta > 0) {
      const day = (data.days[today] ||= {})
      day[a.ws] = (day[a.ws] || 0) + delta
      changed = true
    }
  }
  if (data.fresh) { data.fresh = false; changed = true }
  const days = Object.keys(data.days).sort()
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) { delete data.days[d]; changed = true }
  if (changed) save()
}

// Last `n` days for one workspace (or all when ws is empty), oldest first: [{ day, cost }].
function series(ws, n = 14, now = Date.now()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const day = dayOf(now - i * 86400000)
    const d = data?.days[day] || {}
    out.push({ day, cost: ws ? d[ws] || 0 : Object.values(d).reduce((s, v) => s + v, 0) })
  }
  return out
}

module.exports = { init, tick, series, dayOf }
