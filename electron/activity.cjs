// What agents did to each other (timeline) and the approval gate for risky actions.
const fs = require('fs')
const path = require('path')

const KEEP = 3000 // in memory, for the per-agent history
const FILE_MAX = 6000 // lines on disk before the file is trimmed back to KEEP
const TIMEOUT = 120 * 1000
let file = ''
let send = () => {}
const entries = []
const pending = new Map() // approval id -> resolve
let seq = 0

function init(userData, push) {
  file = path.join(userData, 'activity.jsonl')
  send = push
  try {
    const all = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    for (const l of all.slice(-KEEP)) try { entries.push(JSON.parse(l)) } catch {}
    if (all.length > FILE_MAX) fs.writeFileSync(file, all.slice(-KEEP).join('\n') + '\n')
  } catch {}
}

// kind: send | ask | spawn | portal | done | prompt | routine | budget | remote. outcome: ok | denied
// fromId / toId: node ids, so an agent's history survives renames.
function record(e) {
  const entry = { t: Date.now(), ...e, text: String(e.text || '').slice(0, 4000) }
  entries.push(entry)
  if (entries.length > KEEP) entries.shift()
  try { fs.appendFileSync(file, JSON.stringify(entry) + '\n') } catch {}
  send('activity', entry)
  emit('entry', entry)
}

// Which actions need the user's OK for a given mode: off | spawn | all.
const needsApproval = (mode, kind) => mode === 'all' ? ['send', 'ask', 'spawn', 'portal'].includes(kind) : mode === 'spawn' && kind === 'spawn'

// Listeners (the phone remote) hear about new entries and about approvals opening/closing.
const listeners = { entry: new Set(), request: new Set(), closed: new Set() }
const on = (ev, cb) => { listeners[ev].add(cb); return () => listeners[ev].delete(cb) }
const emit = (ev, d) => listeners[ev].forEach((cb) => { try { cb(d) } catch {} })

// Resolves true/false; no answer within `timeout` ms counts as denied. Anyone (desktop dialog or phone) may answer; the first wins.
// info.key lets the asker withdraw the request (cancel).
function request(info, { timeout = TIMEOUT } = {}) {
  return new Promise((resolve) => {
    const id = ++seq
    const done = (ok) => { clearTimeout(timer); pending.delete(id); send('approval:close', id); emit('closed', id); resolve(ok) }
    const timer = setTimeout(() => done(false), timeout)
    pending.set(id, { info: { id, ...info }, done })
    send('approval:request', { id, ...info })
    emit('request', { id, ...info })
  })
}
function answer(id, ok) {
  const r = pending.get(id)
  if (r) r.done(!!ok)
}
const pendingList = () => [...pending.values()].map((p) => p.info)
// Withdraws a request by its key (e.g. a pipeline stopped while waiting for your OK): counts as denied.
function cancel(key) {
  for (const p of pending.values()) if (key && p.info.key === key) p.done(false)
}

// History search, newest first. agent: { id, name } narrows to what involved that agent (old entries carry only names).
// q: case-insensitive text found in the names or the text. kinds: optional list.
function query({ agent, q = '', kinds, limit = 300 } = {}) {
  const needle = String(q).trim().toLowerCase()
  const out = []
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i]
    if (agent && !(e.fromId === agent.id || e.toId === agent.id || (!e.fromId && !e.toId && agent.name && (e.from === agent.name || e.to === agent.name)))) continue
    if (kinds?.length && !kinds.includes(e.kind)) continue
    if (needle && ![e.text, e.from, e.to].some((s) => String(s || '').toLowerCase().includes(needle))) continue
    out.push(e)
  }
  return out
}

module.exports = { init, record, list: () => entries.slice(-200).map((e) => ({ ...e, text: e.text.slice(0, 500) })), query, needsApproval, request, answer, cancel, pendingList, on }
