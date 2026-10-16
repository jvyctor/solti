// When a routine is due. Schedules: { kind: 'daily', time: 'HH:MM', days: [0..6] } | { kind: 'interval', minutes } | { kind: 'once', at: epoch ms }.
// Daily runs missed while the app was closed are skipped (only a slot within the last GRACE minutes still counts);
// a one-off run that was missed runs when the app next opens.
const GRACE = 10 * 60 * 1000

// The most recent daily slot at or before `now` (local time) on an allowed weekday, or null.
function lastSlot(schedule, now) {
  const [h, m] = String(schedule.time || '09:00').split(':').map(Number)
  const days = schedule.days?.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6]
  for (let back = 0; back < 8; back++) {
    const d = new Date(now)
    d.setDate(d.getDate() - back)
    d.setHours(h || 0, m || 0, 0, 0)
    if (d.getTime() <= now && days.includes(d.getDay())) return d.getTime()
  }
  return null
}

// Returns the time this routine should run for (a number) when it is due now, else null.
function dueAt(r, now = Date.now()) {
  if (!r.enabled) return null
  const s = r.schedule || {}
  const last = r.lastRun || 0
  if (s.kind === 'interval') {
    const next = (last || r.created || now) + Math.max(1, Number(s.minutes) || 60) * 60000
    return now >= next ? next : null
  }
  if (s.kind === 'once') return !last && now >= s.at ? s.at : null
  if (s.kind === 'daily') {
    const slot = lastSlot(s, now)
    return slot && slot > last && slot > (r.created || 0) - 1 && now - slot <= GRACE ? slot : null
  }
  return null
}

// Next planned run, for display. null when nothing is scheduled.
function nextRun(r, now = Date.now()) {
  if (!r.enabled) return null
  const s = r.schedule || {}
  if (s.kind === 'interval') return Math.max(now, (r.lastRun || r.created || now) + Math.max(1, Number(s.minutes) || 60) * 60000)
  if (s.kind === 'once') return r.lastRun ? null : Math.max(now, s.at)
  if (s.kind === 'daily') {
    const [h, m] = String(s.time || '09:00').split(':').map(Number)
    const days = s.days?.length ? s.days : [0, 1, 2, 3, 4, 5, 6]
    for (let ahead = 0; ahead < 8; ahead++) {
      const d = new Date(now)
      d.setDate(d.getDate() + ahead)
      d.setHours(h || 0, m || 0, 0, 0)
      if (d.getTime() > now && days.includes(d.getDay())) return d.getTime()
    }
  }
  return null
}

module.exports = { dueAt, nextRun, lastSlot, GRACE }
