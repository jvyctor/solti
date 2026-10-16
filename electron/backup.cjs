// Crash-safe saves for workspace.json: atomic write, rolling backups, restore from the newest valid backup.
const fs = require('fs')
const path = require('path')

const EVERY = 10 * 60 * 1000 // at most one backup per 10 minutes
const KEEP = 20

const dirOf = (file) => path.join(path.dirname(file), 'backups')
const names = (dir) => { try { return fs.readdirSync(dir).filter((f) => /^workspace-\d+\.json$/.test(f)).sort() } catch { return [] } }
const valid = (f) => { try { return Array.isArray(JSON.parse(fs.readFileSync(f, 'utf8')).list) } catch { return false } }

// Copies the current (valid) file into backups/ before it gets overwritten.
function rotate(file, now = Date.now()) {
  if (!fs.existsSync(file) || !valid(file)) return
  const dir = dirOf(file)
  const all = names(dir)
  const last = all.at(-1)
  if (last && now - Number(last.match(/\d+/)[0]) < EVERY) return
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(file, path.join(dir, `workspace-${now}.json`))
  for (const old of names(dir).slice(0, -KEEP)) fs.rmSync(path.join(dir, old), { force: true })
}

// A crash mid-write leaves the old file intact instead of a half-written one.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

// Newest backup that still parses, or null.
function restore(file) {
  const dir = dirOf(file)
  for (const n of names(dir).reverse()) {
    if (valid(path.join(dir, n))) return { name: n, data: JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) }
  }
  return null
}

module.exports = { rotate, writeAtomic, restore, dirOf }
