// Command typed into the shell to start (or resume) an agent CLI. '' = plain shell.
// sid: conversation id assigned by the canvas; resume: this terminal already ran before.
// Resume flags are per CLI; antigravity has no verified one, so it starts fresh.
const PROMPT_FLAG = { gemini: '-i ', antigravity: '-i ', opencode: '--prompt ' }
const SESSION = {
  claude: { start: (sid) => `--session-id ${sid} `, resume: (sid) => `--resume ${sid}` },
  gemini: { start: () => '', resume: () => '--resume latest' },
  codex: { start: () => '', resume: () => 'resume --last' },
  opencode: { start: () => '', resume: () => '--continue' },
}

function launchCommand(S, preset, line, { resume, sid } = {}) {
  const cmd = S.commands[preset]
  if (!cmd) return ''
  const s = SESSION[preset]
  if (resume && s) return `${cmd} ${s.resume(sid)}`
  if (!S.sendBriefing) return s ? `${cmd} ${s.start(sid)}`.trim() : cmd
  return `${cmd} ${s ? s.start(sid) : ''}${PROMPT_FLAG[preset] || ''}"${line}"`
}

module.exports = { launchCommand }
