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
