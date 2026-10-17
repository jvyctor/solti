// node-pty's macOS/Linux "spawn-helper" can arrive without the execute bit (npm tarballs, some extractors). Without it
// every terminal fails with "posix_spawnp failed". Run after install (postinstall) so the packaged app carries it +x.
const fs = require('fs')
const path = require('path')

function helpers(root) {
  const out = [path.join(root, 'build', 'Release', 'spawn-helper')]
  try { for (const d of fs.readdirSync(path.join(root, 'prebuilds'))) out.push(path.join(root, 'prebuilds', d, 'spawn-helper')) } catch {}
  return out.filter((f) => fs.existsSync(f))
}

// Returns the files it made executable.
function fix(root) {
  const fixed = []
  for (const f of helpers(root)) {
    try {
      if ((fs.statSync(f).mode & 0o111) !== 0o111) { fs.chmodSync(f, 0o755); fixed.push(f) }
    } catch {}
  }
  return fixed
}

module.exports = { fix, helpers }

if (require.main === module && process.platform !== 'win32') {
  let root
  try { root = path.dirname(require.resolve('node-pty/package.json')) } catch { process.exit(0) }
  const fixed = fix(root)
  if (fixed.length) console.log('node-pty: made executable', fixed.map((f) => path.relative(process.cwd(), f)).join(', '))
}
