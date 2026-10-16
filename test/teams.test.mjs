import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEAMS, teamNodes } from '../src/teams.js'

let n = 0
const uid = (p) => p + ++n

test('every team has exactly one maestro first, and each specialist is roped to it', () => {
  for (const [id, t] of Object.entries(TEAMS)) {
    assert.equal(t.members.filter((m) => m.maestro).length, 1, id)
    assert.equal(t.members[0].maestro, true, id)
    const { nodes, edges } = teamNodes(id, { uid })
    assert.equal(nodes.length, t.members.length)
    assert.equal(edges.length, nodes.length - 1)
    assert.ok(edges.every((e) => e.source === nodes[0].id && nodes.some((x) => x.id === e.target)))
    assert.ok(nodes.every((x) => x.data.instructions.length > 20), 'role instructions present')
  }
})

test('presets override, names stay unique against the workspace, worktrees go to the right member', () => {
  const where = { dev: { cwd: 'C:\wt\dev', git: { branch: 'canvas/dev', worktree: true } } }
  const { nodes } = teamNodes('dev', { uid, presets: { dev: 'gemini' }, taken: new Set(['maestro', 'dev']), where })
  const by = Object.fromEntries(nodes.map((x) => [x.data.name, x]))
  assert.ok(by['maestro-2'] && by['dev-2'] && by.revisor && by.testador)
  assert.equal(by['dev-2'].data.preset, 'gemini')
  assert.equal(by['dev-2'].data.cwd, 'C:\wt\dev')
  assert.equal(by['dev-2'].data.git.worktree, true)
  assert.equal(by['maestro-2'].data.cwd, undefined)
})
