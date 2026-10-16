// First run: the welcome shows the agent diagnostics once; the Diagnóstico tab lists every CLI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './helpers.mjs'

test('welcome appears on first run, lists the five agents, and is not shown again', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-diag-'))
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes: [], edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9520, { onboarded: false })
  try {
    await app.until(`(document.querySelector('.dlg')?.textContent || '').includes('Bem-vindo')`, 'welcome dialog')
    await app.until(`document.querySelectorAll('.diag-row').length === 5`, 'five agents listed', 120)
    const rows = await app.ev(`[...document.querySelectorAll('.diag-row b')].map(b => b.textContent).join(',')`)
    assert.equal(rows, 'Claude Code,Codex,Gemini,Antigravity,OpenCode')
    const diag = await app.ev(`window.api.diagRun()`)
    for (const r of diag) assert.equal(typeof r.installed, 'boolean', r.id)
    await app.ev(`[...document.querySelectorAll('.dlg-actions button')].find(b => b.textContent.includes('vazio')).click()`)
    await app.until(`!document.querySelector('.dlg')`, 'welcome closed')
    assert.equal((await app.ev(`window.api.settingsGet()`)).onboarded, true)
  } finally {
    app.close()
  }
})
