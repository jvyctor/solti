// "What's new" reads the bundled CHANGELOG.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cmpVersion, inline, parseChangelog, releasesBetween } from '../src/changelog.js'

const md = `# Changelog

## [Unreleased]
### Added
- not released yet

## [0.9.0] - 2026-10-20
Intro line with **bold**.
### Added
- **Templates**: share [teams](https://x) and \`pipelines\`
  - nested detail
### Fixed
- a bug

## [0.6.0] – [0.6.2] - 2026-10-16
### Added
- phone remote

[0.9.0]: https://github.com/x/y/releases/tag/v0.9.0
`

test('versions compare numerically', () => {
  assert.equal(cmpVersion('0.10.0', '0.9.9'), 1)
  assert.equal(cmpVersion('1.2.3', '1.2.3'), 0)
  assert.equal(cmpVersion('0.8.2', '0.8.10'), -1)
})

test('parses releases, skips Unreleased and link references, folds nested bullets, keeps the last version of a range', () => {
  const r = parseChangelog(md)
  assert.deepEqual(r.map((x) => x.version), ['0.9.0', '0.6.2'])
  assert.equal(r[0].date, '2026-10-20')
  assert.deepEqual(r[0].intro, ['Intro line with **bold**.'])
  assert.deepEqual(r[0].groups.map((g) => g.title), ['Added', 'Fixed'])
  assert.equal(r[0].groups[0].items[0], '**Templates**: share [teams](https://x) and `pipelines` · nested detail')
})

test('an update shows every release after the old version up to the new one', () => {
  const r = parseChangelog(md)
  assert.deepEqual(releasesBetween(r, '0.6.2', '0.9.0').map((x) => x.version), ['0.9.0'])
  assert.deepEqual(releasesBetween(r, '0.5.0', '0.9.0').map((x) => x.version), ['0.9.0', '0.6.2'])
  assert.deepEqual(releasesBetween(r, '0.9.0', '0.9.0'), [])
})

test('inline markdown becomes segments', () => {
  assert.deepEqual(inline('a **b** `c` [d](e) f'), [{ t: 'a ' }, { t: 'b', bold: true }, { t: ' ' }, { t: 'c', code: true }, { t: ' ' }, { t: 'd', href: 'e' }, { t: ' f' }])
})

test('the real CHANGELOG parses and its newest entry matches package.json', () => {
  const real = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'))
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(real.length >= 5)
  assert.equal(real[0].version, version, 'CHANGELOG has a section for the current version')
  assert.ok(real[0].groups.some((g) => g.items.length))
})
