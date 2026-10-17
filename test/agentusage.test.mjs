import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const { agentTokens, claudeTokens, codexTokens, geminiTokens } = req('../electron/agentusage.cjs')
const { costOf, priceFor } = req('../electron/pricing.cjs')
const sid = '11111111-2222-3333-4444-555555555555'
const NL = '\n'
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('sums usage per message, counting streamed duplicates once, ignoring cache reads', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  mkdirSync(join(base, 'C--proj'))
  const msg = (id, i, c, o) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: i, cache_creation_input_tokens: c, cache_read_input_tokens: 99999, output_tokens: o } } })
  writeFileSync(join(base, 'C--proj', sid + '.jsonl'), [msg('a', 2, 100, 5), msg('a', 2, 100, 50), msg('b', 3, 0, 7), '{"type":"user"}', 'not json "usage"'].join(NL))
  const r = claudeTokens(sid, base)
  assert.equal(r.tokens, 2 + 100 + 50 + 3 + 7)
  assert.equal(r.cost, null, 'no model in the log: no estimate')
})

test('claude cost: per message at its model price, cache reads included, synthetic messages free', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  mkdirSync(join(base, 'C--proj'))
  const msg = (id, model, i, cw, cr, o) => JSON.stringify({ type: 'assistant', message: { id, model, usage: { input_tokens: i, cache_creation_input_tokens: cw, cache_read_input_tokens: cr, output_tokens: o } } })
  writeFileSync(join(base, 'C--proj', sid + '.jsonl'), [
    msg('a', 'claude-opus-5-5', 1e6, 0, 0, 0), // 4.00
    msg('b', 'claude-opus-5-5', 0, 1e6, 1e6, 1e6), // 5.00 + 0.20 + 20.00
    msg('c', 'claude-haiku-5-5', 0, 0, 0, 1e6), // 0.50
    msg('d', '<synthetic>', 0, 0, 0, 0),
  ].join(NL))
  const r = claudeTokens(sid, base)
  near(r.cost, 4 + 5 + 0.2 + 20 + 0.5)
  assert.equal(r.model, 'claude-haiku-5-5', 'the latest model used')
})

test('unknown or malformed ids give zero and never touch the path', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-usage-'))
  assert.equal(claudeTokens(sid, base).tokens, 0)
  assert.equal(claudeTokens('../../etc/passwd', base).tokens, 0)
})

test('gemini: matched by the canvas id in the file name; cached input and duplicates are not counted', () => {
  const base = mkdtempSync(join(tmpdir(), 'ac-gem-'))
  mkdirSync(join(base, 'proj', 'chats'), { recursive: true })
  const line = (id, input, cached, output, thoughts = 0, model) => JSON.stringify({ id, model, tokens: { input, cached, output, thoughts, tool: 0, total: input + output + thoughts } })
  const rows = [JSON.stringify({ sessionId: sid }), line('a', 1000, 0, 50), line('a', 1000, 0, 60), line('b', 2000, 1500, 10, 5)]
  writeFileSync(join(base, 'proj', 'chats', `session-2026-10-16T18-00-${sid.slice(0, 8)}.jsonl`), rows.join(NL))
  mkdirSync(join(base, 'other', 'chats'), { recursive: true })
  writeFileSync(join(base, 'other', 'chats', 'session-2026-10-16T18-00-deadbeef.jsonl'), line('z', 9e6, 0, 9e6))
  assert.equal(geminiTokens(sid, base).tokens, 1000 + 60 + (500 + 10 + 5))
  assert.equal(geminiTokens('not-an-id', base).tokens, 0)
  // With the model logged, cached input is billed at the cache price.
  writeFileSync(join(base, 'proj', 'chats', `session-2026-10-16T18-00-${sid.slice(0, 8)}.jsonl`), [line('c', 3e6, 1e6, 1e6, 0, 'gemini-3.1-pro')].join(NL))
  near(geminiTokens(sid, base).cost, 2 * 2 + 1 * 0.2 + 1 * 12)
})

test('codex: newest session of the agent folder, cumulative total minus cached input', () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-codex-'))
  const cwd = mkdtempSync(join(tmpdir(), 'ac-proj-'))
  const day = join(home, 'sessions', '2026', '10', '16')
  mkdirSync(day, { recursive: true })
  const meta = (c) => JSON.stringify({ type: 'session_meta', payload: { cwd: c } })
  const ctx = (model) => JSON.stringify({ type: 'turn_context', payload: { model } })
  const usage = (i, c, o) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: i, cached_input_tokens: c, output_tokens: o } } } })
  const old = join(day, 'rollout-old.jsonl')
  writeFileSync(old, [meta(cwd), usage(5e6, 0, 5e6)].join(NL))
  utimesSync(old, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)) // older session of the same folder: ignored
  writeFileSync(join(day, 'rollout-new.jsonl'), [meta(cwd), ctx('gpt-6-sol'), usage(100, 0, 1), usage(10000, 8000, 300)].join(NL))
  writeFileSync(join(day, 'rollout-other.jsonl'), [meta(join(tmpdir(), 'somewhere-else')), usage(7e6, 0, 7e6)].join(NL))
  const r = codexTokens(cwd, home)
  assert.equal(r.tokens, 2000 + 300)
  assert.equal(r.model, 'gpt-6-sol')
  near(r.cost, (2000 * 2 + 8000 * 0.2 + 300 * 10) / 1e6)
  assert.equal(codexTokens(join(tmpdir(), 'no-such-folder'), home).tokens, 0)
  assert.deepEqual(agentTokens({ preset: 'shell', sid, cwd }), { tokens: 0, cost: 0, model: '' })
})

test('prices: longest prefix wins, user overrides replace or remove rows', () => {
  assert.equal(priceFor('claude-opus-5-5').in, 4)
  assert.equal(priceFor('claude-opus-5').in, 5)
  assert.equal(priceFor('gpt-6.1-sol').cr, 0.1)
  assert.equal(priceFor('gpt-6-sol').cr, 0.2)
  assert.equal(priceFor('some-local-model'), null)
  assert.equal(priceFor('claude-opus-5-5', { 'claude-opus-5-5': { in: 1 } }).in, 1)
  assert.equal(priceFor('claude-opus-5-5', { 'claude-opus-5-5': null }).in, 5, 'removed row falls back to the shorter prefix')
  assert.equal(priceFor('my-model', { 'my-': { in: 1, out: 2 } }).out, 2)
  near(costOf('my-model', { input: 1e6, output: 1e6, cacheWrite: 1e6 }, { 'my-': { in: 1, out: 2 } }), 1 + 2 + 1)
})
