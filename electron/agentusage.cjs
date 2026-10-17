// Per-agent token use, read from each CLI's own session log. "Tokens" = fresh input + cache writes + output
// (cache reads are far cheaper and would dwarf the number). Claude and Gemini are matched by the conversation id the
// canvas assigns (--session-id); Codex cannot be given one, so its newest session in the agent's folder is used.
const fs = require('fs')
const os = require('os')
const path = require('path')

const { costOf } = require('./pricing.cjs')

const SID = /^[0-9a-f-]{36}$/i // the id becomes part of a path: never accept anything else
const lines = (f) => fs.readFileSync(f, 'utf8').split('\n')
// Adds one message's cost; once any message has an unknown model the total stays null ("no estimate").
const addCost = (acc, model, u, prices) => {
  if (acc === null) return null
  const c = costOf(model, u, prices)
  return c === null ? null : acc + c
}

// ---- Claude Code: ~/.claude/projects/<project>/<id>.jsonl
const claudeRoot = () => path.join(os.homedir(), '.claude', 'projects')

function findSession(sid, base = claudeRoot()) {
  if (!SID.test(sid || '')) return null
  try {
    for (const d of fs.readdirSync(base)) {
      const f = path.join(base, d, sid + '.jsonl')
      if (fs.existsSync(f)) return f
    }
  } catch {}
  return null
}

function claudeTokens(sid, base, prices) {
  const f = findSession(sid, base)
  if (!f) return { tokens: 0, cost: 0, model: '' }
  const byMsg = new Map() // a message is logged several times while streaming: keep the last usage per id
  for (const line of lines(f)) {
    if (!line.includes('"usage"')) continue
    try {
      const m = JSON.parse(line).message
      if (m?.usage) byMsg.set(m.id || line, { usage: m.usage, model: m.model || '' })
    } catch {}
  }
  let tokens = 0, cost = 0, model = ''
  for (const { usage: u, model: mm } of byMsg.values()) {
    tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0)
    if (mm === '<synthetic>') continue // local placeholder messages (errors, interruptions): nothing billed
    if (mm) model = mm
    cost = addCost(cost, mm, { input: u.input_tokens, output: u.output_tokens, cacheWrite: u.cache_creation_input_tokens, cacheRead: u.cache_read_input_tokens }, prices)
  }
  return { tokens, cost, model }
}

// ---- Gemini CLI: ~/.gemini/tmp/<project>/chats/session-<date>-<first 8 of id>.jsonl, one "tokens" object per message
function geminiTokens(sid, base = path.join(os.homedir(), '.gemini', 'tmp'), prices) {
  const none = { tokens: 0, cost: 0, model: '' }
  if (!SID.test(sid || '')) return none
  const short = sid.slice(0, 8)
  try {
    for (const d of fs.readdirSync(base)) {
      const dir = path.join(base, d, 'chats')
      let names = []
      try { names = fs.readdirSync(dir) } catch { continue }
      const name = names.find((n) => n.startsWith('session-') && n.endsWith(`-${short}.jsonl`))
      if (!name) continue
      const byMsg = new Map()
      for (const line of lines(path.join(dir, name))) {
        if (!line.includes('"tokens"')) continue
        try { const j = JSON.parse(line); if (j.tokens) byMsg.set(j.id || line, { t: j.tokens, model: j.model || '' }) } catch {}
      }
      let tokens = 0, cost = 0, model = ''
      for (const { t, model: mm } of byMsg.values()) {
        const fresh = Math.max((t.input || 0) - (t.cached || 0), 0)
        tokens += fresh + (t.output || 0) + (t.thoughts || 0) + (t.tool || 0)
        if (mm) model = mm
        cost = addCost(cost, mm, { input: fresh + (t.tool || 0), output: (t.output || 0) + (t.thoughts || 0), cacheRead: t.cached }, prices)
      }
      return { tokens, cost, model }
    }
  } catch {}
  return none
}

// ---- Codex: ~/.codex/sessions/Y/M/D/rollout-*.jsonl; first line has the session's cwd, token_count events carry cumulative totals
const same = (a, b) => {
  const n = (p) => { try { return fs.realpathSync.native(p).toLowerCase() } catch { return path.resolve(p).toLowerCase() } }
  return !!a && !!b && n(a) === n(b)
}
function walk(dir, out = []) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (/^rollout-.*\.jsonl$/.test(e.name)) out.push(p)
    }
  } catch {}
  return out
}
function codexTokens(cwd, home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), prices) {
  const none = { tokens: 0, cost: 0, model: '' }
  const files = walk(path.join(home, 'sessions'))
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files) {
    const ls = lines(f)
    let meta
    try { meta = JSON.parse(ls[0]).payload } catch { continue }
    if (!same(meta?.cwd, cwd)) continue
    let model = ''
    for (const l of ls) {
      if (!l.includes('"turn_context"')) continue
      try { model = JSON.parse(l).payload.model || model } catch {}
    }
    for (const l of ls.reverse()) {
      if (!l.includes('"total_token_usage"')) continue
      try {
        const u = JSON.parse(l).payload.info.total_token_usage
        const fresh = Math.max((u.input_tokens || 0) - (u.cached_input_tokens || 0), 0)
        return { tokens: fresh + (u.output_tokens || 0), cost: costOf(model, { input: fresh, output: u.output_tokens, cacheRead: u.cached_input_tokens, cacheWrite: u.cache_write_input_tokens }, prices), model }
      } catch {}
    }
    return { ...none, model } // newest session of this folder, no usage logged yet
  }
  return none
}

// { tokens, cost (US$, null = no price known for the model), model }
function agentTokens({ preset, sid, cwd }, prices) {
  if (preset === 'claude') return claudeTokens(sid, undefined, prices)
  if (preset === 'gemini') return geminiTokens(sid, undefined, prices)
  if (preset === 'codex') return codexTokens(cwd, undefined, prices)
  return { tokens: 0, cost: 0, model: '' }
}

module.exports = { agentTokens, claudeTokens, geminiTokens, codexTokens, findSession }
