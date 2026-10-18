// Package manager manifests for a published release, from the sha256 GitHub records for each asset:
//   bucket/solti.json        Scoop     scoop bucket add solti https://github.com/jvyctor/solti; scoop install solti
//   Casks/solti.rb           Homebrew  brew tap jvyctor/solti https://github.com/jvyctor/solti; brew install --cask solti
//   packaging/winget/…       winget    winget install jvyctor.Solti (after the first submission to microsoft/winget-pkgs)
//   packaging/aur/…          AUR       yay -S solti-bin
// Usage: node build/package-managers.cjs <version>   (GITHUB_TOKEN raises the API rate limit; not required)
// Run by the Release workflow after every installer is uploaded (the Windows one may be re-signed, so it goes last).
const fs = require('fs')
const path = require('path')
const pkg = require('../package.json')

const REPO = 'jvyctor/solti'
const ROOT = path.join(__dirname, '..')
const HOME = 'https://jvyctor.github.io/solti/'
const SUMMARY = 'Run a team of AI coding agents side by side on one canvas'
const dl = (v, f) => `https://github.com/${REPO}/releases/download/v${v}/${f}`

async function digests(version) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'solti-release' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, { headers })
  if (!r.ok) throw new Error(`release v${version}: HTTP ${r.status}`)
  const rel = await r.json()
  return Object.fromEntries(rel.assets.filter((a) => a.digest?.startsWith('sha256:')).map((a) => [a.name, a.digest.slice(7)]))
}

const need = (d, name) => {
  if (!d[name]) throw new Error(`asset missing from the release: ${name}`)
  return d[name]
}

// Scoop: the NSIS installer is a 7z archive; take the app out of it (no installer, no uninstaller entry) and mark it so
// the app leaves updates to Scoop (electron/updater.cjs reads resources/.managed-by).
function scoop(v, d) {
  return JSON.stringify({
    version: v,
    description: pkg.description,
    homepage: HOME,
    license: 'MIT',
    architecture: { '64bit': { url: `${dl(v, `Solti-Setup-${v}.exe`)}#/dl.7z`, hash: need(d, `Solti-Setup-${v}.exe`) } },
    installer: {
      script: [
        'Expand-7zipArchive "$dir\\`$PLUGINSDIR\\app-64.7z" "$dir"',
        'Remove-Item "$dir\\`$PLUGINSDIR", "$dir\\`$R0", "$dir\\Uninstall Solti.exe", "$dir\\uninstallerIcon.ico" -Recurse -Force -ErrorAction SilentlyContinue',
        'Set-Content -Path "$dir\\resources\\.managed-by" -Value "scoop" -Encoding Ascii',
      ],
    },
    shortcuts: [['Solti.exe', 'Solti']],
    checkver: { github: `https://github.com/${REPO}` },
    autoupdate: { architecture: { '64bit': { url: `https://github.com/${REPO}/releases/download/v$version/Solti-Setup-$version.exe#/dl.7z` } } },
  }, null, 4) + '\n'
}

// Homebrew cask (this repository is the tap). The app is not notarized: the quarantine flag is cleared after install.
function cask(v, d) {
  return `cask "solti" do
  arch arm: "arm64-", intel: ""

  version "${v}"
  sha256 arm:   "${need(d, `Solti-${v}-arm64-mac.zip`)}",
         intel: "${need(d, `Solti-${v}-mac.zip`)}"

  url "https://github.com/${REPO}/releases/download/v#{version}/Solti-#{version}-#{arch}mac.zip"
  name "Solti"
  desc "${SUMMARY}"
  homepage "${HOME}"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :monterey"

  app "Solti.app"

  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Solti.app"]
  end

  zap trash: [
    "~/Library/Application Support/Agent Canvas",
    "~/Library/Application Support/Solti",
    "~/Library/Preferences/com.agentcanvas.app.plist",
    "~/Library/Saved Application State/com.agentcanvas.app.savedState",
  ]

  caveats <<~EOS
    Solti is not notarized by Apple yet; this cask clears the quarantine flag so it opens normally.
    Update with: brew upgrade --cask solti
  EOS
end
`
}

