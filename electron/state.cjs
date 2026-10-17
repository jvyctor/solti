// State shared by the main-process modules (terminals, bridge, window, ipc) and the small helpers around it.
const crypto = require('crypto')
const path = require('path')

const S = {
  TOKEN: crypto.randomBytes(16).toString('hex'), // the bridge's secret (travels in CANVAS_URL)
  ptys: new Map(), // terminal id -> { p, buf, cwd, cols, rows, last, line }
  graph: { nodes: [], edges: [], knowledge: {} }, // the renderer's view of every workspace (knowledge: ws id -> notes)
  win: null,
  bridgePort: 0,
  portals: new Map(), // portal node id -> webContents id of its <webview>
  outputListeners: new Set(), // phone remote: live terminal output
}

// Terminals keep printing for a moment after the window closes; sending to a destroyed window throws.
S.toRenderer = (ch, ...args) => {
  const w = S.win
  if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(ch, ...args)
}

S.nameOf = (id) => S.graph.nodes.find((n) => n.id === id)?.name

// Peers = edge neighbours. The workspace's maestro also reaches every terminal there, and vice versa.
S.peersOf = (id) => {
  const me = S.graph.nodes.find((n) => n.id === id)
  if (!me) return []
  const ids = new Set(S.graph.edges.filter((e) => e.source === id || e.target === id).map((e) => (e.source === id ? e.target : e.source)))
  for (const n of S.graph.nodes) {
    if (n.ws !== me.ws || n.id === id) continue
    if (me.maestro || n.maestro) ids.add(n.id)
  }
  return S.graph.nodes.filter((n) => ids.has(n.id))
}

// Files inside app.asar cannot be executed; scripts in bin/ are unpacked next to it.
S.unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
S.wsFile = () => path.join(require('electron').app.getPath('userData'), 'workspace.json')

// TUIs (Claude, Codex…) treat one fast write as a paste: a trailing \r is then a newline, not "submit".
// Send the text first and Enter separately, after the paste settles.
S.typeInto = (entry, text) => {
  entry.p.write(String(text).replace(/\r?\n/g, ' '))
  setTimeout(() => entry.p.write('\r'), 300)
}

// Emergency stop: Esc (cancels the current turn in most TUIs) then Ctrl+C.
S.interrupt = (entry) => { entry.p.write('\x1b'); setTimeout(() => entry.p.write('\x03'), 150) }
S.interruptId = (id) => (id ? S.ptys.has(id) && S.interrupt(S.ptys.get(id)) : [...S.ptys.values()].forEach(S.interrupt))

module.exports = S
