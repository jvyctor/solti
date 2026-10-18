// The demo workspace end to end, with no AI CLI: open it from an empty canvas, run its pipeline, watch the reviewer
// reject and the run loop back to the dev, approve at the end. Works on Windows, macOS and Linux (part of test:smoke).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('demo: opens from the empty canvas, pipeline loops on the review and finishes after approval', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-demo-'))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'Main', nodes: [], edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ language: 'en' }))
  const app = await launch(prof)
  try {
    await app.until(`!!document.querySelector('.empty-actions')`, 'empty canvas')
    await app.ev(`[...document.querySelectorAll('.empty-actions button')].find(b => b.textContent === 'Try the demo').click()`)
    await app.until(`document.querySelectorAll('.react-flow__node').length === 6`, 'demo nodes')
    // Each simulated agent prints its banner from the boot command once its shell is up.
    await app.until(`[...document.querySelectorAll('.xterm-rows')].filter(e => /· demo/.test(e.textContent)).length === 4`, 'four demo agents ready', 240)
    await sleep(800)
    const pipe = `document.querySelector('.react-flow__node-pipeline')`
    await app.ev(`[...${pipe}.querySelectorAll('.diff-foot button')].find(b => b.textContent.includes('Run')).click()`)
    // dev ∥ tester → reviewer rejects → back to dev ∥ tester → reviewer approves → approval dialog.
    await app.until(`(document.querySelector('.dlg')?.textContent || '').includes('Ship it?')`, 'approval dialog', 400)
    assert.match(await app.ev(`document.querySelector('.dlg').textContent`), /APPROVED/)
    await app.ev(`[...document.querySelectorAll('.dlg button')].find(b => b.textContent === 'Allow').click()`)
    await app.until(`(${pipe}.textContent || '').includes('Pipeline finished')`, 'pipeline finished', 120)
    const text = await app.ev(`${pipe}.textContent`)
    assert.match(text, /Fixed: state checked/, 'the dev got the review and fixed it')
    assert.match(text, /×2/, 'steps ran twice (the loop)')
    // The run's Markdown report: every step with its summary.
    await app.ev(`${pipe}.querySelector('.pipe-runs').open = true`)
    await app.until(`!!${pipe}.querySelector('.pipe-run button[aria-label="Run report"]')`, 'report button', 40)
    await app.ev(`${pipe}.querySelector('.pipe-run button[aria-label="Run report"]').click()`)
    await app.until(`!!document.querySelector('.report-md')`, 'report dialog')
    const md = await app.ev(`document.querySelector('.report-md').textContent`)
    assert.match(md, /^# Pipeline “.+”: finished/)
    assert.match(md, /### 3\. reviewer ✓ \(×2\)/)
    assert.match(md, /### 4\. Human approval ✓/)
    await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(300)
    // Opening the demo again reuses the same workspace.
    await app.ev(`window.dispatchEvent(new Event('ac:demo'))`)
    await sleep(500)
    assert.equal(await app.ev(`document.querySelectorAll('.ws').length`), 2)
  } finally {
    app.close()
  }
})
