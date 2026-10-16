import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { agentTokens, claudeTokens, codexTokens, geminiTokens } = createRequire(import.meta.url)('../electron/agentusage.cjs')
const sid = '11111111-2222-3333-4444-555555555555'
const NL = '\n'

test('sums usage per message, counting streamed duplicates once, ignoring cache reads', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  mkdirSync(join(base, 'C--proj'))
  const msg = (id, i, c, o) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: i, cache_creation_input_tokens: c, cache_read_input_tokens: 99999, output_tokens: o } } })
  writeFileSync(join(base, 'C--proj', sid + '.jsonl'), [msg('a', 2, 100, 5), msg('a', 2, 100, 50), msg('b', 3, 0, 7), '{"type":"user"}', 'not json "usage"'].join(NL))
  assert.deepEqual(claudeTokens(sid, base), { tokens: 2 + 100 + 50 + 3 + 7 })
})

test('unknown or malformed ids give zero and never touch the path', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  assert.deepEqual(claudeTokens(sid, base), { tokens: 0 })
  assert.deepEqual(claudeTokens('../../etc/passwd', base), { tokens: 0 })
})

test('gemini: matched by the canvas id in the file name; cached input and duplicates are not counted', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-gem-'))
  mkdirSync(join(base, 'proj', 'chats'), { recursive: true })
  const line = (id, input, cached, output, thoughts = 0) => JSON.stringify({ id, tokens: { input, cached, output, thoughts, tool: 0, total: input + output + thoughts } })
  const rows = [JSON.stringify({ sessionId: sid }), line('a', 1000, 0, 50), line('a', 1000, 0, 60), line('b', 2000, 1500, 10, 5)]
  writeFileSync(join(base, 'proj', 'chats', `session-2026-10-16T18-00-${sid.slice(0, 8)}.jsonl`), rows.join(NL))
  mkdirSync(join(base, 'other', 'chats'), { recursive: true })
  writeFileSync(join(base, 'other', 'chats', 'session-2026-10-16T18-00-deadbeef.jsonl'), line('z', 9e6, 0, 9e6))
  assert.deepEqual(geminiTokens(sid, base), { tokens: 1000 + 60 + (500 + 10 + 5) })
  assert.deepEqual(geminiTokens('not-an-id', base), { tokens: 0 })
})

test('codex: newest session of the agent folder, cumulative total minus cached input', () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-codex-'))
  const cwd = mkdtempSync(join(tmpdir(), 'ac-proj-'))
  const day = join(home, 'sessions', '2026', '10', '16')
  mkdirSync(day, { recursive: true })
  const meta = (c) => JSON.stringify({ type: 'session_meta', payload: { cwd: c } })
  const usage = (i, c, o) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: i, cached_input_tokens: c, output_tokens: o } } } })
  const old = join(day, 'rollout-old.jsonl')
  writeFileSync(old, [meta(cwd), usage(5e6, 0, 5e6)].join(NL))
  utimesSync(old, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)) // older session of the same folder: ignored
  writeFileSync(join(day, 'rollout-new.jsonl'), [meta(cwd), usage(100, 0, 1), usage(10000, 8000, 300)].join(NL))
  writeFileSync(join(day, 'rollout-other.jsonl'), [meta(join(tmpdir(), 'somewhere-else')), usage(7e6, 0, 7e6)].join(NL))
  assert.deepEqual(codexTokens(cwd, home), { tokens: 2000 + 300 })
  assert.deepEqual(codexTokens(join(tmpdir(), 'no-such-folder'), home), { tokens: 0 })
  assert.deepEqual(agentTokens({ preset: 'shell', sid, cwd }), { tokens: 0 })
})
