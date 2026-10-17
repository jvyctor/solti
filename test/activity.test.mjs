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
  assert.equal(last.text.length, 500, 'the dock list stays short')
  assert.equal(a.query({ q: 'xxxx' })[0].text.length, 900, 'the history keeps the full text')
  assert.match(readFileSync(join(dir, 'activity.jsonl'), 'utf8'), /"kind":"send"/)
})

test('history query: by agent id (or name for old entries), kind and text, newest first', () => {
  a.init(mkdtempSync(join(tmpdir(), 'ac-act-')), () => {})
  a.record({ kind: 'prompt', from: 'Fluxo X · passo 1', to: 'dev', toId: 'n1', text: 'implemente o login' })
  a.record({ kind: 'send', from: 'dev', fromId: 'n1', to: 'rev', toId: 'n2', text: 'pronto para revisão' })
  a.record({ kind: 'done', from: 'rev', fromId: 'n2', text: 'aprovado' })
  a.record({ kind: 'send', from: 'dev', to: 'rev', text: 'entrada antiga, só com nomes' })
  const dev = { id: 'n1', name: 'dev' }
  assert.deepEqual(a.query({ agent: dev }).map((e) => e.kind), ['send', 'send', 'prompt'])
  assert.deepEqual(a.query({ agent: { id: 'n2', name: 'rev' }, kinds: ['done'] }).map((e) => e.text), ['aprovado'])
  assert.deepEqual(a.query({ q: 'LOGIN' }).map((e) => e.toId), ['n1'])
  assert.equal(a.query({ limit: 2 }).length, 2)
  assert.equal(a.query({ agent: { id: 'zz', name: 'ninguém' } }).length, 0)
})
