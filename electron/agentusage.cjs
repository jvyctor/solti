// Per-agent token use. Only Claude Code is covered: the canvas assigns its conversation id (--session-id),
// and Claude Code logs every message's usage to ~/.claude/projects/<project>/<id>.jsonl.
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = () => path.join(os.homedir(), '.claude', 'projects')

function findSession(sid, base = root()) {
  if (!/^[0-9a-f-]{36}$/i.test(sid || '')) return null // the id becomes part of a path
  try {
    for (const d of fs.readdirSync(base)) {
      const f = path.join(base, d, sid + '.jsonl')
      if (fs.existsSync(f)) return f
    }
  } catch {}
  return null
}

// Fresh input + cache writes + output. Cache reads are far cheaper and would dwarf the number, so they are left out.
function claudeTokens(sid, base) {
  const f = findSession(sid, base)
  if (!f) return { tokens: 0 }
  const byMsg = new Map() // a message is logged several times while streaming: keep the last usage per id
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
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

module.exports = { claudeTokens, findSession }
