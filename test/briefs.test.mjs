// Agents are briefed in the app's language: same briefings, skills and typed lines in Portuguese and English.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const briefs = req('../electron/briefs.cjs')
const { SKILLS_PT, SKILLS_EN } = req('../electron/skills.cjs')
const PT_WORDS = /\b(você|não|para|com|uma|agente executor|orquestrador deste|Responda|Leia e siga|sem resposta|tarefa)\b/i

test('briefings exist in both languages with the same parts', () => {
  assert.deepEqual(Object.keys(briefs.en).sort(), Object.keys(briefs.pt).sort())
  assert.equal(briefs.forLang('en'), briefs.en)
  assert.equal(briefs.forLang('pt'), briefs.pt)
  assert.equal(briefs.forLang('xx'), briefs.pt, 'unknown language falls back to Portuguese')
})

test('the English briefing and agent messages carry no Portuguese', () => {
  const b = briefs.en
  const texts = [b.maestro('lead'), b.agent('dev'), b.instructions('Review the diff'), b.knowledge(''), b.knowledge('- use pnpm'), b.readLine('/tmp/b.md'), b.askReply('lead'), b.askTimeout(50)]
  for (const t of texts) assert.doesNotMatch(t, PT_WORDS, t.slice(0, 80))
  assert.match(b.maestro('lead'), /# Role: MAESTRO/)
  assert.match(b.agent('dev'), /canvas_done/)
})

test('the line typed into the shell is plain ASCII in both languages', () => {
  for (const b of [briefs.pt, briefs.en]) assert.match(b.readLine('C:/x/briefs/n1.md'), /^[\x20-\x7e]+$/)
})

test('skills: same names in both languages, English bodies in English, same front-matter shape', () => {
  assert.deepEqual(Object.keys(SKILLS_EN).sort(), Object.keys(SKILLS_PT).sort())
  for (const [name, s] of Object.entries(SKILLS_EN)) {
    assert.ok(s.description.startsWith('Use when'), name)
    assert.doesNotMatch(s.body, PT_WORDS, name)
    assert.match(s.body, /^# Solti:/, name)
  }
})
