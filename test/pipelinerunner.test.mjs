// The pipeline runner against fake agents: parallel groups, loops, timeouts, budget and stop, without the app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runPipeline, stopPipeline, isRunning } from '../src/pipelineRunner.js'

// Fake agents: each answers a prompt with canvas_done after `delay` ms, using `reply(prompt, nth)`.
function world(agents, { delay = 5 } = {}) {
  const listeners = new Set()
  const sent = []
  const interrupted = []
  const spend = {}
  const api = {
    onDone: (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    promptAgent: (id, text) => {
      sent.push({ id, text })
      const a = agents[id]
      if (!a?.reply) return // silent agent
      const n = sent.filter((s) => s.id === id).length
      setTimeout(() => {
        spend[id] = (spend[id] || 0) + (a.costPerRun || 0)
        listeners.forEach((cb) => cb({ from: id, summary: a.reply(text, n) }))
      }, a.delay ?? delay)
    },
    interrupt: (id) => interrupted.push(id),
  }
  let node
  const deps = {
    api,
    getNode: () => node,
    patch: (_id, p) => { node = { ...node, data: { ...node.data, ...p } } },
    agentExists: (id) => !!agents[id],
    agentName: (id) => agents[id]?.name || id,
    cost: (id) => spend[id] || 0,
    snapshot: (label) => { deps.snapshots.push(label) },
    notify: (title, body) => deps.notes.push({ title, body }),
    snapshots: [],
    notes: [],
  }
  return { api, deps, sent, interrupted, set: (data) => { node = { id: 'p', data } }, get data() { return node.data } }
}

test('sequence: {{prev}} carries the previous summary; a restore point is made first; done is notified', async () => {
  const w = world({ a: { name: 'dev', reply: () => 'feito' }, b: { name: 'rev', reply: (t) => `revisei: ${t.split('|')[1]}` } })
  w.set({ name: 'F', input: 'login', hint: false, steps: [{ agent: 'a', prompt: 'faça {{input}}' }, { agent: 'b', prompt: 'revise|{{prev}}' }] })
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'done')
  assert.deepEqual(w.sent.map((s) => s.text), ['faça login', 'revise|feito'])
  assert.equal(w.data.results[1].summary, 'revisei: feito')
  assert.equal(w.deps.snapshots.length, 1)
  assert.match(w.deps.notes[0].title, /concluído/)
})

test('parallel: both prompts go out before either answers; {{prev}} lists each agent', async () => {
  const w = world({ a: { name: 'dev', reply: () => 'código', delay: 30 }, b: { name: 'qa', reply: () => 'testes', delay: 10 }, c: { name: 'rev', reply: (t) => t } })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: 'x' }, { agent: 'b', prompt: 'y', parallel: true }, { agent: 'c', prompt: '{{prev}}' }] })
  const t0 = Date.now()
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'done')
  assert.deepEqual(w.sent.slice(0, 2).map((s) => s.id), ['a', 'b'])
  assert.equal(w.data.results[2].summary, 'dev: código\nqa: testes')
  assert.ok(Date.now() - t0 < 200, 'the two waited together, not one after the other')
})

test('loop: the reviewer sends the run back to the dev until approved, at most loopMax times', async () => {
  const w = world({ a: { name: 'dev', reply: (_t, n) => `versão ${n}` }, b: { name: 'rev', reply: (_t, n) => (n < 3 ? 'REPROVADO: falta teste' : 'aprovado') } })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: 'corrija: {{prev}}' }, { agent: 'b', prompt: 'revise {{prev}}', loopIf: 'reprovado', loopTo: 1, loopMax: 5 }] })
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'done')
  assert.equal(w.sent.filter((s) => s.id === 'a').length, 3)
  assert.equal(w.sent[2].text, 'corrija: REPROVADO: falta teste', 'the dev gets the review as {{prev}}')
  assert.deepEqual(w.data.loops, [0, 2])
  assert.equal(w.data.results[0].runs, 3)
})

test('loop limit: after loopMax repetitions the run goes on and says so', async () => {
  const w = world({ a: { reply: () => 'v' }, b: { reply: () => 'reprovado' } })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: '' }, { agent: 'b', prompt: '', loopIf: 'reprovado', loopTo: 1, loopMax: 2 }] })
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'done')
  assert.equal(w.sent.filter((s) => s.id === 'b').length, 3)
  assert.match(w.data.results[1].note, /Limite de 2 repetições/)
})

test('timeout per step stops the run', async () => {
  const w = world({ a: {} }) // never answers
  w.set({ hint: false, steps: [{ agent: 'a', prompt: '', timeout: 0.0005 }] }) // 30 ms
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'stopped')
  assert.equal(w.data.results[0].state, 'timeout')
})

test('stop from outside ends every waiting step of a parallel group with the given reason', async () => {
  const w = world({ a: {}, b: {} })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: '' }, { agent: 'b', prompt: '', parallel: true }] })
  const run = runPipeline('p', w.deps)
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(isRunning('p'), true)
  stopPipeline('p', 'Orçamento do workspace atingido.')
  await run
  assert.equal(isRunning('p'), false)
  assert.equal(w.data.state, 'stopped')
  assert.deepEqual(w.data.results.map((r) => r.summary), ['Orçamento do workspace atingido.', 'Orçamento do workspace atingido.'])
})

