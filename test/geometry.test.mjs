import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kidsInside } from '../src/geometry.js'

const n = (id, x, y, w = 100, h = 100, type = 'note') => ({ id, type, position: { x, y }, style: { width: w, height: h } })

test('nodes whose centre is inside the group move with it; others and other groups do not', () => {
  const g = n('g', 0, 0, 500, 400, 'group')
  const nodes = [g, n('in', 50, 50), n('edge', 460, 100), n('out', 600, 0), n('other', 10, 10, 50, 50, 'group'), n('measured', 380, 300)]
  nodes[5].measured = { width: 100, height: 100 }
  assert.deepEqual(kidsInside(g, nodes).map((k) => k.id), ['in', 'measured'])
})

import { arrange } from '../src/geometry.js'

test('align moves every node to the same edge or centre', () => {
  const nodes = [n('a', 0, 0, 100, 50), n('b', 40, 80, 200, 100), n('c', 300, 20, 50, 50)]
  assert.deepEqual([...arrange(nodes, 'left')].map(([id, p]) => [id, p.x]), [['b', 0], ['c', 0]])
  assert.deepEqual([...arrange(nodes, 'right')].map(([id, p]) => [id, p.x]), [['a', 250], ['b', 150]])
  assert.equal(arrange(nodes, 'top').get('b').y, 0)
  assert.equal(arrange(nodes, 'vcenter').get('a').y, 65)
})

test('distribute leaves equal gaps and keeps the outer nodes in place', () => {
  const nodes = [n('a', 0, 0, 100, 100), n('b', 120, 0, 100, 100), n('c', 500, 0, 100, 100)]
  const m = arrange(nodes, 'hspace')
  assert.equal(m.has('a'), false)
  assert.equal(m.has('c'), false)
  assert.equal(m.get('b').x, 250)
  assert.equal(arrange(nodes.slice(0, 2), 'hspace').size, 0, 'needs three nodes')
  assert.equal(arrange(nodes.slice(0, 1), 'left').size, 0)
})
