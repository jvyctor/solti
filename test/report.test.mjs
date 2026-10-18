// Pipeline run report (Markdown).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runReport } from '../src/report.js'

const names = { a: 'dev', b: 'revisor' }
const run = {
  title: 'Login', input: 'login com OAuth', state: 'done', note: '', t: Date.UTC(2026, 9, 18, 15, 0), ms: 7 * 60000, rounds: 3,
  steps: [{ agent: 'a', prompt: 'x' }, { agent: 'b', prompt: 'y', loopIf: 'REPROVADO', loopTo: 1 }, { approval: true, prompt: 'ok?' }, { agent: 'a', prompt: 'z' }],
  results: [{ state: 'ok', summary: 'implementei o login', runs: 2 }, { state: 'ok', summary: 'APROVADO', runs: 2 }, { state: 'ok', summary: 'Aprovado.', runs: 1 }, null],
  costs: [{ id: 'a', cost: 0.4 }, { id: 'b', cost: 0.25 }],
  changes: [{ id: 'a', branch: 'canvas/dev', base: 'main', files: [{ file: 'src/login.js', status: 'M' }, { file: 'src/oauth.js', status: 'N' }] }, { id: 'b', branch: 'canvas/revisor', base: 'main', files: [] }],
}

test('the report has the outcome, costs per agent, every step and the changed files', () => {
  const md = runReport(run, (id) => names[id])
  assert.match(md, /^# Fluxo “Login”: concluído/)
  assert.match(md, /- \*\*Entrada:\*\* login com OAuth/)
  assert.match(md, /7 min · 3 rodada\(s\)/)
  assert.match(md, /- \*\*Gasto estimado:\*\* \$0\.65 \(dev \$0\.40, revisor \$0\.25\)/)
  assert.match(md, /### 1\. dev ✓ \(×2\)\n\nimplementei o login/)
  assert.match(md, /### 3\. Aprovação humana ✓/)
  assert.match(md, /### 4\. dev –\n\n_não executado_/)
  assert.match(md, /### dev: `canvas\/dev` → `main`\n\n- M `src\/login\.js`\n- A `src\/oauth\.js`/)
  assert.doesNotMatch(md, /canvas\/revisor/) // agents without changes are left out
})

test('a stopped run shows its note and no code section when nothing changed', () => {
  const md = runReport({ ...run, state: 'stopped', note: 'Parado por você.', changes: [] }, (id) => names[id])
  assert.match(md, /: parado/)
  assert.match(md, /- \*\*Observação:\*\* Parado por você\./)
  assert.doesNotMatch(md, /Mudanças no código/)
})
