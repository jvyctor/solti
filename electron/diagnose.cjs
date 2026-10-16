// "Is each agent CLI ready?": installed, probably logged in, and the canvas MCP registered. Login and MCP checks read the CLIs'
// own config files (cheap and offline), so "logado" is a best guess; null means "cannot tell".
const fs = require('fs')
const os = require('os')
const path = require('path')

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')) } catch { return null } }
const has = (f) => fs.existsSync(f)
const text = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }

const CLIS = {
  claude: {
    label: 'Claude Code', bin: 'claude',
    auth: (h, env) => !!env.ANTHROPIC_API_KEY || has(path.join(h, '.claude', '.credentials.json')) || !!readJson(path.join(h, '.claude.json'))?.oauthAccount || (process.platform === 'darwin' ? null : false),
    mcp: (h) => !!readJson(path.join(h, '.claude.json'))?.mcpServers?.canvas,
  },
  codex: {
    label: 'Codex', bin: 'codex',
    auth: (h, env, codexHome) => !!env.OPENAI_API_KEY || has(path.join(codexHome, 'auth.json')),
    mcp: (h, codexHome) => /\[mcp_servers\.canvas\]/.test(text(path.join(codexHome, 'config.toml'))),
  },
  gemini: {
    label: 'Gemini', bin: 'gemini',
    auth: (h, env) => !!env.GEMINI_API_KEY || !!env.GOOGLE_API_KEY || has(path.join(h, '.gemini', 'oauth_creds.json')),
    mcp: (h) => !!readJson(path.join(h, '.gemini', 'settings.json'))?.mcpServers?.canvas,
  },
  antigravity: {
    label: 'Antigravity', bin: 'agy',
    auth: (h) => { const a = readJson(path.join(h, '.gemini', 'google_accounts.json')); return a ? !!a.active : null },
    mcp: () => null, // asked through `agy mcp list` by the caller
  },
  opencode: {
    label: 'OpenCode', bin: 'opencode',
    auth: (h) => has(path.join(h, '.local', 'share', 'opencode', 'auth.json')),
    mcp: (h) => /"canvas"/.test(text(path.join(h, '.config', 'opencode', 'opencode.jsonc'))),
  },
}

// deps: { home, env, codexHome, commands, which(bin) -> Promise<bool>, run(cmd) -> Promise<string> }
async function diagnose({ home = os.homedir(), env = process.env, codexHome = env.CODEX_HOME || path.join(home, '.codex'), commands = {}, which, run }) {
  // In parallel: each CLI's --version can take seconds to start.
  return Promise.all(Object.entries(CLIS).map(async ([id, c]) => {
    const bin = String(commands[id] || c.bin).split(/\s+/)[0]
    const installed = await which(bin)
    let version = ''
    let mcp = c.mcp(home, id === 'codex' ? codexHome : undefined)
    if (installed) {
      version = (await run(`${bin} --version`).catch(() => '')).split(/\r?\n/)[0].trim().slice(0, 60)
      if (id === 'antigravity') mcp = /canvas/.test(await run(`${bin} mcp list`).catch(() => '')) ? true : null
    }
    const authenticated = installed ? c.auth(home, env, codexHome) : null
    return { id, label: c.label, bin, installed, version, authenticated, mcp: installed ? mcp : null }
  }))
}

module.exports = { diagnose, CLIS }
