// Agent status from CLI hooks: the event mapping, the Claude Code command line, and `canvas hook` end to end
// against a fake bridge (stdin JSON in, one POST out, nothing printed, exit 0 even when the bridge is down).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// hooks.cjs needs electron's `app` only to write the settings file; the mapping is pure.
const Module = require('module')
const load = Module._load
Module._load = (req, ...rest) => (req === 'electron' ? { app: { getPath: () => require('os').tmpdir() } } : load(req, ...rest))
const { statusOf, hookFlags, CLAUDE } = require('../electron/hooks.cjs')
Module._load = load
const { launchCommand } = require('../electron/launch.cjs')

test('hook events map to statuses', () => {
  assert.deepEqual(statusOf('prompt'), { status: 'working' })
  assert.deepEqual(statusOf('tool'), { status: 'working' })
  assert.deepEqual(statusOf('stop'), { status: 'idle' })
  assert.deepEqual(statusOf('notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }), { status: 'input', detail: 'Claude needs your permission to use Bash' })
  assert.equal(statusOf('notification', { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' }), null)
  assert.equal(statusOf('notification', { message: 'Claude is waiting for your input' }), null) // older versions: no type
  assert.equal(statusOf('whatever'), null)
})

test('only Claude Code gets the hooks, and only when enabled', () => {
  assert.match(hookFlags('claude', true), /^--settings ".+claude-settings\.json"$/)
  assert.equal(hookFlags('claude', false), '')
  assert.equal(hookFlags('codex', true), '')
  assert.deepEqual(Object.keys(CLAUDE.hooks).sort(), ['Notification', 'PostToolUse', 'Stop', 'UserPromptSubmit'])
  const S = { commands: { claude: 'claude' }, sendBriefing: true }
  assert.equal(launchCommand(S, 'claude', 'B', { sid: 'x', extra: '--settings "f"' }), 'claude --settings "f" --session-id x "B"')
  assert.equal(launchCommand(S, 'claude', 'B', { sid: 'x', resume: true, extra: '--settings "f"' }), 'claude --settings "f" --resume x')
})

const bin = fileURLToPath(new URL('../bin/canvas.cjs', import.meta.url))
const runHook = (url, event, stdin) => new Promise((resolve) => {
  const p = execFile(process.execPath, [bin, 'hook', event], { env: { ...process.env, CANVAS_URL: url, CANVAS_ID: 'n1' }, timeout: 10000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }))
  p.stdin.end(stdin)
})

test('canvas hook posts the event and stays silent', async () => {
  const got = []
  const srv = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ url: req.url, body: JSON.parse(b) }); res.end('{"ok":true}') }) })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}/TOKEN`
  try {
    const r = await runHook(url, 'notification', JSON.stringify({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'needs permission', transcript_path: 'x' }))
    assert.deepEqual(r, { code: 0, stdout: '', stderr: '' })
    assert.deepEqual(got, [{ url: '/TOKEN/hook', body: { from: 'n1', event: 'notification', input: { notification_type: 'permission_prompt', message: 'needs permission' } } }])
  } finally { srv.close() }
  // Bridge down: still exit 0, still silent.
  const down = await runHook('http://127.0.0.1:9/TOKEN', 'stop', '{}')
  assert.deepEqual(down, { code: 0, stdout: '', stderr: '' })
})
