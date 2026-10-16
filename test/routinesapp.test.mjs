// A one-off routine fires on its own and types into the agent; a pipeline keeps running while another workspace is open.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

const term = (id, name, x = 0) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 600, height: 240 }, data: { name, preset: 'shell' } })

test('routine fires by itself and a pipeline survives switching workspace', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-rt-'))
  const out = join(prof, 'routine.txt')
  const pipe = { id: 'p1', type: 'pipeline', position: { x: 0, y: 300 }, style: { width: 420, height: 480 }, data: { hint: false, input: 'x', steps: [{ agent: 'a', prompt: 'Start-Sleep 4; canvas done "passo-lento"' }] } }
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [
    { id: 'w1', name: 'Um', nodes: [term('a', 'dev'), pipe], edges: [] },
    { id: 'w2', name: 'Dois', nodes: [], edges: [] },
  ], active: 'w1' }))
  const app = await launch(prof, 9500)
  try {
    await app.ready()
    // routine: once, already due -> the scheduler tick types the command into the agent
    await app.ev(`window.api.routinesSave([{ id: 'r1', name: 'teste', target: { type: 'agent', id: 'a' }, prompt: ${JSON.stringify(`'viaRotina' | Out-File -Encoding ascii '${out}'`)}, schedule: { kind: 'once', at: Date.now() - 1000 } }])`)
    for (let i = 0; i < 60 && !existsSync(out); i++) await sleep(500)
    assert.match(readFileSync(out, 'utf8'), /viaRotina/)
    const r = (await app.ev(`window.api.routinesList()`))[0]
    assert.match(r.lastResult, /^ok: enviado a dev/)
    assert.ok(r.lastRun > 0)

    // pipeline: start, leave the workspace while the agent is still sleeping, come back to a finished run
    await app.ev(`[...document.querySelectorAll('.diff-foot button')].find(b => b.textContent.includes('Executar')).click()`)
    await sleep(600)
    await app.ev(`[...document.querySelectorAll('.ws')].find(e => e.textContent.includes('Dois')).click()`)
    await sleep(6500)
    await app.ev(`[...document.querySelectorAll('.ws')].find(e => e.textContent.includes('Um')).click()`)
    await app.until(`(document.querySelector('.react-flow__node[data-id="p1"]')?.textContent || '').includes('Fluxo concluído')`, 'pipeline finished while away', 60)
    assert.match(await app.ev(`document.querySelector('.react-flow__node[data-id="p1"]').textContent`), /passo-lento/)
  } finally {
    app.close()
  }
})
