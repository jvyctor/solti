// Ending a terminal must end everything started in it: the shell, the agent CLI and whatever the agent launched
// (MCP servers, dev servers, test runners). Killing only the shell leaves those running, holding ports and files.
//
// Windows: `taskkill /T` walks the tree. macOS/Linux: an interactive shell puts each command in its own process
// group, so killing the shell's group is not enough; the descendants are found with `ps` and killed, deepest first.
const { execFile, execFileSync } = require('child_process')

const pidsOf = (list) => list.map(Number).filter((p) => Number.isInteger(p) && p > 0)
const taskkillArgs = (pids) => ['/T', '/F', ...pids.flatMap((p) => ['/PID', String(p)])]

// "pid ppid" lines (ps -A -o pid=,ppid=) -> every descendant of `roots`, children after their parents.
function descendants(psOutput, roots) {
  const kids = new Map()
  for (const line of String(psOutput).split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)
    if (!pid || !Number.isInteger(ppid)) continue
    if (!kids.has(ppid)) kids.set(ppid, [])
    kids.get(ppid).push(pid)
  }
  const out = []
  const seen = new Set(roots)
  const queue = [...roots]
  while (queue.length) {
    for (const k of kids.get(queue.shift()) || []) {
      if (seen.has(k)) continue
      seen.add(k)
      out.push(k)
      queue.push(k)
    }
  }
  return out
}

function killUnix(roots, psOutput) {
  const all = [...descendants(psOutput, roots).reverse(), ...roots]
  for (const pid of all) {
    try { process.kill(-pid, 'SIGKILL') } catch {} // its process group, if it leads one
    try { process.kill(pid, 'SIGKILL') } catch {}
  }
}

const psSync = () => { try { return execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 5000 }) } catch { return '' } }

// Fire and forget: used while the app keeps running.
function killTree(pid) {
  const [p] = pidsOf([pid])
  if (!p) return
  if (process.platform === 'win32') return execFile('taskkill', taskkillArgs([p]), { windowsHide: true }, () => {})
  execFile('ps', ['-A', '-o', 'pid=,ppid='], { timeout: 5000 }, (_e, out) => killUnix([p], out || ''))
}

// Blocking, one call for all trees: used on quit, when there is no later tick to wait for.
function killTreesSync(list) {
  const pids = pidsOf(list)
  if (!pids.length) return
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', taskkillArgs(pids), { windowsHide: true, stdio: 'ignore', timeout: 8000 }) } catch {}
  } else killUnix(pids, psSync())
}

module.exports = { killTree, killTreesSync, taskkillArgs, descendants }
