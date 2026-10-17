// Turns the keystrokes sent to a terminal into the lines you typed, for the agent's history. No Electron here (tested alone).
// Escape sequences (arrows, function keys) are dropped, Backspace edits, Ctrl+C / Ctrl+U clear the line, and inside a
// bracketed paste Enter is part of the text. Approximate by nature: a shell's own history recall is not seen.
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1bO.|\x1b[^[\]]/g
const ESC_AT_START = /^(?:\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1bO.|\x1b[^[\]]?)/
// A line typed right after one of these prompts is not recorded.
const SECRET_PROMPT = /pass(word|phrase)?|senha|token|secret|api[ _-]?key|\bpin\b|\botp\b|2fa/i

// Last non-empty line of terminal output, without colors.
function lastLine(buf) {
  const lines = String(buf).slice(-1500).replace(ANSI, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.at(-1) || ''
}

// state: { line, paste } kept per terminal. onLine(text) gets each finished, non-empty line.
// output(): the terminal's recent output, checked for a password prompt when a line ends.
function feed(state, data, onLine, output = () => '') {
  const s = String(data)
  const flush = () => {
    const text = state.line.trim()
    state.line = ''
    if (text && !SECRET_PROMPT.test(lastLine(output()))) onLine(text)
  }
  for (let i = 0; i < s.length;) {
    if (s.startsWith('\x1b[200~', i)) { state.paste = true; i += 6; continue }
    if (s.startsWith('\x1b[201~', i)) { state.paste = false; i += 6; continue }
    if (s[i] === '\x1b') { i += ESC_AT_START.exec(s.slice(i))?.[0].length || 1; continue }
    const ch = s[i++]
    if (ch === '\r' || ch === '\n') { if (state.paste) state.line += '\n'; else flush(); continue }
    if (ch === '\x7f' || ch === '\b') state.line = state.line.slice(0, -1)
    else if (ch === '\x03' || ch === '\x15') state.line = ''
    else if (ch >= ' ') state.line += ch
  }
  state.line = state.line.slice(-4000)
}

module.exports = { feed, lastLine, SECRET_PROMPT }
