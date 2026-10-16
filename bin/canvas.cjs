#!/usr/bin/env node
// Usage: canvas peers | canvas send <peer> <text...> | canvas read <peer> [bytes] | canvas note <text...> | canvas knowledge | canvas remember <text...>
const http = require('http')
const { CANVAS_URL, CANVAS_ID } = process.env
if (!CANVAS_URL) { console.error('canvas: run inside an Agent Canvas terminal'); process.exit(1) }

const [cmd, ...args] = process.argv.slice(2)
const routes = {
  peers: ['/peers', () => ({})],
  send: ['/send', () => ({ to: args[0], text: args.slice(1).join(' ') })],
  ask: ['/ask', () => ({ to: args[0], text: args.slice(1).join(' ') })],
  spawn: ['/spawn', () => ({ name: args[0], preset: args[1], instructions: args.slice(2).join(' ') })],
  read: ['/read', () => ({ to: args[0], bytes: Number(args[1]) || 4000 })],
  note: ['/note', () => ({ text: args.join(' ') })],
  knowledge: ['/knowledge', () => ({})],
  remember: ['/remember', () => ({ text: args.join(' ') })],
}
if (!routes[cmd]) { console.error('usage: canvas peers|send|ask|spawn|read|note|knowledge|remember'); process.exit(1) }

const body = JSON.stringify({ from: CANVAS_ID, ...routes[cmd][1]() })
const req = http.request(CANVAS_URL + routes[cmd][0], { method: 'POST' }, (res) => {
  let d = ''
  res.on('data', (c) => (d += c))
  res.on('end', () => {
    const j = JSON.parse(d)
    if (res.statusCode >= 400) { console.error('canvas:', j.error); process.exit(1) }
    if (cmd === 'peers') j.peers.forEach((p) => console.log(`${p.name}${p.role ? ' - ' + p.role : ''}`))
    else if (cmd === 'read') console.log(j.output)
    else if (cmd === 'knowledge') console.log(j.text || '(vazio)')
    else if (cmd === 'spawn') console.log(`created: ${j.name}`)
    else if (cmd === 'ask') console.log(j.reply ?? j.note ?? 'ok')
    else console.log('ok')
  })
})
req.on('error', (e) => { console.error('canvas:', e.message); process.exit(1) })
req.end(body)
