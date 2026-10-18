// Quota/usage read from the agents' own local logs. No network, no credentials touched.
const fs = require('fs')
const path = require('path')
const os = require('os')

const HOUR = 3600e3
const walk = (dir, since, out = []) => {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, since, out)
    else if (e.name.endsWith('.jsonl') && fs.statSync(p).mtimeMs >= since) out.push(p)
  }
  return out
}

function tail(file, bytes) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, bytes)
    const b = Buffer.alloc(len)
    fs.readSync(fd, b, 0, len, size - len)
    return b.toString('utf8')
  } finally { fs.closeSync(fd) }
}

function codex() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const files = walk(path.join(home, 'sessions'), Date.now() - 8 * 24 * HOUR)
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files) {
    const lines = tail(f, 2e6).split('\n').reverse()
    for (const l of lines) {
      if (!l.includes('"rate_limits"')) continue
      try {
        const r = JSON.parse(l).payload.rate_limits
        if (r?.primary) return { plan: r.plan_type, session: r.primary, weekly: r.secondary }
      } catch {}
    }
  }
  return null
}

function claude() {
  const now = Date.now()
  let h5 = 0, d7 = 0
  for (const f of walk(path.join(os.homedir(), '.claude', 'projects'), now - 7 * 24 * HOUR)) {
    let txt
    try { txt = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const l of txt.split('\n')) {
      if (!l.includes('"usage"') || !l.includes('"assistant"')) continue
      try {
        const j = JSON.parse(l)
        const u = j.message?.usage
        const age = now - Date.parse(j.timestamp)
        if (!u || !(age < 7 * 24 * HOUR)) continue
        const n = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
        d7 += n
        if (age < 5 * HOUR) h5 += n
      } catch {}
    }
  }
  return { h5, d7 }
}

// Real Claude quota: undocumented endpoint Claude Code itself uses, with the user's own local OAuth token.
// The token is never refreshed here (refreshing could invalidate Claude Code's login); expired -> local fallback.
// error is a short code the window translates (never a raw message: those carry file paths with the user name):
// nocred (no local credential file; on macOS it lives in the Keychain) | unreadable | expired | http-<status> | offline
async function claudeQuota() {
  let t
  try {
    t = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8')).claudeAiOauth
  } catch (e) {
    return { error: e.code === 'ENOENT' ? 'nocred' : 'unreadable' }
  }
  if (!t?.accessToken || t.expiresAt < Date.now()) return { error: 'expired' }
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: 'Bearer ' + t.accessToken, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { error: 'http-' + r.status }
    const j = await r.json()
    return { plan: t.subscriptionType, session: j.five_hour, weekly: j.seven_day }
  } catch {
    return { error: 'offline' }
  }
}

let cache = { t: 0, v: null }
async function getUsage() {
  if (Date.now() - cache.t < 30e3) return cache.v
  // The quota call is the app's only request to Anthropic; it can be turned off (Settings → Agents → Privacy).
  const quotaOn = require('./settings.cjs').get().claudeQuota !== false
  const v = { codex: codex(), claude: claude(), claudeQuota: quotaOn ? await claudeQuota() : { error: 'off' } }
  cache = { t: Date.now(), v }
  return v
}

module.exports = { getUsage }
