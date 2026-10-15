// Registers the canvas MCP server in every agent CLI found. Best-effort, idempotent.
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Packaged app: scripts live in app.asar.unpacked and the app's own runtime acts as Node (no Node.js install needed).
const MCP = path.join(__dirname, '..', 'bin', 'canvas-mcp.cjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
const q = (s) => `"${s}"`
const EXE = q(process.execPath)
const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE=1'
const run = (cmd) => new Promise((res) => exec(cmd, { timeout: 30000 }, (err) => res(!err)))
const has = (bin) => run(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`)

async function claude() {
  await run('claude mcp remove --scope user canvas')
  return run(`claude mcp add canvas --scope user --env ${RUN_AS_NODE} -- ${EXE} ${q(MCP)}`)
}
async function gemini() {
  await run('gemini mcp remove -s user canvas')
  return run(`gemini mcp add -s user -e ${RUN_AS_NODE} canvas ${EXE} ${q(MCP)}`)
}
async function agy() {
  await run('agy mcp remove canvas')
  return run(`agy mcp add --env ${RUN_AS_NODE} canvas ${EXE} ${q(MCP)}`)
}
async function codex() {
  await run('codex mcp remove canvas')
  if (!(await run(`codex mcp add canvas --env ${RUN_AS_NODE} -- ${EXE} ${q(MCP)}`))) return false
  // Codex strips env for MCP servers unless forwarded explicitly.
  const f = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')
  try {
    const t = fs.readFileSync(f, 'utf8')
    if (!/\[mcp_servers\.canvas\][^[]*env_vars/.test(t))
      fs.writeFileSync(f, t.replace('[mcp_servers.canvas]', '[mcp_servers.canvas]\nenv_vars = ["CANVAS_URL", "CANVAS_ID"]'))
  } catch {}
  return true
}
async function opencode() {
  const f = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc')
  try {
    const raw = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{}'
    const j = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''))
    j.mcp = { ...j.mcp, canvas: { type: 'local', command: [process.execPath, MCP], environment: { ELECTRON_RUN_AS_NODE: '1' }, enabled: true } }
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(j, null, 2))
    return true
  } catch { return false } // shortcut: JSONC with block comments/trailing commas is skipped
}

const AGENTS = { claude, gemini, agy, codex, opencode }

async function registerAll() {
  const done = {}
  for (const [bin, fn] of Object.entries(AGENTS)) {
    if (await has(bin)) done[bin] = await fn()
  }
  return done
}

module.exports = { registerAll }
