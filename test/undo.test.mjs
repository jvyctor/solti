// Delete a note with the keyboard, undo with Ctrl+Z, redo with Ctrl+Shift+Z.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('undo and redo a deleted note', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-undo-'))
  const note = { id: 'n1', type: 'note', position: { x: 300, y: 200 }, style: { width: 240, height: 160 }, data: { title: 'T', text: 'conteudo' } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [note], edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9421)
  try {
    const count = () => app.ev(`document.querySelectorAll('.react-flow__node').length`)
    const key = async (k, mods = 0) => {
      const ev = { key: k, code: k === 'Delete' ? 'Delete' : 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k === 'Delete' ? 46 : k.toUpperCase().charCodeAt(0), modifiers: mods }
      await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev })
      await app.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev })
    }
    await app.until(`document.querySelectorAll('.react-flow__node').length === 1`, 'note shown')
    await sleep(800) // history baseline
    // select the note by clicking its body (not the title input), then Delete
    const p = await app.ev(`(() => { const r = document.querySelector('.note-body').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    for (const type of ['mousePressed', 'mouseReleased']) await app.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await sleep(300)
    await key('Delete')
    await app.until(`document.querySelectorAll('.react-flow__node').length === 0`, 'note deleted')
    await sleep(900) // let the debounce record the deletion
    await key('z', 2) // Ctrl
    await app.until(`document.querySelectorAll('.react-flow__node').length === 1`, 'undo brought the note back')
    assert.equal(await app.ev(`document.querySelector('.note-body')?.textContent.includes('conteudo')`), true)
    await key('z', 2 | 8) // Ctrl+Shift
    await app.until(`document.querySelectorAll('.react-flow__node').length === 0`, 'redo deleted it again')
    assert.equal(await count(), 0)
  } finally {
    app.close()
  }
})
