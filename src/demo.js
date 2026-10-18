// The demo workspace: a maestro, three specialists and a pipeline, all running in plain shells with the bundled
// simulated agent (`canvas demo …`, see bin/canvas-demo.cjs). Shows the whole flow without any AI CLI installed:
// parallel steps, a loop when the reviewer rejects, and a human approval before shipping.
import { getLang, tr } from './i18n.js'

export function demoWorkspace(uid) {
  const en = getLang() === 'en'
  const id = { maestro: uid('n'), dev: uid('n'), tester: uid('n'), reviewer: uid('n') }
  const term = (key, name, x, y, boot, extra = {}) => ({
    id: id[key], type: 'terminal', position: { x, y }, style: { width: 540, height: 300 },
    data: { name, preset: 'shell', boot, demo: true, ...extra },
  })
  // Step prompts are shell commands: the simulated agent prints its work and calls canvas_done.
  const steps = [
    { agent: id.dev, prompt: 'canvas demo dev "{{prev}}"' },
    { agent: id.tester, prompt: 'canvas demo tester', parallel: true },
    { agent: id.reviewer, prompt: 'canvas demo reviewer "{{step3}}"', loopIf: en ? 'REJECTED' : 'REPROVADO', loopTo: 1, loopMax: 2 },
    { approval: true, prompt: tr('Publicar? {{prev}}') },
  ]
  const nodes = [
    term('maestro', 'maestro', 0, 0, 'canvas demo maestro', { maestro: true }),
    term('dev', 'dev', 640, -340, 'canvas demo idle dev'),
    term('tester', 'tester', 640, 0, 'canvas demo idle tester'),
    term('reviewer', 'reviewer', 640, 340, 'canvas demo idle reviewer'),
    {
      id: uid('n'), type: 'pipeline', position: { x: 0, y: 360 }, style: { width: 520, height: 760 },
      data: { name: tr('Demo: login com OAuth'), input: tr('login com OAuth'), hint: false, steps },
    },
    {
      id: uid('n'), type: 'note', position: { x: 0, y: -300 }, style: { width: 520, height: 250 },
      data: { text: tr('Isto é uma demonstração: os agentes são simulados em shells comuns, sem nenhum CLI de IA.\n\n1. Clique em Executar no Fluxo abaixo.\n2. Dev e testador trabalham ao mesmo tempo.\n3. O revisor reprova e o fluxo volta ao dev com a revisão.\n4. Na segunda rodada ele aprova e o fluxo pede a sua aprovação.\n\nCom um CLI instalado (Claude Code, Codex, Gemini…), crie um time de verdade pelo menu Adicionar → Terminal → Time pronto.') },
    },
  ]
  const edges = ['dev', 'tester', 'reviewer'].map((k) => ({ id: uid('e'), source: id.maestro, target: id[k], type: 'floating' }))
  return { id: uid('w'), name: 'Demo', demo: true, nodes, edges }
}
