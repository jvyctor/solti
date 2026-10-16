import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { launchCommand } = createRequire(import.meta.url)('../electron/launch.cjs')
const S = { sendBriefing: true, commands: { claude: 'claude', codex: 'codex', gemini: 'gemini', antigravity: 'agy', opencode: 'opencode', shell: '' } }
const sid = '11111111-2222-3333-4444-555555555555'

test('first start assigns the conversation id and sends the briefing', () => {
  assert.equal(launchCommand(S, 'claude', 'BRIEF', { sid }), `claude --session-id ${sid} "BRIEF"`)
  assert.equal(launchCommand(S, 'codex', 'BRIEF', { sid }), 'codex "BRIEF"')
  assert.equal(launchCommand(S, 'gemini', 'BRIEF', { sid }), 'gemini -i "BRIEF"')
})

test('resume reopens the previous conversation and skips the briefing', () => {
  assert.equal(launchCommand(S, 'claude', 'BRIEF', { resume: true, sid }), `claude --resume ${sid}`)
  assert.equal(launchCommand(S, 'codex', 'BRIEF', { resume: true, sid }), 'codex resume --last')
  assert.equal(launchCommand(S, 'gemini', 'BRIEF', { resume: true, sid }), 'gemini --resume latest')
  assert.equal(launchCommand(S, 'opencode', 'BRIEF', { resume: true, sid }), 'opencode --continue')
})

test('agents without a resume flag start fresh; shell types nothing', () => {
  assert.equal(launchCommand(S, 'antigravity', 'BRIEF', { resume: true, sid }), 'agy -i "BRIEF"')
  assert.equal(launchCommand(S, 'shell', 'BRIEF', { resume: true, sid }), '')
})

test('without briefing, claude still gets its id; others run bare', () => {
  const N = { ...S, sendBriefing: false }
  assert.equal(launchCommand(N, 'claude', '', { sid }), `claude --session-id ${sid}`)
  assert.equal(launchCommand(N, 'codex', '', { sid }), 'codex')
})
