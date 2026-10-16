import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { dueAt, nextRun } = createRequire(import.meta.url)('../electron/schedule.cjs')
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const MIN = 60000

test('interval: due after N minutes from the last run (or creation), never catches up twice', () => {
  const r = { enabled: true, created: at(2026, 10, 16, 8), lastRun: 0, schedule: { kind: 'interval', minutes: 60 } }
  assert.equal(dueAt(r, at(2026, 10, 16, 8, 59)), null)
  assert.equal(dueAt(r, at(2026, 10, 16, 9, 0)), at(2026, 10, 16, 9))
  assert.equal(dueAt({ ...r, lastRun: at(2026, 10, 16, 9) }, at(2026, 10, 16, 9, 30)), null)
  assert.equal(dueAt({ ...r, enabled: false }, at(2026, 10, 16, 20)), null)
})

test('daily: runs at the slot, once, only on chosen weekdays, skips slots missed by more than 10 minutes', () => {
  const mon = at(2026, 10, 19, 9) // 19 Oct 2026 is a Monday
  const r = { enabled: true, created: at(2026, 10, 1), lastRun: 0, schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } }
  assert.equal(dueAt(r, mon - MIN), null) // not yet
  assert.equal(dueAt(r, mon), mon)
  assert.equal(dueAt(r, mon + 5 * MIN), mon)
  assert.equal(dueAt({ ...r, lastRun: mon }, mon + 5 * MIN), null) // already ran
  assert.equal(dueAt(r, mon + 30 * MIN), null) // missed while closed: skipped
  const sat = at(2026, 10, 17, 9)
  assert.equal(dueAt(r, sat), null) // weekend not selected
})

test('once: runs when the time passes, even late, and only once', () => {
  const r = { enabled: true, created: 0, lastRun: 0, schedule: { kind: 'once', at: at(2026, 10, 16, 15) } }
  assert.equal(dueAt(r, at(2026, 10, 16, 14, 59)), null)
  assert.equal(dueAt(r, at(2026, 10, 17, 9)), at(2026, 10, 16, 15))
  assert.equal(dueAt({ ...r, lastRun: 1 }, at(2026, 10, 17, 9)), null)
})

test('nextRun for display', () => {
  const now = at(2026, 10, 16, 10) // Friday
  const daily = { enabled: true, created: 0, schedule: { kind: 'daily', time: '09:00', days: [1] } }
  assert.equal(nextRun(daily, now), at(2026, 10, 19, 9)) // next Monday
  assert.equal(nextRun({ enabled: true, created: now, schedule: { kind: 'interval', minutes: 30 } }, now), now + 30 * MIN)
  assert.equal(nextRun({ ...daily, enabled: false }, now), null)
  assert.equal(nextRun({ enabled: true, lastRun: 1, schedule: { kind: 'once', at: now } }, now), null)
})
