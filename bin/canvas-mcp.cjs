#!/usr/bin/env node
// Minimal MCP stdio server (newline-delimited JSON-RPC). Identity comes from CANVAS_URL/CANVAS_ID,
// inherited from the Agent Canvas terminal that launched the agent.
const http = require('http')
const { CANVAS_URL, CANVAS_ID } = process.env

const TOOLS = [
  { name: 'canvas_peers', description: 'List terminals/agents connected to you on the canvas.', props: {}, route: '/peers' },
  { name: 'canvas_send', description: 'Send a message to a connected agent. It is typed into its terminal.', props: { to: 'Peer name or id', text: 'Message' }, req: ['to', 'text'], route: '/send' },
  { name: 'canvas_ask', description: 'Send a message to a connected agent and WAIT for its reply (it answers with canvas_send). Use when you need the answer before continuing.', props: { to: 'Peer name or id', text: 'Question/task', timeout: 'Seconds to wait (default 50, max 600)' }, req: ['to', 'text'], route: '/ask' },
  { name: 'canvas_spawn', description: 'MAESTRO ONLY. Create a new agent terminal on the canvas, connected to you. Give it a name, a CLI preset (claude, codex, gemini, antigravity, opencode, shell) and the specialty/instructions it must follow. Returns the final name; then delegate with canvas_send/canvas_ask.', props: { name: 'Agent name, e.g. ux-ui-senior', preset: 'claude | codex | gemini | antigravity | opencode | shell (default claude)', instructions: 'Specialty, scope and rules for this agent (it reads them at startup)' }, req: ['name'], route: '/spawn' },
  { name: 'canvas_read', description: 'Read the recent terminal output of a connected agent.', props: { to: 'Peer name or id', bytes: 'Max bytes (default 4000)' }, req: ['to'], route: '/read' },
  { name: 'canvas_note', description: 'Write a sticky note on the canvas.', props: { text: 'Note text' }, req: ['text'], route: '/note' },
]

function call(route, args) {
  return new Promise((resolve, reject) => {
    if (!CANVAS_URL) return reject(new Error('not running inside an Agent Canvas terminal'))
    const req = http.request(CANVAS_URL + route, { method: 'POST' }, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        const j = JSON.parse(d)
        res.statusCode >= 400 ? reject(new Error(j.error)) : resolve(j)
      })
    })
    req.on('error', reject)
    req.end(JSON.stringify({ from: CANVAS_ID, ...args }))
  })
}

const send = (o) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...o }) + '\n')

async function handle(m) {
  if (m.method === 'initialize')
    return send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'agent-canvas', version: '0.1.0' } } })
  if (m.method === 'tools/list')
    return send({
      id: m.id,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(t.props).map(([k, d]) => [k, { type: k === 'bytes' || k === 'timeout' ? 'number' : 'string', description: d }])), required: t.req || [] },
        })),
      },
    })
  if (m.method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === m.params.name)
    if (!t) return send({ id: m.id, error: { code: -32602, message: 'unknown tool' } })
    try {
      const r = await call(t.route, m.params.arguments || {})
      return send({ id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } })
    } catch (e) {
      return send({ id: m.id, result: { isError: true, content: [{ type: 'text', text: String(e.message) }] } })
    }
  }
  if (m.id !== undefined) send({ id: m.id, result: {} }) // ping etc.
}

let buf = ''
process.stdin.on('data', (c) => {
  buf += c
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (line) try { handle(JSON.parse(line)) } catch {}
  }
})
