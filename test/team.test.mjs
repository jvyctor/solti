// Empty canvas offers "Criar um time"; one click builds the dev team, roped to the maestro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './helpers.mjs'

test('empty canvas -> team of four, one maestro, three ropes', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-team-'))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ sendBriefing: false, commands: { claude: 'echo C', codex: 'echo X', gemini: 'echo G' } }))
  const app = await launch(prof, 9510)
  try {
    await app.until(`!!document.querySelector('.empty-canvas')`, 'empty-state card')
    await app.ev(`[...document.querySelectorAll('.empty-actions button')].find(b => b.textContent.includes('time')).click()`)
    await app.until(`!!document.querySelector('.team-list')`, 'team dialog')
    await app.ev(`[...document.querySelectorAll('.dlg-actions button')].find(b => b.textContent.includes('Criar time')).click()`)
    await app.until(`document.querySelectorAll('.react-flow__node').length === 4`, 'four terminals')
    assert.equal(await app.ev(`document.querySelector('.empty-canvas') === null`), true)
    assert.equal(await app.ev(`document.querySelectorAll('.rolepill.maestro').length`), 1)
    await app.until(`window.api.load().then((s) => s.list[0].edges.length === 3)`, 'three ropes saved') // ropes are drawn only once nodes are measured; the saved graph is the reliable check
    const saved = await app.ev(`window.api.load().then((s) => s.list[0])`)
    const maestro = saved.nodes.find((x) => x.data.maestro)
    assert.ok(saved.edges.every((e) => e.source === maestro.id), 'every rope starts at the maestro')
    const names = await app.ev(`[...document.querySelectorAll('.thead input')].map(i => i.value).sort().join(',')`)
    assert.equal(names, 'dev,maestro,revisor,testador')
  } finally {
    app.close()
  }
})
