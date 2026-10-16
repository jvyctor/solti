import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fill, settle, shouldStop } from '../src/pipeline.js'

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
