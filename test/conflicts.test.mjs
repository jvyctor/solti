// Review helpers: overlapping files between worktree agents, diff line numbers, the review message.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overlapKeys, overlaps, patchLines, reviewMessage } from '../src/conflicts.js'

test('files changed by two agents of the same repo overlap; other repos do not', () => {
  const r = overlaps([
    { id: 'a', repo: 'R', files: ['src/x.js', 'README.md'] },
    { id: 'b', repo: 'R', files: ['src/x.js', 'src/y.js'] },
    { id: 'c', repo: 'Q', files: ['src/x.js'] },
    { id: 'd', repo: 'R', files: ['src/x.js'] },
  ])
  assert.deepEqual(r, [{ file: 'src/x.js', repo: 'R', agents: ['a', 'b', 'd'] }])
  assert.deepEqual([...overlapKeys(r)], ['src/x.js|a|b|d'])
  assert.deepEqual(overlaps([{ id: 'a', repo: 'R', files: ['f'] }]), [])
})

test('diff lines carry their old and new line numbers', () => {
  const p = ['diff --git a/f b/f', '--- a/f', '+++ b/f', '@@ -10,3 +10,4 @@ fn', ' keep', '-old', '+new1', '+new2', ' tail', '\\ No newline at end of file'].join('\n')
  const l = patchLines(p)
  assert.deepEqual(l.map((x) => x.kind), ['meta', 'meta', 'meta', 'hunk', 'ctx', 'del', 'add', 'add', 'ctx', 'meta'])
  assert.deepEqual(l.filter((x) => x.kind !== 'meta' && x.kind !== 'hunk').map((x) => [x.old, x.new]), [[10, 10], [11, undefined], [undefined, 11], [undefined, 12], [12, 13]])
})

test('comments become one instruction with file:line and the code', () => {
  const m = reviewMessage([
    { file: 'src/a.js', line: 12, code: '  const x = 1', text: 'use let' },
    { file: 'src/b.js', line: 3, removed: true, code: 'check()', text: 'keep this check' },
  ], { branch: 'agent/dev' })
  assert.equal(m, [
    'Revisão das suas mudanças na branch agent/dev. Ajuste cada ponto:',
    '- src/a.js:12 (`const x = 1`): use let',
    '- src/b.js, linha 3 removida (`check()`): keep this check',
    'Ao terminar, chame canvas_done com o que mudou.',
  ].join('\n'))
  assert.equal(reviewMessage([]), '')
})
