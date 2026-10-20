import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { buildPush, valid } = createRequire(import.meta.url)('../electron/push.cjs')

test('push: Slack, Discord and Telegram get JSON; anything else (ntfy) gets plain text', () => {
  assert.deepEqual(JSON.parse(buildPush('https://hooks.slack.com/services/T/B/x', 'T', 'corpo').body), { text: 'T\ncorpo' })
  assert.deepEqual(JSON.parse(buildPush('https://discord.com/api/webhooks/1/x', 'T', 'corpo').body), { content: 'T\ncorpo' })
  assert.deepEqual(JSON.parse(buildPush('https://api.telegram.org/bot123:abc/sendMessage?chat_id=42', 'T', 'corpo').body), { chat_id: '42', text: 'T\ncorpo' })
  const n = buildPush('https://ntfy.sh/meu-topico', 'Solti: aprovação', 'corpo')
  assert.equal(n.body, 'Solti: aprovação\ncorpo')
  assert.match(n.headers['Content-Type'], /text\/plain/)
})

test('push: only https URLs are used', () => {
  assert.equal(valid('https://ntfy.sh/x'), true)
  assert.equal(valid('http://ntfy.sh/x'), false)
  assert.equal(valid('nope'), false)
})
