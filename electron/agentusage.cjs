// Per-agent token use, read from each CLI's own session log. "Tokens" = fresh input + cache writes + output
// (cache reads are far cheaper and would dwarf the number). Claude and Gemini are matched by the conversation id the
// canvas assigns (--session-id); Codex cannot be given one, so its newest session in the agent's folder is used.
const fs = require('fs')
const os = require('os')
const path = require('path')

const SID = /^[0-9a-f-]{36}$/i // the id becomes part of a path: never accept anything else
const lines = (f) => fs.readFileSync(f, 'utf8').split('\n')

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

function claudeTokens(sid, base) {
  const f = findSession(sid, base)
  if (!f) return { tokens: 0 }
  const byMsg = new Map() // a message is logged several times while streaming: keep the last usage per id
  for (const line of lines(f)) {
    if (!line.includes('"usage"')) continue
    try {
      const m = JSON.parse(line).message
      if (m?.usage) byMsg.set(m.id || line, m.usage)
    } catch {}
  }
  let tokens = 0
  for (const u of byMsg.values()) tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0)
  return { tokens }
}

// ---- Gemini CLI: ~/.gemini/tmp/<project>/chats/session-<date>-<first 8 of id>.jsonl, one "tokens" object per message
function geminiTokens(sid, base = path.join(os.homedir(), '.gemini', 'tmp')) {
  if (!SID.test(sid || '')) return { tokens: 0 }
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
        try { const j = JSON.parse(line); if (j.tokens) byMsg.set(j.id || line, j.tokens) } catch {}
      }
      let tokens = 0
      for (const t of byMsg.values()) tokens += Math.max((t.input || 0) - (t.cached || 0), 0) + (t.output || 0) + (t.thoughts || 0) + (t.tool || 0)
      return { tokens }
    }
  } catch {}
  return { tokens: 0 }
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
function codexTokens(cwd, home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')) {
  const files = walk(path.join(home, 'sessions'))
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files) {
    const ls = lines(f)
    let meta
    try { meta = JSON.parse(ls[0]).payload } catch { continue }
    if (!same(meta?.cwd, cwd)) continue
    for (const l of ls.reverse()) {
      if (!l.includes('"total_token_usage"')) continue
      try {
        const u = JSON.parse(l).payload.info.total_token_usage
        return { tokens: Math.max((u.input_tokens || 0) - (u.cached_input_tokens || 0), 0) + (u.output_tokens || 0) }
      } catch {}
    }
    return { tokens: 0 } // newest session of this folder, no usage logged yet
  }
  return { tokens: 0 }
}

function agentTokens({ preset, sid, cwd }) {
  if (preset === 'claude') return claudeTokens(sid)
  if (preset === 'gemini') return geminiTokens(sid)
  if (preset === 'codex') return codexTokens(cwd)
  return { tokens: 0 }
}

module.exports = { agentTokens, claudeTokens, geminiTokens, codexTokens, findSession }
