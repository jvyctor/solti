// Local bridge: agents inside terminals call it through the `canvas` CLI and the MCP server (bin/).
// Every action where one agent acts on another (or on a browser portal) goes through the timeline and,
// depending on the setting, through your approval.
const http = require('http')
const fs = require('fs')
const path = require('path')
const { app, webContents } = require('electron')
const S = require('./state.cjs')
const activity = require('./activity.cjs')
const settings = require('./settings.cjs')
const portal = require('./portal.cjs')
const gitx = require('./git.cjs')

const waiting = new Map() // asker id -> { from (target id), resolve, timer }

// What a connected node holds, as the agent sees it: terminal output, note text, page text, folder listing, diff.
async function readNode(n, j) {
  const cap = Math.min(Math.max(Number(j.bytes) || 8000, 200), 100000)
  if (n.type === 'terminal') return { type: 'terminal', output: (S.ptys.get(n.id)?.buf || '').slice(-(j.bytes || 4000)) }
  if (['note', 'text', 'knowledge'].includes(n.type)) return { type: n.type, title: n.name, text: (n.text || '').slice(0, cap) }
  if (n.type === 'files') {
    const root = n.path || ''
    const dir = path.resolve(root, j.path || '')
    if (!root || path.relative(root, dir).startsWith('..')) throw new Error('path outside the connected folder')
    const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 300).map((e) => e.name + (e.isDirectory() ? '/' : ''))
    return { type: 'files', path: dir, entries }
  }
  if (n.type === 'portal') {
    const wc = S.portals.has(n.id) ? webContents.fromId(S.portals.get(n.id)) : null
    if (!wc || wc.isDestroyed()) return { type: 'portal', url: n.url, note: 'page not loaded yet' }
    const text = await wc.executeJavaScript('document.body ? document.body.innerText : ""')
    const links = await wc.executeJavaScript('[...document.querySelectorAll("a[href]")].slice(0, 40).map(a => ({ text: a.innerText.trim().slice(0, 80), href: a.href }))')
    return { type: 'portal', url: wc.getURL(), title: wc.getTitle(), text: String(text).slice(0, cap), links }
  }
  if (n.type === 'diff') {
    const ids = S.graph.edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => (e.source === n.id ? e.target : e.source))
    const agent = S.graph.nodes.find((x) => ids.includes(x.id) && x.git?.worktree)
    if (!agent) return { type: 'diff', note: 'not connected to an agent working in a worktree' }
    const files = await gitx.changes(agent.cwd, agent.git.base)
    const patches = {}
    for (const f of files.slice(0, 6)) patches[f.file] = (await gitx.patch(agent.cwd, agent.git.base, f.file, f.status === 'N')).slice(0, 4000)
    return { type: 'diff', branch: agent.git.branch, base: agent.git.base, files, patches }
  }
  return { type: n.type, name: n.name }
}

