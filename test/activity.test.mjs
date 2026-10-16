import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const a = createRequire(import.meta.url)('../electron/activity.cjs')

test('which actions need approval per mode', () => {
  assert.equal(a.needsApproval('off', 'spawn'), false)
  assert.equal(a.needsApproval('spawn', 'spawn'), true)
  assert.equal(a.needsApproval('spawn', 'send'), false)
  for (const k of ['send', 'ask', 'spawn', 'portal']) assert.equal(a.needsApproval('all', k), true, k)
  assert.equal(a.needsApproval('all', 'remember'), false)
})

test('request waits for the answer; record keeps and persists the timeline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-act-'))
  const sent = []
  a.init(dir, (ch, d) => sent.push([ch, d]))

  const p = a.request({ kind: 'spawn', from: 'maestro', to: 'x' })
  const req = sent.find(([ch]) => ch === 'approval:request')[1]
  assert.equal(req.from, 'maestro')
  a.answer(req.id, true)
  assert.equal(await p, true)

  const q = a.request({ kind: 'send', from: 'a', to: 'b' })
  a.answer(sent.filter(([ch]) => ch === 'approval:request')[1][1].id, false)
  assert.equal(await q, false)
  a.answer(9999, true) // unknown id: ignored

  a.record({ kind: 'send', from: 'a', to: 'b', text: 'x'.repeat(900), outcome: 'ok' })
  const last = a.list().at(-1)
  assert.equal(last.text.length, 500)
  assert.match(readFileSync(join(dir, 'activity.jsonl'), 'utf8'), /"kind":"send"/)
})
