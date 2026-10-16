// An agent drives a Portal: type, click, read the result, screenshot; non-http URLs are refused.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('canvas portal: type, click, read, screenshot, refuse javascript:', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-pc-'))
  const prof = join(root, 'profile')
  mkdirSync(prof)
  const html = '<title>Form</title><input id=q><button id=b onclick="out.textContent=\'enviado:\'+q.value">Enviar</button><p id=out></p>'
  const nodes = [
    { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 700, height: 260 }, data: { name: 'ag', preset: 'shell' } },
    { id: 'p1', type: 'portal', position: { x: 760, y: 0 }, style: { width: 500, height: 360 }, data: { url: 'data:text/html,' + encodeURIComponent(html) } },
  ]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [{ id: 'e1', source: 't1', target: 'p1', type: 'floating' }] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ approval: 'off' }))
  const app = await launch(prof, 9400)
  try {
    await app.ready()
    await app.run('t1', "canvas portal portal-p1 type '#q' ola-mundo", root)
    await app.run('t1', "canvas portal portal-p1 click '#b'", root)
    assert.match(await app.run('t1', 'canvas read portal-p1', root), /enviado:ola-mundo/)

    const shot = await app.run('t1', 'canvas portal portal-p1 screenshot', root)
    const path = shot.match(/screenshot: (.+)/)?.[1].trim()
    assert.ok(path && existsSync(path), 'screenshot file: ' + shot)
    assert.equal(readFileSync(path).subarray(1, 4).toString(), 'PNG')

    assert.match(await app.run('t1', 'canvas portal portal-p1 go javascript:alert(1)', root), /http/)
  } finally {
    app.close()
  }
})
