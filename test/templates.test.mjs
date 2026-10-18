// Workspace templates: built-ins are valid pipelines, saving strips machine data, using one remaps every id.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { builtinTemplates, checkTemplate, instantiate, toTemplate } from '../src/templates.js'
import { mergeImport, exportable } from '../src/workspaces.js'
import { validate } from '../src/pipeline.js'

let n = 0
const uid = (p) => `${p}${++n}`

test('every built-in template becomes a workspace whose pipelines are valid', () => {
  for (const t of builtinTemplates()) {
    const w = instantiate(t, uid)
    const ids = new Set(w.nodes.map((x) => x.id))
    assert.equal(ids.size, w.nodes.length, t.name)
    assert.ok(w.edges.every((e) => ids.has(e.source) && ids.has(e.target)), t.name)
    for (const p of w.nodes.filter((x) => x.type === 'pipeline')) {
      const agents = new Set(w.nodes.filter((x) => x.type === 'terminal').map((x) => x.id))
      assert.equal(validate(p.data.steps, (a) => agents.has(a)), '', `${t.name}: ${validate(p.data.steps, (a) => agents.has(a))}`)
    }
    assert.ok(w.nodes.filter((x) => x.data.maestro).length <= 1)
  }
})

const ws = {
  name: 'Meu time',
  nodes: [
    { id: 'a', type: 'terminal', position: { x: 100, y: 50 }, style: { width: 500, height: 300 }, data: { name: 'dev', preset: 'codex', instructions: 'faça', cwd: 'C:\\x', git: { branch: 'b' }, sid: 's1', lastDone: { summary: 'ok' } } },
    { id: 'p', type: 'pipeline', position: { x: 100, y: 400 }, style: { width: 500, height: 600 }, data: { name: 'F', input: 'x', steps: [{ agent: 'a', prompt: 'go', loopIf: '' }], results: [{ state: 'ok' }], runs: [{}], state: 'done' } },
    { id: 'z', type: 'unknown', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [{ id: 'e', source: 'a', target: 'p' }, { id: 'e2', source: 'a', target: 'gone' }],
}

test('saving a workspace keeps the setup and drops folders, conversations and run results', () => {
  const t = toTemplate(ws)
  checkTemplate(t)
  assert.equal(t.name, 'Meu time')
  assert.deepEqual(t.nodes.map((x) => x.id), ['a', 'p'])
  assert.deepEqual(t.nodes[0].data, { name: 'dev', preset: 'codex', instructions: 'faça' })
  assert.deepEqual(t.nodes[0].position, { x: 0, y: 0 })
  assert.deepEqual(Object.keys(t.nodes[1].data).sort(), ['input', 'name', 'steps'])
  assert.equal(t.edges.length, 1)
})

test('using a template gives fresh ids and points pipeline steps at the new agents', () => {
  const w = instantiate(toTemplate(ws), uid, new Set(['Meu time']))
  assert.equal(w.name, 'Meu time (2)')
  const agent = w.nodes.find((x) => x.type === 'terminal')
  assert.notEqual(agent.id, 'a')
  assert.equal(w.nodes.find((x) => x.type === 'pipeline').data.steps[0].agent, agent.id)
  assert.equal(w.edges[0].source, agent.id)
})

test('bad files are refused and unknown CLIs fall back to Claude Code', () => {
  assert.throws(() => checkTemplate({ format: 'other' }))
  assert.throws(() => checkTemplate({ format: 'solti-template', nodes: [], edges: [] }))
  const w = instantiate({ format: 'solti-template', name: 'x', nodes: [{ id: 'a', type: 'terminal', data: { name: 'a', preset: 'rm -rf', maestro: true } }, { id: 'b', type: 'terminal', data: { name: 'b', maestro: true } }], edges: [] }, uid)
  assert.equal(w.nodes[0].data.preset, 'claude')
  assert.deepEqual(w.nodes.map((x) => x.data.maestro), [true, false])
})

test('importing workspaces also remaps pipeline steps', () => {
  const { state } = mergeImport({ list: [] }, exportable({ list: [{ id: 'w', ...ws }] }), uid)
  const w = state.list[0]
  const agent = w.nodes.find((x) => x.type === 'terminal')
  assert.equal(w.nodes.find((x) => x.type === 'pipeline').data.steps[0].agent, agent.id)
})
