// With approval on, a maestro's canvas spawn waits for the user: Negar blocks it, Permitir creates the agent; both are logged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('spawn needs approval: deny then allow', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-ap-'))
  const prof = join(root, 'profile')
  mkdirSync(prof)
  const t1 = { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 700, height: 260 }, data: { name: 'maestro1', preset: 'shell', maestro: true } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [t1], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ approval: 'spawn' }))
  const app = await launch(prof, 9401)
  try {
    await app.ready()
    const click = (label) => app.ev(`[...document.querySelectorAll('.dlg button')].find(b => b.textContent === ${JSON.stringify(label)})?.click()`)
    const dialog = `document.querySelector('.dlg')?.textContent.includes('quer criar o agente')`

    const denied = app.run('t1', 'canvas spawn helper1 shell', root)
    await app.until(dialog, 'approval dialog')
    await click('Negar')
    assert.match(await denied, /denied by the user/)
    assert.equal(await app.ev(`document.querySelectorAll('.tfoot').length`), 1)

    const allowed = app.run('t1', 'canvas spawn helper2 shell', root)
    await app.until(dialog, 'second approval dialog')
    await click('Permitir')
    assert.match(await allowed, /created: helper2/)
    await app.until(`document.querySelectorAll('.tfoot').length === 2`, 'agent created')

    await app.ev(`document.querySelector('[aria-label="Atividade dos agentes"]').click()`)
    await app.until(`document.querySelector('.activity')?.textContent.includes('negado por você')`, 'denial in the timeline')
    assert.match(await app.ev(`document.querySelector('.activity').textContent`), /helper2/)
  } finally {
    app.close()
  }
})
