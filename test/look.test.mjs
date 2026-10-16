// Per-terminal look: the node's own colours override the global ones, and the dialog changes them live for that terminal only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

const term = (id, name, x, look) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 520, height: 260 }, data: { name, preset: 'shell', ...(look ? { look } : {}) } })

test('per-terminal colours: saved look applies, dialog edits only that terminal', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-look-'))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [term('a', 'primeiro', 0, { termBg: '#112233' }), term('b', 'segundo', 600)], edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9530)
  try {
    const bg = (id) => app.ev(`getComputedStyle(document.querySelector('.react-flow__node[data-id="${id}"] .tbody')).backgroundColor`)
    await app.until(`!!document.querySelector('.react-flow__node[data-id="b"] .tbody')`, 'terminals shown')
    assert.equal(await bg('a'), 'rgb(17, 34, 51)')
    assert.notEqual(await bg('b'), 'rgb(17, 34, 51)')

    await sleep(1000) // let the layout settle before measuring where to click
    // right-click the second terminal's footer, choose Aparência…
    const p = await app.ev(`(() => { const r = document.querySelector('.react-flow__node[data-id="b"] .tfoot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await app.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'right', clickCount: 1 })
    await app.until(`[...document.querySelectorAll('.mi')].some(e => e.textContent.startsWith('Aparência'))`, 'node menu')
    const m = await app.ev(`(() => { const e = [...document.querySelectorAll('.mi')].find(e => e.textContent.startsWith('Aparência')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y })
    for (const type of ['mousePressed', 'mouseReleased']) await app.send('Input.dispatchMouseEvent', { type, x: m.x, y: m.y, button: 'left', clickCount: 1 })
    await app.until(`(document.querySelector('.dlg')?.textContent || '').includes('Aparência de')`, 'look dialog')

    // pick the Nord scheme (React-controlled select: native setter + change event)
    await app.ev(`(() => { const s = document.querySelector('.dlg select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'nord'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await app.until(`getComputedStyle(document.querySelector('.react-flow__node[data-id="b"] .tbody')).backgroundColor === 'rgb(46, 52, 64)'`, 'nord applied to the second terminal')
    assert.equal(await bg('a'), 'rgb(17, 34, 51)', 'the first terminal is untouched')
    await sleep(900)
    const saved = await app.ev(`window.api.load().then((s) => s.list[0].nodes.find((n) => n.id === 'b').data.look)`)
    assert.equal(saved.termScheme, 'nord')
  } finally {
    app.close()
  }
})
