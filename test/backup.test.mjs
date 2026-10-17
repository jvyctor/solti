import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { exportable, mergeImport } from '../src/workspaces.js'

const b = createRequire(import.meta.url)('../electron/backup.cjs')
const good = (n) => JSON.stringify({ list: [{ id: 'w', name: n, nodes: [], edges: [] }], active: 'w' })

test('rotate: one backup per interval, keeps the newest 20, ignores a corrupt current file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-bk-'))
  const file = join(dir, 'workspace.json')
  writeFileSync(file, good('a'))
  b.rotate(file, 1000)
  b.rotate(file, 1000 + 60 * 1000) // too soon
  assert.equal(readdirSync(join(dir, 'backups')).length, 1)
  for (let i = 1; i <= 25; i++) b.rotate(file, 1000 + i * 11 * 60 * 1000)
  assert.equal(readdirSync(join(dir, 'backups')).length, 20)
  writeFileSync(file, '{ broken')
  b.rotate(file, 9e12)
  assert.ok(!existsSync(join(dir, 'backups', 'workspace-9000000000000.json')))
})

test('restore points: named, listed newest first, loaded by id, capped at 30, ids validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-pt-'))
  const file = join(dir, 'workspace.json')
  const data = (n) => ({ list: [{ id: 'w', name: n, nodes: [{ id: 'a' }, { id: 'b' }], edges: [] }], active: 'w' })
  const id1 = b.pointCreate(file, 'Antes do fluxo', data('um'), 1000)
  const id2 = b.pointCreate(file, 'Manual', data('dois'), 1000) // same millisecond: still a separate point
  assert.notEqual(id1, id2)
  const list = b.pointList(file)
  assert.deepEqual(list.map((p) => p.label), ['Manual', 'Antes do fluxo'])
  assert.equal(list[0].nodes, 2)
  assert.equal(b.pointLoad(file, id1).list[0].name, 'um')
  assert.throws(() => b.pointLoad(file, '../workspace'), /bad id/)
  assert.throws(() => b.pointCreate(file, 'x', { nope: 1 }), /invalid/)
  for (let i = 0; i < 35; i++) b.pointCreate(file, `p${i}`, data('x'), 2000 + i)
  assert.equal(b.pointList(file).length, 30)
  assert.equal(b.pointList(file)[0].label, 'p34')
  assert.equal(b.restore(file), null, 'restore points are not rolling backups')
})

test('restore picks the newest valid backup; writeAtomic leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-bk-'))
  const file = join(dir, 'workspace.json')
  b.writeAtomic(file, good('one'))
  assert.ok(!existsSync(file + '.tmp'))
  b.rotate(file, 1000)
  b.writeAtomic(file, good('two'))
  b.rotate(file, 1000 + 11 * 60 * 1000)
  writeFileSync(join(dir, 'backups', 'workspace-9999999999999.json'), '{ corrupt') // newest, but unusable
  assert.equal(b.restore(file).data.list[0].name, 'two')
  assert.equal(b.restore(join(mkdtempSync(join(tmpdir(), 'ac-bk-')), 'workspace.json')), null)
})

test('import: new ids, unique names, fresh terminals, dangling edges dropped; rejects foreign files', () => {
  let n = 0
  const uid = (p) => p + 'imp' + ++n
  const state = { list: [{ id: 'w1', name: 'SAT', nodes: [{ id: 'n1' }], edges: [] }], active: 'w1' }
  const term = { id: 'n1', type: 'terminal', data: { name: 'x', sid: 's', ran: true, git: { branch: 'b' }, cwd: 'C:\\p' } }
  const file = exportable({ list: [{ id: 'old', name: 'SAT', locked: true, nodes: [term, { id: 'n2', type: 'note', data: {} }], edges: [{ id: 'e', source: 'n1', target: 'n2' }, { id: 'bad', source: 'n1', target: 'ghost' }] }] })
  const { state: s, added } = mergeImport(state, file, uid)
  assert.equal(added, 1)
  const w = s.list[1]
  assert.equal(w.name, 'SAT (2)')
  assert.equal(w.locked, false)
  assert.notEqual(w.nodes[0].id, 'n1')
  assert.deepEqual(w.nodes[0].data, { name: 'x', cwd: 'C:\\p' })
  assert.equal(w.edges.length, 1)
  assert.deepEqual([w.edges[0].source, w.edges[0].target], [w.nodes[0].id, w.nodes[1].id])
  assert.throws(() => mergeImport(state, { hello: 1 }, uid), /exportação/)
})