function handle(url, j, reply) {
  const from = j.from
  const { peersOf, nameOf, toRenderer, typeInto } = S
  if (url === '/peers') return reply(200, { peers: peersOf(from).map((n) => ({ id: n.id, name: n.name, type: n.type || 'terminal', role: n.role })) })
  if (url === '/send' || url === '/ask') {
    const target = peersOf(from).find((n) => n.id === j.to || n.name === j.to)
    if (!target) return reply(403, { error: 'target not connected to caller' })
    const t = S.ptys.get(target.id)
    if (!t) return reply(404, { error: 'target terminal not running' })
    const me = nameOf(from) || from
    const comm = (kind) => toRenderer('comm', { kind, a: from, b: target.id })
    if (url === '/send') {
      // A reply to someone blocked in canvas_ask goes straight to their tool call, not their prompt.
      const w = waiting.get(target.id)
      if (w && w.from === from) {
        clearTimeout(w.timer)
        waiting.delete(target.id)
        w.resolve({ reply: j.text, from: me })
        comm('pulse')
        return reply(200, { ok: true, delivered: 'to waiting canvas_ask' })
      }
      typeInto(t, `[from ${me}] ${j.text}`)
      comm('pulse')
      return reply(200, { ok: true })
    }
    // /ask: deliver, then hold the HTTP response until the peer answers with canvas_send (or timeout).
    const secs = Math.min(Math.max(Number(j.timeout) || 50, 5), 600)
    const prev = waiting.get(from)
    if (prev) { clearTimeout(prev.timer); prev.resolve({ replaced: true }) }
    comm('start')
    waiting.set(from, {
      from: target.id,
      resolve: (r) => { comm('end'); reply(200, r) },
      timer: setTimeout(() => {
        waiting.delete(from)
        comm('end')
        reply(200, { timeout: true, note: `sem resposta em ${secs}s; se chegar depois, aparece no seu terminal` })
      }, secs * 1000),
    })
    typeInto(t, `[from ${me}] ${j.text} (Responda usando a ferramenta canvas_send para "${me}".)`)
    return
  }
  if (url === '/read') {
    const target = peersOf(from).find((n) => n.id === j.to || n.name === j.to)
    if (!target) return reply(404, { error: 'target not found or not connected to you (see canvas_peers)' })
    return readNode(target, j).then((r) => reply(200, r), (e) => reply(500, { error: e.message }))
  }
  if (url === '/spawn') {
    const me = S.graph.nodes.find((n) => n.id === from)
    if (!me?.maestro) return reply(403, { error: 'only the maestro can create agents' })
    const taken = new Set(S.graph.nodes.filter((n) => n.ws === me.ws).map((n) => n.name))
    let name = String(j.name || 'agente').trim().slice(0, 40) || 'agente'
    for (let i = 2; taken.has(name); i++) name = `${j.name || 'agente'}-${i}`
    // Reserve the name now so two quick spawns do not collide before the renderer reports back.
    S.graph.nodes.push({ id: 'pending-' + name, ws: me.ws, name })
    toRenderer('spawn', { from, name, preset: j.preset, instructions: j.instructions })
    return reply(200, { ok: true, name, note: 'agent created and connected to you; message it with canvas_send/canvas_ask' })
  }
  if (url === '/knowledge') {
    const me = S.graph.nodes.find((n) => n.id === from)
    return reply(200, { text: (me && S.graph.knowledge?.[me.ws]) || '' })
  }
  if (url === '/remember') {
    const me = S.graph.nodes.find((n) => n.id === from)
    if (!me || !String(j.text || '').trim()) return reply(400, { error: 'empty text or unknown caller' })
    const line = `- ${String(j.text).trim()}`
    S.graph.knowledge = { ...S.graph.knowledge, [me.ws]: ((S.graph.knowledge?.[me.ws] || '') + '\n' + line).trim() }
    toRenderer('knowledge', { from, text: line })
    return reply(200, { ok: true })
  }
  if (url === '/portal') {
    const target = peersOf(from).find((n) => (n.id === j.to || n.name === j.to) && n.type === 'portal')
    if (!target) return reply(404, { error: 'portal not found or not connected to you (see canvas_peers)' })
    const wc = S.portals.has(target.id) ? webContents.fromId(S.portals.get(target.id)) : null
    if (!wc || wc.isDestroyed()) return reply(404, { error: 'portal page not loaded yet' })
    return portal.act(wc, j).then(
      (r) => {
        if (!r.png) return reply(200, r)
        const dir = path.join(app.getPath('userData'), 'shots')
        fs.mkdirSync(dir, { recursive: true })
        const f = path.join(dir, `${target.id}-${Date.now()}.png`)
        fs.writeFileSync(f, r.png)
        for (const old of fs.readdirSync(dir).sort().slice(0, -20)) fs.rmSync(path.join(dir, old), { force: true }) // keep the newest 20
        reply(200, { ok: true, path: f, url: r.url, image: r.png.toString('base64') })
      },
      (e) => reply(500, { error: e.message }),
    )
  }
  if (url === '/done') {
    const summary = String(j.summary || '').trim() || '(sem resumo)'
    activity.record({ kind: 'done', from: nameOf(from) || from, fromId: from, to: '', text: summary, outcome: 'ok' })
    toRenderer('agent:done', { from, name: nameOf(from) || from, summary, t: Date.now() })
    return reply(200, { ok: true })
  }
  if (url === '/note') {
    toRenderer('note', { from, text: j.text })
    return reply(200, { ok: true })
  }
  reply(404, { error: 'unknown route' })
}

function start() {
  const srv = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    // Token travels in the path so env filters that drop *TOKEN* vars (e.g. Gemini CLI) still work.
    if (!req.url.startsWith('/' + S.TOKEN)) return reply(401, { error: 'bad token' })
    const url = req.url.slice(S.TOKEN.length + 1)
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let j = {}
      try { j = body ? JSON.parse(body) : {} } catch { return reply(400, { error: 'bad json' }) }
      const from = j.from
      const go = () => handle(url, j, reply)
      // Timeline + approval gate for actions where one agent acts on another (or on the browser).
      const kind = { '/send': 'send', '/ask': 'ask', '/spawn': 'spawn', '/portal': 'portal' }[url]
      if (!kind) return go()
      // Ids next to the names: the history filters by agent, and names change.
      const toId = kind === 'spawn' ? '' : S.peersOf(from).find((n) => n.id === j.to || n.name === j.to)?.id || ''
      const info = { kind, from: S.nameOf(from) || from, fromId: from, to: j.to || j.name || '', toId, text: j.text || j.instructions || [j.action, j.url, j.selector, j.value, j.key].filter(Boolean).join(' ') }
      if (activity.needsApproval(settings.get().approval, kind)) {
        return activity.request(info).then((ok) => {
          activity.record({ ...info, outcome: ok ? 'ok' : 'denied' })
          ok ? go() : reply(403, { error: 'denied by the user' })
        })
      }
      activity.record({ ...info, outcome: 'ok' })
      go()
    })
  })
  srv.listen(0, '127.0.0.1', () => (S.bridgePort = srv.address().port))
}

module.exports = { start }
