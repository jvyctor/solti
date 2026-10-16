import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from '../src/status.js'

test('questions and approval prompts mean the agent waits for you', () => {
  assert.equal(classify(['Done editing.', 'Do you want to proceed?']), 'input')
  assert.equal(classify(['Run rm -rf build? (y/n)']), 'input')
  assert.equal(classify(['Allow this command once?', '', '']), 'input')
  assert.equal(classify(['Press Enter to continue']), 'input')
})

test('plain output and shell prompts are idle', () => {
  assert.equal(classify(['All 12 tests passed.', 'PS C:\\proj>']), 'idle')
  assert.equal(classify([]), 'idle')
})

test('only the last lines count', () => {
  assert.equal(classify(['Really delete?', 'a', 'b', 'c', 'd', 'finished']), 'idle')
})
