// A corrupt workspace.json must not wipe the user's work: the newest good backup is restored.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './helpers.mjs'

test('corrupt workspace.json -> restored from backup, corrupt file kept aside', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-restore-'))
  mkdirSync(join(prof, 'backups'))
  writeFileSync(join(prof, 'workspace.json'), '{ "list": [ broken')
  writeFileSync(join(prof, 'backups', 'workspace-1000.json'), JSON.stringify({ list: [{ id: 'w1', name: 'RESTAURADO', nodes: [], edges: [] }], active: 'w1' }))
  const app = await launch(prof, 9420)
  try {
    await app.until(`document.querySelector('.ws-name')?.textContent === 'RESTAURADO'`, 'restored workspace in the sidebar')
    assert.ok(readdirSync(prof).some((f) => f.startsWith('workspace.corrupt-')), 'corrupt file kept')
  } finally {
    app.close()
  }
})