// winget (manifest schema 1.6): version, installer and default locale files.
function winget(v, d) {
  const id = 'jvyctor.Solti'
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'" // YAML single-quoted (the description has colons)
  const head = (type) => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.1.6.0.schema.json\n`
  const common = `PackageIdentifier: ${id}\nPackageVersion: ${v}\n`
  return {
    [`${id}.yaml`]: `${head('version')}${common}DefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.6.0\n`,
    [`${id}.installer.yaml`]: `${head('installer')}${common}InstallerType: nullsoft\nScope: user\nUpgradeBehavior: install\nReleaseDate: ${new Date().toISOString().slice(0, 10)}\nInstallers:\n- Architecture: x64\n  InstallerUrl: ${dl(v, `Solti-Setup-${v}.exe`)}\n  InstallerSha256: ${need(d, `Solti-Setup-${v}.exe`).toUpperCase()}\nManifestType: installer\nManifestVersion: 1.6.0\n`,
    [`${id}.locale.en-US.yaml`]: `${head('defaultLocale')}${common}PackageLocale: en-US\nPublisher: João Vyctor\nPublisherUrl: https://github.com/jvyctor\nPublisherSupportUrl: https://github.com/${REPO}/issues\nPackageName: Solti\nPackageUrl: ${HOME}\nLicense: MIT\nLicenseUrl: https://github.com/${REPO}/blob/main/LICENSE\nShortDescription: ${q(SUMMARY)}\nDescription: ${q(pkg.description)}\nTags:\n- ai\n- agents\n- claude-code\n- codex\n- gemini-cli\n- terminal\nReleaseNotesUrl: https://github.com/${REPO}/releases/tag/v${v}\nManifestType: defaultLocale\nManifestVersion: 1.6.0\n`,
  }
}

// AUR solti-bin: the .deb's files (the app goes to /opt/Solti), a solti command, and the managed-by mark.
function aur(v, d) {
  const sha = need(d, `Solti-${v}.deb`)
  const deps = ['gtk3', 'nss', 'alsa-lib', 'libxss', 'libxtst', 'xdg-utils', 'libsecret']
  const pkgbuild = `# Maintainer: João Vyctor <https://github.com/jvyctor>
# Generated by build/package-managers.cjs in ${REPO}; do not edit by hand.
pkgname=solti-bin
pkgver=${v}
pkgrel=1
pkgdesc="${SUMMARY}"
arch=('x86_64')
url="${HOME}"
license=('MIT')
depends=(${deps.map((x) => `'${x}'`).join(' ')})
provides=('solti')
conflicts=('solti')
options=('!strip' '!debug')
source=("Solti-\${pkgver}.deb::https://github.com/${REPO}/releases/download/v\${pkgver}/Solti-\${pkgver}.deb")
sha256sums=('${sha}')

package() {
  bsdtar -xf data.tar.* -C "\${pkgdir}"
  install -d "\${pkgdir}/usr/bin"
  ln -sf /opt/Solti/solti "\${pkgdir}/usr/bin/solti"
  echo pacman > "\${pkgdir}/opt/Solti/resources/.managed-by"
  install -Dm644 "\${pkgdir}/opt/Solti/LICENSE.electron.txt" "\${pkgdir}/usr/share/licenses/\${pkgname}/LICENSE.electron.txt" 2>/dev/null || true
}
`
  const srcinfo = `pkgbase = solti-bin
\tpkgdesc = ${SUMMARY}
\tpkgver = ${v}
\tpkgrel = 1
\turl = ${HOME}
\tarch = x86_64
\tlicense = MIT
${deps.map((x) => `\tdepends = ${x}`).join('\n')}
\tprovides = solti
\tconflicts = solti
\toptions = !strip
\toptions = !debug
\tsource = Solti-${v}.deb::https://github.com/${REPO}/releases/download/v${v}/Solti-${v}.deb
\tsha256sums = ${sha}

pkgname = solti-bin
`
  return { PKGBUILD: pkgbuild, '.SRCINFO': srcinfo }
}

async function main(version) {
  const d = await digests(version)
  const write = (rel, text) => {
    const f = path.join(ROOT, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, text)
    console.log('wrote', rel)
  }
  write('bucket/solti.json', scoop(version, d))
  write('Casks/solti.rb', cask(version, d))
  fs.rmSync(path.join(ROOT, 'packaging', 'winget'), { recursive: true, force: true }) // one version at a time
  for (const [f, t] of Object.entries(winget(version, d))) write(`packaging/winget/${f}`, t)
  for (const [f, t] of Object.entries(aur(version, d))) write(`packaging/aur/${f}`, t)
}

module.exports = { scoop, cask, winget, aur }
if (require.main === module) {
  const v = process.argv[2] || pkg.version
  main(v).catch((e) => { console.error(e.message); process.exit(1) })
}
