// Daily spend per workspace from the agents' cumulative session costs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ledger = createRequire(import.meta.url)('../electron/ledger.cjs')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)
const D1 = new Date(2026, 9, 16, 10).getTime()
const D2 = new Date(2026, 9, 17, 10).getTime()

test('first reading is a baseline; growth is booked per day and workspace; new conversations start at zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-ledger-'))
  ledger.init(dir)
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's1', cost: 5 }], D1) // spending from before the ledger: no day to book it on
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's1', cost: 7 }, { id: 'b', ws: 'w2', sid: 'x', cost: 1 }], D1)
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's1', cost: 7.5 }], D2)
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's2', cost: 0.25 }], D2) // "Nova conversa": counted from zero
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's2', cost: 0.25 }, { id: 'c', ws: 'w1', sid: 'y', cost: null }], D2) // unchanged / unknown price
  const w1 = ledger.series('w1', 3, D2)
  assert.deepEqual(w1.map((r) => r.day), ['2026-10-15', '2026-10-16', '2026-10-17'])
  near(w1[1].cost, 2)
  near(w1[2].cost, 0.75)
  near(ledger.series('w2', 2, D2)[0].cost, 1, 'an agent new since the ledger exists is booked in full')
  near(ledger.series('', 2, D2)[0].cost, 3, 'no workspace = all of them')
  // Persisted: a fresh load keeps the days and the last readings.
  ledger.init(dir)
  ledger.tick([{ id: 'a', ws: 'w1', sid: 's2', cost: 1.25 }], D2)
  near(ledger.series('w1', 1, D2)[0].cost, 1.75)
  assert.match(readFileSync(join(dir, 'costs.json'), 'utf8'), /2026-10-16/)
})

test('a smaller cost in the same conversation books nothing (log rewritten), and old days are dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-ledger-'))
  ledger.init(dir)
  ledger.tick([{ id: 'a', ws: 'w', sid: 's', cost: 3 }], D1)
  ledger.tick([{ id: 'a', ws: 'w', sid: 's', cost: 2 }], D1)
  near(ledger.series('w', 1, D1)[0].cost, 0)
  for (let i = 0; i < 130; i++) ledger.tick([{ id: 'a', ws: 'w', sid: 's', cost: 3 + i }], D1 + i * 86400000)
  const days = Object.keys(JSON.parse(readFileSync(join(dir, 'costs.json'), 'utf8')).days)
  assert.ok(days.length <= 120, `${days.length} days kept`)
})
