// A saved pipeline drives two agents (plain shells here, whose "prompt" is a canvas done command):
// each step waits for canvas_done, the next one gets the summary; a stop criterion ends the run early.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './helpers.mjs'

test('pipeline: steps chain through canvas_done; stopIf ends it', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-pipe-'))
  const term = (id, name, x) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 520, height: 220 }, data: { name, preset: 'shell' } })
  const pipe = (id, y, steps) => ({ id, type: 'pipeline', position: { x: 0, y }, style: { width: 420, height: 480 }, data: { input: 'login', hint: false, steps } })
  const nodes = [
    term('a', 'dev', 500), term('b', 'rev', 1100),
    pipe('p1', 300, [{ agent: 'a', prompt: 'canvas done "feito-A {{input}}"' }, { agent: 'b', prompt: 'canvas done "viu {{prev}}"' }]),
    pipe('p2', 900, [{ agent: 'a', prompt: 'canvas done "FALHA no build"', stopIf: 'falha' }, { agent: 'b', prompt: 'canvas done "nunca roda"' }]),
  ]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9440)
  try {
    await app.until(`document.querySelectorAll('.xterm-rows').length === 2 && [...document.querySelectorAll('.xterm-rows')].every(e => /PS [A-Z]:/.test(e.textContent))`, 'both shells ready', 160)
    await new Promise((r) => setTimeout(r, 1500))
    const runBtn = (n) => app.ev(`[...document.querySelectorAll('.react-flow__node[data-id="${n}"] .diff-foot button')].find(b => b.textContent.includes('Executar'))?.click()`)
    const text = (n) => `(document.querySelector('.react-flow__node[data-id="${n}"]')?.textContent || '')`

    await runBtn('p1')
    await app.until(`${text('p1')}.includes('Fluxo concluído')`, 'pipeline 1 done', 120)
    const t1 = await app.ev(text('p1'))
    assert.match(t1, /feito-A login/)
    assert.match(t1, /viu feito-A login/)

    await runBtn('p2')
    await app.until(`${text('p2')}.includes('Parou')`, 'pipeline 2 stopped by criterion', 120)
    const t2 = await app.ev(text('p2'))
    assert.match(t2, /FALHA no build/)
    assert.doesNotMatch(t2, /nunca roda\s*$/)
    assert.equal(await app.ev(`document.querySelectorAll('.react-flow__node[data-id="p2"] .pipe-sum').length`), 1) // only step 1 produced a summary
  } finally {
    app.close()
  }
})
