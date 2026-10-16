// What agents did to each other (timeline) and the approval gate for risky actions.
const fs = require('fs')
const path = require('path')

const KEEP = 500
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
    for (const l of fs.readFileSync(file, 'utf8').split('\n').slice(-KEEP)) if (l) entries.push(JSON.parse(l))
  } catch {}
}

// kind: send | ask | spawn | portal | remember. outcome: ok | denied
function record(e) {
  const entry = { t: Date.now(), ...e, text: String(e.text || '').slice(0, 500) }
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

// Resolves true/false; no answer within TIMEOUT counts as denied. Anyone (desktop dialog or phone) may answer; the first wins.
function request(info) {
  return new Promise((resolve) => {
    const id = ++seq
    const done = (ok) => { clearTimeout(timer); pending.delete(id); send('approval:close', id); emit('closed', id); resolve(ok) }
    const timer = setTimeout(() => done(false), TIMEOUT)
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

module.exports = { init, record, list: () => entries.slice(-200), needsApproval, request, answer, pendingList, on }
