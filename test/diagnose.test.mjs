import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { diagnose } = createRequire(import.meta.url)('../electron/diagnose.cjs')

test('reads installed / login / MCP state of each CLI from its own files', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-diag-'))
  const w = (rel, body) => { const f = join(home, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, body) }
  w('.claude/.credentials.json', '{}')
  w('.claude.json', JSON.stringify({ mcpServers: { canvas: {} } }))
  w('.codex/auth.json', '{}')
  w('.codex/config.toml', '[mcp_servers.other]\n') // codex logged in, canvas MCP missing
  w('.gemini/settings.json', JSON.stringify({ mcpServers: { canvas: {} } })) // gemini MCP ok, not logged in
  const installed = new Set(['claude', 'codex', 'gemini'])
  const r = Object.fromEntries((await diagnose({
    home, env: {}, commands: { codex: 'codex' },
    which: async (b) => installed.has(b),
    run: async (c) => (c.endsWith('--version') ? `${c.split(' ')[0]} 1.2.3\nextra` : ''),
  })).map((x) => [x.id, x]))
  assert.deepEqual([r.claude.installed, r.claude.authenticated, r.claude.mcp, r.claude.version], [true, true, true, 'claude 1.2.3'])
  assert.deepEqual([r.codex.installed, r.codex.authenticated, r.codex.mcp], [true, true, false])
  assert.deepEqual([r.gemini.installed, r.gemini.authenticated, r.gemini.mcp], [true, false, true])
  assert.deepEqual([r.antigravity.installed, r.antigravity.authenticated, r.antigravity.mcp], [false, null, null]) // not installed: nothing to judge
  assert.equal(r.opencode.installed, false)
})

test('API keys count as logged in; a customised command is the one checked', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-diag-'))
  const seen = []
  const r = await diagnose({ home, env: { GEMINI_API_KEY: 'k' }, commands: { gemini: 'mygemini --flag' }, which: async (b) => { seen.push(b); return b === 'mygemini' }, run: async () => '' })
  assert.ok(seen.includes('mygemini'))
  assert.equal(r.find((x) => x.id === 'gemini').authenticated, true)
})
