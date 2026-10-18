// node build/update-info.cjs <installer.exe> <version>
// Rebuilds the auto-update files for a Windows installer: <installer>.blockmap and latest.yml next to it.
// Needed after code signing: signing changes the file, so the hash electron-builder wrote no longer matches and
// electron-updater would reject the download. Uses electron-builder's own blockmap code, so the output is identical
// to what it produces for an unsigned build.
const fs = require('fs')
const path = require('path')
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap')

async function updateInfo(exe, version, releaseDate = new Date().toISOString()) {
  const { size, sha512 } = await buildBlockMap(exe, 'gzip', exe + '.blockmap')
  const name = path.basename(exe)
  const yml = [
    `version: ${version}`,
    'files:',
    `  - url: ${name}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${name}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(path.dirname(exe), 'latest.yml'), yml)
  return { size, sha512, yml }
}

module.exports = { updateInfo }

if (require.main === module) {
  const [exe, version] = process.argv.slice(2)
  if (!exe || !version || !fs.existsSync(exe)) { console.error('usage: node build/update-info.cjs <installer.exe> <version>'); process.exit(1) }
  updateInfo(path.resolve(exe), version).then((r) => console.log(r.yml))
}
