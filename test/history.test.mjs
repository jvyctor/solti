import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applySnapshot, createHistory, snapshot } from '../src/history.js'

const node = (id, x, data = {}) => ({ id, type: 'note', position: { x, y: 0 }, data })
const ws = (nodes, edges = []) => ({ nodes, edges })

test('undo / redo walk through snapshots; a new change clears redo', () => {
  const h = createHistory()
  h.reset(snapshot(ws([node('a', 0)])))
  h.push(snapshot(ws([node('a', 0), node('b', 10)])))
  h.push(snapshot(ws([node('a', 0), node('b', 10), node('c', 20)])))
  assert.equal(h.undo().nodes.length, 2)
  assert.equal(h.undo().nodes.length, 1)
  assert.equal(h.undo(), null)
  assert.equal(h.redo().nodes.length, 2)
  h.push(snapshot(ws([node('z', 0)])))
  assert.equal(h.redo(), null)
})

test('selection, measured size and runtime data do not create history entries', () => {
  const h = createHistory()
  h.reset(snapshot(ws([node('a', 0)])))
  assert.equal(h.push(snapshot(ws([{ ...node('a', 0), selected: true, measured: { width: 5 } }]))), false)
  assert.equal(h.push(snapshot(ws([node('a', 0, { sid: 'x', ran: true })]))), false)
  assert.equal(h.push(snapshot(ws([node('a', 5)]))), true)
})

test('limit keeps the newest entries', () => {
  const h = createHistory(3)
  h.reset(snapshot(ws([node('a', 0)])))
  for (let i = 1; i <= 10; i++) h.push(snapshot(ws([node('a', i)])))
  let n = 0
  while (h.undo()) n++
  assert.equal(n, 3)
})

test('applySnapshot keeps the conversation of nodes still on the canvas', () => {
  const snap = snapshot(ws([node('a', 0, { text: 'old', sid: 'OLD' })]))
  const out = applySnapshot(snap, [node('a', 99, { text: 'new', sid: 'LIVE', ran: true })])
  assert.equal(out.nodes[0].data.text, 'old')
  assert.equal(out.nodes[0].data.sid, 'LIVE')
  assert.equal(out.nodes[0].data.ran, true)
  assert.equal(applySnapshot(snap, []).nodes[0].data.sid, 'OLD') // deleted node comes back with its saved id
})
