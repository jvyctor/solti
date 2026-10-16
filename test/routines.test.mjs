import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { create } = createRequire(import.meta.url)('../electron/routines.cjs')
const MIN = 60000

test('scheduler fires due routines once, records the result and survives a failing run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-routines-'))
  let t = new Date(2026, 9, 16, 8, 0).getTime()
  const ran = []
  const rs = create({ dir, now: () => t, run: async (r) => { ran.push(r.name); if (r.name === 'quebra') throw new Error('agente não está rodando'); return 'enviado' } })
  const saved = rs.save([
    { id: 'a', name: 'revisão', target: { type: 'agent', id: 'x' }, prompt: 'revise', schedule: { kind: 'interval', minutes: 30 }, created: t },
    { id: 'b', name: 'quebra', target: { type: 'agent', id: 'y' }, prompt: 'x', schedule: { kind: 'interval', minutes: 30 }, created: t },
    { id: 'c', name: 'desligada', enabled: false, target: { type: 'agent', id: 'z' }, schedule: { kind: 'interval', minutes: 1 }, created: t },
  ])
  assert.equal(saved.length, 3)
  await rs.tick()
  assert.deepEqual(ran, [])
  t += 31 * MIN
  await rs.tick()
  assert.deepEqual(ran, ['revisão', 'quebra'])
  await rs.tick() // same instant: nothing repeats
  assert.equal(ran.length, 2)
  const list = rs.list()
  assert.equal(list.find((r) => r.id === 'a').lastResult, 'ok: enviado')
  assert.match(list.find((r) => r.id === 'b').lastResult, /^erro: agente não está rodando/)
  assert.ok(list.find((r) => r.id === 'a').next > t)
  // persisted, and the editor cannot overwrite lastRun
  const again = create({ dir, run: async () => '' })
  assert.equal(again.list().find((r) => r.id === 'a').lastRun, t)
  const edited = again.save([{ ...again.list()[0], lastRun: 1, name: 'renomeada' }])
  assert.equal(edited[0].lastRun, t)
  assert.equal(JSON.parse(readFileSync(join(dir, 'routines.json'), 'utf8'))[0].name, 'renomeada')
})

test('input is sanitised', () => {
  const rs = create({ dir: mkdtempSync(join(tmpdir(), 'ac-routines-')), run: async () => '' })
  const [r] = rs.save([{ name: 'x'.repeat(500), target: { type: 'bogus', id: 5 }, prompt: 'p'.repeat(9000), schedule: { kind: 'interval', minutes: -5 } }])
  assert.equal(r.name.length, 80)
  assert.equal(r.target.type, 'agent')
  assert.equal(r.prompt.length, 4000)
  assert.equal(r.schedule.minutes, 60 > 1 ? 60 : 1) // invalid minutes fall back to the default
})
