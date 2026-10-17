// What you type into an agent becomes lines in its history.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { feed, lastLine } = createRequire(import.meta.url)('../electron/inputlog.cjs')
const typed = (chunks, output = '') => {
  const st = { line: '', paste: false }
  const lines = []
  for (const c of chunks) feed(st, c, (l) => lines.push(l), () => output)
  return { lines, st }
}

test('keystrokes become lines; Backspace edits, Ctrl+C and Ctrl+U clear', () => {
  assert.deepEqual(typed(['o', 'l', 'a', '\r']).lines, ['ola'])
  assert.deepEqual(typed(['corrja', '\x7f\x7f', 'ija o teste\r']).lines, ['corrija o teste'])
  assert.deepEqual(typed(['esquece', '\x03', 'faça X\r']).lines, ['faça X'])
  assert.deepEqual(typed(['abc', '\x15', 'def\r']).lines, ['def'])
  assert.deepEqual(typed(['\r', '   \r']).lines, [], 'empty lines are not recorded')
})

test('arrows and other escape sequences are skipped, not typed', () => {
  assert.deepEqual(typed(['ab', '\x1b[D', '\x1b[C', '\x1bOA', 'c\r']).lines, ['abc'])
  assert.deepEqual(typed(['\x1b', 'x\r']).lines, ['x'], 'a lone Esc does not swallow the next key')
})

test('a bracketed paste keeps its newlines inside one entry', () => {
  assert.deepEqual(typed(['\x1b[200~linha 1\rlinha 2\x1b[201~', '\r']).lines, ['linha 1\nlinha 2'])
})

test('a line typed right after a password or token prompt is not recorded', () => {
  assert.deepEqual(typed(['hunter2\r'], 'Login\r\n\x1b[1mPassword:\x1b[0m ').lines, [])
  assert.deepEqual(typed(['sk-123\r'], 'Cole sua API key: ').lines, [])
  assert.deepEqual(typed(['segredo\r'], 'Digite a senha').lines, [])
  assert.deepEqual(typed(['implemente o login\r'], '> ').lines, ['implemente o login'])
  assert.equal(lastLine('a\r\n\x1b[32mb\x1b[0m\r\n\r\n'), 'b')
})

test('a very long line is capped', () => {
  const { st } = typed(['x'.repeat(5000)])
  assert.equal(st.line.length, 4000)
})
