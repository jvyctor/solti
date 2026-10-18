// Exact agent status from the CLI's own hooks instead of guessing from terminal output.
// Claude Code: a settings file passed with --settings adds hooks that run `canvas hook <event>` (bin/canvas.cjs);
// the terminal's environment (CANVAS_URL, CANVAS_ID) tells the bridge which agent it is. Other CLIs keep the
// output-based status (src/status.js).
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// event -> the status it means (see the bridge's /hook route).
const hook = (event) => [{ hooks: [{ type: 'command', command: `canvas hook ${event}`, timeout: 10 }] }]
const CLAUDE = {
  hooks: {
    UserPromptSubmit: hook('prompt'),
    PostToolUse: hook('tool'),
    Notification: hook('notification'),
    Stop: hook('stop'),
  },
}

let file = ''
// Path of the settings file (written once per run), or '' when it cannot be written.
function claudeSettings() {
  if (file) return file
  try {
    const f = path.join(app.getPath('userData'), 'hooks', 'claude-settings.json')
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(CLAUDE, null, 2))
    file = f
  } catch {}
  return file
}

// Extra flags for the CLI command line ('' = none).
function hookFlags(preset, enabled) {
  if (!enabled || preset !== 'claude') return ''
  const f = claudeSettings()
  return f ? `--settings "${f}"` : ''
}

// Hook event (+ what the CLI sent on stdin) -> status, or null to ignore.
// Notification covers permission prompts and questions to the user; the 60 s "still waiting" reminder changes nothing.
function statusOf(event, input = {}) {
  if (event === 'prompt' || event === 'tool') return { status: 'working' }
  if (event === 'stop') return { status: 'idle' }
  if (event === 'notification') {
    const type = String(input.notification_type || '')
    const msg = String(input.message || '')
    if (type === 'idle_prompt' || type === 'auth_success' || /waiting for your input/i.test(msg)) return null
    return { status: 'input', detail: msg.slice(0, 200) }
  }
  return null
}

module.exports = { hookFlags, statusOf, CLAUDE }