test('approval step: waits for your OK, keeps {{prev}} for the next step; denying stops the run', async () => {
  const asked = []
  const w = world({ a: { reply: () => 'código pronto' }, b: { reply: (t) => t } })
  w.deps.approve = async (o) => { asked.push(o); return true }
  w.set({ name: 'Deploy', hint: false, steps: [{ agent: 'a', prompt: 'faça' }, { approval: true, prompt: 'Revise: {{prev}}' }, { agent: 'b', prompt: 'publique {{prev}}' }] })
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'done')
  assert.equal(asked[0].text, 'Revise: código pronto')
  assert.equal(asked[0].step, 2)
  assert.equal(asked[0].timeoutMs, 60 * 60000, 'approvals wait an hour by default')
  assert.equal(w.sent.at(-1).text, 'publique código pronto')
  assert.equal(w.data.runs.length, 1, 'the run is recorded')

  const d = world({ a: { reply: () => 'x' }, b: { reply: () => 'y' } })
  d.deps.approve = async () => false
  d.set({ hint: false, steps: [{ agent: 'a', prompt: '' }, { approval: true, prompt: '' }, { agent: 'b', prompt: '' }] })
  await runPipeline('p', d.deps)
  assert.equal(d.data.state, 'stopped')
  assert.match(d.data.note, /aprovação do passo 2 foi negada/)
  assert.equal(d.sent.filter((s) => s.id === 'b').length, 0)
})

test('stopping while an approval is pending withdraws it', async () => {
  let release
  const withdrawn = []
  const w = world({})
  w.deps.approve = () => new Promise((r) => { release = r })
  w.deps.cancelApproval = (key) => { withdrawn.push(key); release(false) }
  w.set({ hint: false, steps: [{ approval: true, prompt: 'ok?' }] })
  const run = runPipeline('p', w.deps)
  await new Promise((r) => setTimeout(r, 20))
  stopPipeline('p')
  await run
  assert.equal(withdrawn.length, 1)
  assert.equal(w.data.state, 'stopped')
  assert.equal(w.data.note, 'Parado por você.')
})

test('each run is kept with its state, rounds and spend (last 10)', async () => {
  const w = world({ a: { reply: () => 'ok', costPerRun: 0.25 } })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: '' }] })
  for (let i = 0; i < 12; i++) await runPipeline('p', w.deps)
  assert.equal(w.data.runs.length, 10)
  assert.equal(w.data.runs.at(-1).state, 'done')
  assert.equal(w.data.runs.at(-1).rounds, 1)
  assert.equal(w.data.runs.at(-1).spent, 0.25)
})

test('invalid pipelines do not send anything', async () => {
  const w = world({ a: { reply: () => 'x' } })
  w.set({ hint: false, steps: [{ agent: 'a', prompt: '' }, { agent: 'a', prompt: '', parallel: true }] })
  await runPipeline('p', w.deps)
  assert.equal(w.sent.length, 0)
  assert.match(w.data.note, /agentes diferentes/)
})

test('pipeline budget: spending since the start beyond the budget stops the run and interrupts its agents', { timeout: 20000 }, async () => {
  const w = world({ a: { reply: () => 'ok', costPerRun: 0.6 }, b: {} }) // b never answers: the run waits until the budget check fires
  w.set({ hint: false, budget: 0.5, steps: [{ agent: 'a', prompt: '' }, { agent: 'b', prompt: '' }] })
  await runPipeline('p', w.deps)
  assert.equal(w.data.state, 'stopped')
  assert.match(w.data.note, /orçamento do fluxo/)
  assert.deepEqual(w.interrupted.sort(), ['a', 'b'])
})

test('resume: a run that stopped at step 2 continues from there with {{prev}} intact, without redoing step 1', async () => {
  let answer = false
  const w = world({ a: { reply: () => 'código pronto' }, b: { reply: (t) => (answer ? `ok: ${t}` : undefined) } })
  w.api.promptAgent = ((orig) => (id, text) => { if (id === 'b' && !answer) { w.sent.push({ id, text }); return } orig(id, text) })(w.api.promptAgent)
  w.set({ hint: false, steps: [{ agent: 'a', prompt: 'faça' }, { agent: 'b', prompt: 'revise {{prev}}' }] })
  const first = runPipeline('p', w.deps)
  await new Promise((r) => setTimeout(r, 40))
  stopPipeline('p', 'parado')
  await first
  assert.equal(w.data.state, 'stopped')
  assert.equal(w.data.checkpoint.g, 1)
  assert.equal(w.data.checkpoint.prev, 'código pronto')
  answer = true
  await runPipeline('p', { ...w.deps, resume: true })
  assert.equal(w.data.state, 'done')
  assert.equal(w.sent.filter((s) => s.id === 'a').length, 1, 'step 1 was not run again')
  assert.equal(w.sent.at(-1).text, 'revise código pronto')
  assert.equal(w.data.checkpoint, null, 'a finished run leaves no checkpoint')
  assert.equal(w.deps.snapshots.length, 1, 'no second restore point when resuming')
})

test('resume ignores a checkpoint taken with a different list of steps', async () => {
  const w = world({ a: { reply: () => 'x' }, b: { reply: () => 'y' } })
  w.set({ hint: false, checkpoint: { n: 5, g: 1, prev: 'velho', loops: [], results: [] }, steps: [{ agent: 'a', prompt: '' }, { agent: 'b', prompt: '' }] })
  await runPipeline('p', { ...w.deps, resume: true })
  assert.equal(w.sent[0].id, 'a', 'started over')
})
