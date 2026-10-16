import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { claudeTokens } = createRequire(import.meta.url)('../electron/agentusage.cjs')
const sid = '11111111-2222-3333-4444-555555555555'

test('sums usage per message, counting streamed duplicates once, ignoring cache reads', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  mkdirSync(join(base, 'C--proj'))
  const msg = (id, i, c, o) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: i, cache_creation_input_tokens: c, cache_read_input_tokens: 99999, output_tokens: o } } })
  writeFileSync(join(base, 'C--proj', sid + '.jsonl'), [msg('a', 2, 100, 5), msg('a', 2, 100, 50), msg('b', 3, 0, 7), '{"type":"user"}', 'not json "usage"'].join('\n'))
  assert.deepEqual(claudeTokens(sid, base), { tokens: 2 + 100 + 50 + 3 + 7 })
})

test('unknown or malformed ids give zero and never touch the path', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  assert.deepEqual(claudeTokens(sid, base), { tokens: 0 })
  assert.deepEqual(claudeTokens('../../etc/passwd', base), { tokens: 0 })
})
