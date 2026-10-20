import { test } from 'node:test'
import assert from 'node:assert/strict'
import { excerpt, searchNodes } from '../src/search.js'
import { agentsOverBudget } from '../src/budget.js'

const state = { list: [
  { id: 'w1', name: 'App', nodes: [
    { id: 'n1', type: 'note', data: { title: 'dev', text: 'A migração do banco falhou no passo 3' } },
    { id: 'p1', type: 'pipeline', data: { name: 'Release', input: 'publicar', steps: [{ prompt: 'rode os testes' }], runs: [{ t: 1, report: '# Relatório\nO deploy passou em produção' }] } },
    { id: 't1', type: 'terminal', data: { name: 'dev' } },
  ] },
  { id: 'w2', name: 'Site', nodes: [{ id: 'k1', type: 'knowledge', data: { text: 'Stack: Next.js e Postgres' } }] },
] }

test('search finds notes, pipeline steps, run reports and knowledge across workspaces', () => {
  assert.deepEqual(searchNodes(state, 'migração').map((h) => [h.kind, h.nodeId]), [['note', 'n1']])
  assert.deepEqual(searchNodes(state, 'TESTES').map((h) => h.kind), ['pipeline'])
  assert.deepEqual(searchNodes(state, 'deploy').map((h) => [h.kind, h.nodeId]), [['report', 'p1']])
  assert.deepEqual(searchNodes(state, 'postgres').map((h) => [h.wsName, h.kind]), [['Site', 'knowledge']])
  assert.deepEqual(searchNodes(state, 'x'), [], 'too short')
})

test('excerpt keeps the match in view and marks the cut', () => {
  const long = 'a'.repeat(200) + ' alvo ' + 'b'.repeat(200)
  const e = excerpt(long, 'alvo')
  assert.ok(e.includes('alvo') && e.startsWith('…') && e.endsWith('…') && e.length < 160)
})

test('per-agent budget: only agents with a budget that spent it are over', () => {
  const st = { list: [{ id: 'w', nodes: [
    { id: 'a', type: 'terminal', data: { budget: '2' } },
    { id: 'b', type: 'terminal', data: { budget: '' } },
    { id: 'c', type: 'terminal', data: { budget: '5' } },
    { id: 'd', type: 'note', data: { budget: '1' } },
  ] }] }
  assert.deepEqual(agentsOverBudget(st, { a: { cost: 2.01 }, b: { cost: 99 }, c: { cost: 4.9 }, d: { cost: 9 } }), ['a'])
  assert.deepEqual(agentsOverBudget(st, {}), [])
})
