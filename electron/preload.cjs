const { contextBridge, ipcRenderer } = require('electron')

const on = (ch, cb) => {
  const h = (_e, ...a) => cb(...a)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

contextBridge.exposeInMainWorld('api', {
  spawn: (id, opts) => ipcRenderer.invoke('pty:spawn', id, opts),
  ls: (dir) => ipcRenderer.invoke('fs:list', dir),
  brief:(id, o) => ipcRenderer.send('pty:brief', id, o),
  write: (id, d) => ipcRenderer.send('pty:write', id, d),
  resize: (id, c, r) => ipcRenderer.send('pty:resize', id, c, r),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: (cb) => on('pty:data', cb),
  onExit: (cb) => on('pty:exit', cb),
  onNote: (cb) => on('note', cb),
  onSpawn: (cb) => on('spawn', cb),
  onComm: (cb) => on('comm', cb),
  onSettings: (cb) => on('settings', cb),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openData: () => ipcRenderer.send('app:open-data'),
  updateGraph: (g) => ipcRenderer.send('graph:update', g),
  usage: () => ipcRenderer.invoke('usage:get'),
  load: () => ipcRenderer.invoke('ws:load'),
  save: (d) => ipcRenderer.send('ws:save', d),
  onUpdate: (cb) => on('update:state', cb),
  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.send('update:check'),
  updateDownload: () => ipcRenderer.send('update:download'),
  updateInstall: () => ipcRenderer.send('update:install'),
  updateToken: (t) => ipcRenderer.invoke('update:token', t),
  termSave: (id, text) => ipcRenderer.send('term:save', id, text),
  termLoad: (id) => ipcRenderer.invoke('term:load', id),
})
