// Ctrl+K palette (workspace, terminal, output search), group drag carrying its nodes, file tree auto refresh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

const term = (id, name, x = 0) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 600, height: 260 }, data: { name, preset: 'shell' } })

test('palette: jump by name and by what a terminal printed', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-pal-'))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [
    { id: 'w1', name: 'Dois', nodes: [term('t2', 'alpha')], edges: [] },
    { id: 'w2', name: 'Um', nodes: [term('t1', 'beta')], edges: [] },
  ], active: 'w1' }))
  const app = await launch(prof, 9430)
  try {
    await app.ready()
    await app.run('t2', 'echo CODIGO-ZETA-42', prof) // prints in alpha, in the first workspace
    await app.ev(`[...document.querySelectorAll('.ws')].find(e => e.textContent.includes('Um')).click()`) // leave it
    await app.until(`document.querySelector('.ws.active')?.textContent.includes('Um')`, 'switched to Um')
    const key = (k, mods = 0, type = 'rawKeyDown') => app.send('Input.dispatchKeyEvent', { type, key: k, code: k === 'Enter' ? 'Enter' : 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0), modifiers: mods })

    await key('k', 2); await key('k', 2, 'keyUp') // Ctrl+K
    await app.until(`!!document.querySelector('.palette')`, 'palette open')
    await app.send('Input.insertText', { text: 'CODIGO-ZETA' })
    await app.until(`document.querySelector('.palette')?.textContent.includes('saída de alpha')`, 'output hit')
    await key('Enter'); await key('Enter', 0, 'keyUp')
    await app.until(`document.querySelector('.ws.active')?.textContent.includes('Dois')`, 'jumped to the workspace of the hit')
    assert.equal(await app.ev(`!!document.querySelector('.palette')`), false)

    await key('k', 2); await key('k', 2, 'keyUp')
    await app.until(`!!document.querySelector('.palette')`, 'palette reopened')
    await app.send('Input.insertText', { text: 'beta' })
    await app.until(`document.querySelector('.palette li.on')?.textContent.includes('beta')`, 'terminal by name')
    await key('Enter'); await key('Enter', 0, 'keyUp')
    await app.until(`document.querySelector('.ws.active')?.textContent.includes('Um')`, 'jumped to beta')
  } finally {
    app.close()
  }
})

test('group drag carries the nodes inside it, not the ones outside', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-grp-'))
  const nodes = [
    { id: 'g1', type: 'group', position: { x: 0, y: 0 }, style: { width: 600, height: 400 }, zIndex: -1, data: { name: 'G' } },
    { id: 'in', type: 'note', position: { x: 100, y: 100 }, style: { width: 200, height: 120 }, data: { text: 'dentro' } },
    { id: 'out', type: 'note', position: { x: 800, y: 100 }, style: { width: 200, height: 120 }, data: { text: 'fora' } },
  ]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9431)
  try {
    await app.until(`document.querySelectorAll('.react-flow__node').length === 3`, 'nodes shown')
    await sleep(600)
    const rect = (id) => app.ev(`(() => { const r = document.querySelector('.react-flow__node[data-id="${id}"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
    const g = await rect('g1'), inn = await rect('in'), out = await rect('out')
    const from = { x: g.x + g.w * 0.92, y: g.y + g.h * 0.92 } // empty corner of the group frame
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
    await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 })
    for (let s = 1; s <= 10; s++) await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + 15 * s, y: from.y + 10 * s, buttons: 1 })
    await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + 150, y: from.y + 100, button: 'left', clickCount: 1 })
    await sleep(500)
    const g2 = await rect('g1'), in2 = await rect('in'), out2 = await rect('out')
    assert.ok(g2.x - g.x > 100, 'group moved')
    assert.ok(Math.abs(in2.x - inn.x - (g2.x - g.x)) < 3 && Math.abs(in2.y - inn.y - (g2.y - g.y)) < 3, 'inner note moved with it')
    assert.ok(Math.abs(out2.x - out.x) < 1 && Math.abs(out2.y - out.y) < 1, 'outer note stayed')
  } finally {
    app.close()
  }
})

test('file tree picks up new files without reopening', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-ft-'))
  const folder = join(root, 'proj')
  mkdirSync(folder)
  writeFileSync(join(folder, 'um.txt'), '1')
  const prof = join(root, 'profile')
  mkdirSync(prof)
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [{ id: 'f1', type: 'files', position: { x: 0, y: 0 }, style: { width: 300, height: 260 }, data: { path: folder } }], edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9432)
  try {
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: true }) // the refresh only runs while the window is focused
    await app.until(`document.querySelector('.ftree')?.textContent.includes('um.txt')`, 'initial listing')
    writeFileSync(join(folder, 'dois.txt'), '2')
    await app.until(`document.querySelector('.ftree')?.textContent.includes('dois.txt')`, 'auto refresh', 60)
  } finally {
    app.close()
  }
})
