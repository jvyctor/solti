// End to end in the real app: a parallel pipeline with a loop driven by real shells, the restore point it makes,
// the agents' history, the cost badge from a Claude log, and a workspace budget that blocks pipelines.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sleep } from './helpers.mjs'

test('parallel + loop pipeline, restore point, history; cost badge and budget', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-feat-'))
  const prof = join(root, 'profile')
  mkdirSync(prof)
  const term = (id, name, x, extra = {}) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 460, height: 220 }, data: { name, preset: 'shell', ...extra } })
  // The "reviewer" rejects on its first run and approves on the second: a counter file decides.
  const counter = join(root, 'rev.txt').replace(/\\/g, '/')
  const review = `if (Test-Path '${counter}') { canvas done "APROVADO" } else { 'x' | Out-File '${counter}'; canvas done "REPROVADO falta teste" }`
  const steps = [
    { agent: 'a', prompt: 'canvas done "dev-ok {{prev}}"' },
    { agent: 'b', prompt: 'canvas done "qa-ok"', parallel: true },
    { agent: 'c', prompt: review, loopIf: 'reprovado', loopTo: 1, loopMax: 3 },
  ]
  const nodes = [
    term('a', 'dev', 0), term('b', 'qa', 500), term('c', 'rev', 1000),
    { id: 'p1', type: 'pipeline', position: { x: 0, y: 260 }, style: { width: 460, height: 620 }, data: { name: 'Entrega', input: 'login', hint: false, steps } },
  ]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [] }], active: 'w1' }))
  const app = await launch(prof)
  try {
    await app.until(`document.querySelectorAll('.xterm-rows').length === 3 && [...document.querySelectorAll('.xterm-rows')].every(e => /PS [A-Z]:/.test(e.textContent))`, 'three shells ready', 200)
    await sleep(1500)
    const text = `(document.querySelector('.react-flow__node[data-id="p1"]')?.textContent || '')`
    assert.equal(await app.ev(`document.querySelectorAll('.react-flow__node[data-id="p1"] .pipe-step.par').length`), 1, 'step 2 shown as parallel')
    await app.ev(`[...document.querySelectorAll('.react-flow__node[data-id="p1"] .diff-foot button')].find(b => b.textContent.includes('Executar')).click()`)
    await app.until(`${text}.includes('Fluxo concluído')`, 'pipeline done', 240)
    const t = await app.ev(text)
    assert.match(t, /APROVADO/)
    assert.match(t, /dev-ok REPROVADO falta teste/, 'after the loop the dev got the review as {{prev}}')
    assert.match(t, /×2/, 'run counter shown')

    // A restore point was made before the run.
    const pts = await app.ev(`window.api.pointList()`)
    assert.ok(pts.some((p) => /Entrega/.test(p.label)), JSON.stringify(pts))

    // History: what the reviewer was asked and what it concluded, newest first.
    const hist = await app.ev(`window.api.historyQuery({ agent: { id: 'c', name: 'rev' } }).then(r => r.map(e => e.kind + ':' + e.text.slice(0, 20)))`)
    assert.deepEqual(hist.filter((h) => h.startsWith('done')).length, 2)
    assert.ok(hist.filter((h) => h.startsWith('prompt')).length === 2, hist.join(' | '))
    // The dialog opens from the node menu event and lists them.
    await app.ev(`window.dispatchEvent(new CustomEvent('ac:agent-history', { detail: { nodeId: 'c' } }))`)
    await app.until(`document.querySelectorAll('.hist-row').length >= 4`, 'history dialog rows')
    await app.ev(`[...document.querySelectorAll('.hist-kinds .chip')].find(b => b.textContent === 'Concluídos').click()`)
    await app.until(`document.querySelectorAll('.hist-row').length === 2`, 'kind filter: the two completions')
    await app.ev(`(() => { const i = document.querySelector('.hist-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'falta teste'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await app.until(`document.querySelectorAll('.hist-row').length === 1`, 'search narrows to the rejection')
  } finally {
    app.close()
  }
})

test('approval step waits for the dialog; typed lines go to the agent history; the run is listed with its spend', async () => {
  const prof = mkdtempSync(join(tmpdir(), 'ac-appr-'))
  const term = (id, name, x, preset) => ({ id, type: 'terminal', position: { x, y: 0 }, style: { width: 460, height: 220 }, data: { name, preset } })
  const steps = [{ agent: 'a', prompt: 'canvas done "build-ok"' }, { approval: true, prompt: 'Publicar? {{prev}}' }, { agent: 'a', prompt: 'canvas done "publicado {{prev}}"' }]
  const nodes = [term('a', 'dev', 0, 'shell'), term('c', 'agente', 500, 'claude'), { id: 'p1', type: 'pipeline', position: { x: 0, y: 260 }, style: { width: 460, height: 560 }, data: { name: 'Deploy', hint: false, steps } }]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', nodes, edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ sendBriefing: false, commands: { claude: 'echo CMD' } }))
  const app = await launch(prof)
  try {
    await app.until(`[...document.querySelectorAll('.xterm-rows')].length === 2 && [...document.querySelectorAll('.xterm-rows')].every(e => /PS [A-Z]:/.test(e.textContent))`, 'shells ready', 200)
    await sleep(1500)
    const text = `(document.querySelector('.react-flow__node[data-id="p1"]')?.textContent || '')`
    await app.ev(`[...document.querySelectorAll('.react-flow__node[data-id="p1"] .diff-foot button')].find(b => b.textContent.includes('Executar')).click()`)
    // The approval dialog shows the step's text with {{prev}} filled in.
    await app.until(`(document.querySelector('.dlg')?.textContent || '').includes('Publicar? build-ok')`, 'approval dialog', 160)
    assert.match(await app.ev(text), /Esperando sua aprovação/)
    await app.ev(`[...document.querySelectorAll('.dlg button')].find(b => b.textContent === 'Permitir').click()`)
    await app.until(`${text}.includes('Fluxo concluído')`, 'pipeline done after approval', 160)
    assert.match(await app.ev(text), /publicado build-ok/, '{{prev}} after the approval is the step before it')
    assert.match(await app.ev(text), /Últimas execuções/)
    const runs = await app.ev(`window.api.historyQuery({ kinds: ['pipeline'] })`)
    assert.equal(runs.length, 1)
    assert.match(runs[0].text, /concluído · 3 rodada/)

    // Typing into an agent terminal (not a plain shell) lands in its history; a Backspace edits the line.
    await app.ev(`window.api.write('c', 'revisa o lgo')`)
    await app.ev(`window.api.write('c', '\\x7f\\x7fogin')`)
    await app.ev(`window.api.write('c', '\\r')`)
    await app.ev(`window.api.write('a', 'echo nao-registrar\\r')`)
    await app.until(`window.api.historyQuery({ kinds: ['input'] }).then(r => r.length === 1 && r[0].text === 'revisa o login' && r[0].toId === 'c')`, 'typed line recorded for the agent only')
  } finally {
    app.close()
  }
})

test('cost badge from the Claude log and a reached workspace budget blocks pipelines', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ac-cost-'))
  const prof = join(home, 'profile')
  mkdirSync(prof)
  const sid = '11111111-2222-3333-4444-555555555555'
  mkdirSync(join(home, '.claude', 'projects', 'C--x'), { recursive: true })
  // 1M output tokens on Opus 5.5 = $20.
  writeFileSync(join(home, '.claude', 'projects', 'C--x', sid + '.jsonl'), JSON.stringify({ message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1000000 } } }) + '\n')
  const nodes = [
    { id: 'n1', type: 'terminal', position: { x: 0, y: 0 }, style: { width: 600, height: 300 }, data: { name: 'caro', preset: 'claude', sid, ran: true } },
    { id: 'p1', type: 'pipeline', position: { x: 0, y: 340 }, style: { width: 420, height: 400 }, data: { hint: false, steps: [{ agent: 'n1', prompt: 'x' }] } },
  ]
  writeFileSync(join(prof, 'workspace.json'), JSON.stringify({ list: [{ id: 'w1', name: 'A', budget: 50, nodes, edges: [] }], active: 'w1' }))
  writeFileSync(join(prof, 'settings.json'), JSON.stringify({ sendBriefing: false, commands: { claude: 'echo CMD' } }))
  const app = await launch(prof, 0, { env: { USERPROFILE: home, HOME: home } })
  try {
    await app.until(`(document.querySelector('.thead .cost')?.textContent || '') === '$20.00'`, 'cost badge', 120)
    // The usage panel shows the spend against the budget (50: not reached).
    await app.ev(`document.querySelector('[aria-label="Uso dos agentes"]').click()`)
    await app.until(`(document.querySelector('.cost-total')?.textContent || '') === '$20.00'`, 'cost panel total')
    assert.match(await app.ev(`document.querySelector('.cost-panel').textContent`), /40% usado/)
    assert.equal((await app.ev(`window.api.historyQuery({ kinds: ['budget'] })`)).length, 0)
    // Lowering the budget below the spend is a crossing: recorded once, and pipelines are refused.
    await app.ev(`(() => { const i = document.querySelector('.cost-budget input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '5'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })()`)
    await app.until(`(document.querySelector('.cost-panel')?.textContent || '').includes('Atingido')`, 'budget reached in the panel')
    await app.until(`window.api.historyQuery({ kinds: ['budget'] }).then(r => r.length === 1)`, 'budget crossing recorded')
    await app.ev(`[...document.querySelectorAll('.react-flow__node[data-id="p1"] .diff-foot button')].find(b => b.textContent.includes('Executar')).click()`)
    await app.until(`(document.querySelector('.react-flow__node[data-id="p1"]')?.textContent || '').includes('Orçamento do workspace atingido')`, 'pipeline blocked by budget')
  } finally {
    app.close()
  }
})
