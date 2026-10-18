// Command typed into the shell to start (or resume) an agent CLI. '' = plain shell.
// sid: conversation id assigned by the canvas; resume: this terminal already ran before.
// Resume flags are per CLI (taken from each CLI's --help). Gemini is given the canvas id so its token use can be found; its resume takes "latest" per project folder.
const PROMPT_FLAG = { gemini: '-i ', antigravity: '-i ', opencode: '--prompt ' }
const SESSION = {
  claude: { start: (sid) => `--session-id ${sid} `, resume: (sid) => `--resume ${sid}` },
  gemini: { start: (sid) => `--session-id ${sid} `, resume: () => '--resume latest' },
  codex: { start: () => '', resume: () => 'resume --last' },
  opencode: { start: () => '', resume: () => '--continue' },
  antigravity: { start: () => '', resume: () => '--continue' },
}

// extra: flags right after the command (e.g. Claude Code's --settings with the status hooks, see hooks.cjs).
function launchCommand(S, preset, line, { resume, sid, extra } = {}) {
  const base = S.commands[preset]
  if (!base) return ''
  const cmd = extra ? `${base} ${extra}` : base
  const s = SESSION[preset]
  if (resume && s) return `${cmd} ${s.resume(sid)}`
  if (!S.sendBriefing) return s ? `${cmd} ${s.start(sid)}`.trim() : cmd
  return `${cmd} ${s ? s.start(sid) : ''}${PROMPT_FLAG[preset] || ''}"${line}"`
}

module.exports = { launchCommand }
