// Live agent status from terminal output. 'working' is set while output flows; when it settles,
// the last lines decide between waiting for the user ('input') and done/idle ('idle').
const ASKS = /\?\s*$|\(y\/n\)|\[y\/n\]|\[yes\/no\]|press enter|do you want|would you like|allow (this|once|always)|approve|permission|continue\?|esc to cancel/i

export const classify = (lines) => {
  const tail = lines.map((l) => l.trim()).filter(Boolean).slice(-4)
  return tail.some((l) => ASKS.test(l)) ? 'input' : 'idle'
}

export const STATUS = {
  working: { label: 'Trabalhando', color: 'var(--accent)' },
  input: { label: 'Esperando você', color: 'var(--maestro)' },
  idle: { label: 'Ocioso', color: 'var(--success)' },
  exited: { label: 'Encerrado', color: 'var(--text-3)' },
  limit: { label: 'Limite de tokens', color: 'var(--danger)' },
}
