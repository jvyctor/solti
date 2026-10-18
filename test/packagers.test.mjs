// Package manager manifests: right URLs, hashes and install steps for a given release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { scoop, cask, winget, aur } = createRequire(import.meta.url)('../build/package-managers.cjs')
const v = '1.2.3'
const h = (c) => c.repeat(64)
const d = { [`Solti-Setup-${v}.exe`]: h('a'), [`Solti-${v}-arm64-mac.zip`]: h('b'), [`Solti-${v}-mac.zip`]: h('c'), [`Solti-${v}.deb`]: h('d') }
const base = `https://github.com/jvyctor/solti/releases/download/v${v}`

test('Scoop extracts the app from the NSIS installer and marks it as managed', () => {
  const m = JSON.parse(scoop(v, d))
  assert.equal(m.version, v)
  assert.equal(m.architecture['64bit'].url, `${base}/Solti-Setup-${v}.exe#/dl.7z`)
  assert.equal(m.architecture['64bit'].hash, h('a'))
  assert.match(m.installer.script[0], /\$PLUGINSDIR\\app-64\.7z/)
  assert.match(m.installer.script.at(-1), /\.managed-by.*scoop/)
  assert.deepEqual(m.shortcuts, [['Solti.exe', 'Solti']])
  assert.match(m.autoupdate.architecture['64bit'].url, /\$version/)
})

test('the Homebrew cask picks the zip per architecture', () => {
  const c = cask(v, d)
  assert.match(c, new RegExp(`version "${v}"`))
  assert.match(c, new RegExp(`arm:\\s+"${h('b')}"`))
  assert.match(c, new RegExp(`intel: "${h('c')}"`))
  assert.match(c, /Solti-#\{version\}-#\{arch\}mac\.zip/)
  assert.match(c, /arch arm: "arm64-", intel: ""/)
})

test('winget: three manifests with the uppercase hash and quoted descriptions', () => {
  const w = winget(v, d)
  assert.deepEqual(Object.keys(w).sort(), ['jvyctor.Solti.installer.yaml', 'jvyctor.Solti.locale.en-US.yaml', 'jvyctor.Solti.yaml'])
  assert.match(w['jvyctor.Solti.installer.yaml'], new RegExp(`InstallerSha256: ${h('A')}`))
  assert.match(w['jvyctor.Solti.installer.yaml'], /InstallerType: nullsoft/)
  assert.match(w['jvyctor.Solti.locale.en-US.yaml'], /^Description: '.*'$/m)
})

test('AUR: PKGBUILD and .SRCINFO agree on version, source and hash', () => {
  const a = aur(v, d)
  assert.match(a.PKGBUILD, new RegExp(`pkgver=${v.replace(/\./g, '\\.')}`))
  assert.match(a.PKGBUILD, new RegExp(`sha256sums=\\('${h('d')}'\\)`))
  assert.match(a.PKGBUILD, /echo pacman > .*\.managed-by/)
  assert.match(a['.SRCINFO'], new RegExp(`source = Solti-${v}\\.deb::${base.replace(/[.]/g, '\\.')}/Solti-${v}\\.deb`))
  assert.match(a['.SRCINFO'], new RegExp(`sha256sums = ${h('d')}`))
})

test('a missing asset fails loudly instead of writing a broken manifest', () => {
  assert.throws(() => scoop(v, {}), /asset missing/)
})
