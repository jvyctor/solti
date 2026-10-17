import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fill, groupsOf, joinSummaries, loopDecision, settle, shouldStop, timeoutMs, validate } from '../src/pipeline.js'

test('parallel steps join the group of the step above; the first step never does', () => {
  assert.deepEqual(groupsOf([{}, { parallel: true }, {}, { parallel: true }, { parallel: true }]), [[0, 1], [2, 3, 4]])
  assert.deepEqual(groupsOf([{ parallel: true }, {}]), [[0], [1]])
  assert.deepEqual(groupsOf([]), [])
})

test('{{prev}} after a parallel group lists each agent; an explicit prev wins over list order', () => {
  assert.equal(joinSummaries([{ name: 'dev', summary: 'feito' }]), 'feito')
  assert.equal(joinSummaries([{ name: 'dev', summary: 'feito' }, { name: 'qa', summary: 'testes ok' }]), 'dev: feito\nqa: testes ok')
  assert.equal(fill('{{prev}}', { results: [{ summary: 'a' }, { summary: 'b' }], prev: 'revisor reprovou' }), 'revisor reprovou')
  assert.equal(fill('{{prev}}', { results: [{ summary: 'a' }, null] }), 'a', 'steps not run yet are skipped')
})

test('loops: jump back while repetitions are left, then go on', () => {
  const groups = [[0], [1], [2]]
  const step = { loopIf: 'REPROVADO', loopTo: 1, loopMax: 2 }
  assert.deepEqual(loopDecision(step, 'Resultado: reprovado, falta teste', 0, groups), { jump: 0 })
  assert.deepEqual(loopDecision(step, 'reprovado', 1, groups), { jump: 0 })
  assert.deepEqual(loopDecision(step, 'reprovado', 2, groups), { exhausted: true })
  assert.equal(loopDecision(step, 'aprovado', 0, groups), null)
  assert.equal(loopDecision({ loopIf: '', loopTo: 1 }, 'x', 0, groups), null)
  assert.deepEqual(loopDecision({ loopIf: 'x', loopTo: 2 }, 'x', 0, [[0, 1], [2]]), { jump: 0 }, 'a step inside a parallel group jumps to its group')
})

test('validation: agents present, distinct inside a parallel group, loops only go back', () => {
  const ok = () => true
  assert.equal(validate([{ agent: 'a' }, { agent: 'b', parallel: true }], ok), '')
  assert.match(validate([{ agent: 'a' }, { agent: 'a', parallel: true }], ok), /agentes diferentes/)
  assert.match(validate([{ agent: '' }], (x) => !!x), /Passo 1/)
  assert.match(validate([{ agent: 'a', loopIf: 'x', loopTo: 3 }], ok), /passo anterior/)
  assert.equal(validate([{ agent: 'a' }, { agent: 'b', loopIf: 'x', loopTo: 1 }], ok), '')
  assert.match(validate([], ok), /não tem passos/)
  assert.equal(validate([{ agent: 'a' }, { approval: true }, { agent: 'b' }], (x) => !!x), '', 'an approval needs no agent')
  assert.match(validate([{ agent: 'a' }, { approval: true, parallel: true }], ok), /aprovação não roda em paralelo/)
  assert.match(validate([{ approval: true }, { agent: 'a', parallel: true }], ok), /aprovação não roda em paralelo/)
})

test('step timeout in minutes, 15 by default', () => {
  assert.equal(timeoutMs({}), 15 * 60000)
  assert.equal(timeoutMs({ timeout: '2' }), 2 * 60000)
})

test('templates: input, previous summary and numbered steps', () => {
  const results = [{ summary: 'plano pronto' }, { summary: 'código feito' }]
  assert.equal(fill('Faça {{input}}', { input: 'login' }), 'Faça login')
  assert.equal(fill('Revise: {{prev}}', { results }), 'Revise: código feito')
  assert.equal(fill('{{step1}} / {{ step2 }} / {{step3}}', { results }), 'plano pronto / código feito / ')
  assert.equal(fill('{{prev}}', { results: [] }), '')
})

test('stop criterion is a case-insensitive substring of the summary', () => {
  assert.equal(shouldStop({ stopIf: 'falha' }, 'Testes: FALHA em 2'), true)
  assert.equal(shouldStop({ stopIf: 'falha' }, 'tudo ok'), false)
  assert.equal(shouldStop({ stopIf: '  ' }, 'qualquer'), false)
  assert.equal(shouldStop({}, 'qualquer'), false)
})

test('a stale "running" state becomes stopped', () => {
  assert.equal(settle({ state: 'running' }, false).state, 'stopped')
  assert.equal(settle({ state: 'running' }, true).state, 'running')
  assert.equal(settle({ state: 'done' }, false).state, 'done')
})
