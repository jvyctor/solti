// Workspace templates: a team of agents plus a pipeline that already knows who does what, shareable as a file.
// A template is { format, version, name, desc, nodes, edges } with machine-specific data stripped (folders,
// worktrees, conversations, run results). Using one creates a new workspace with fresh ids. Pure, so it is unit-tested.
import { tr } from './i18n.js'

export const TEMPLATE_FORMAT = 'solti-template'
const TYPES = new Set(['terminal', 'note', 'group', 'text', 'portal', 'files', 'diff', 'knowledge', 'pipeline'])
const PRESETS = new Set(['claude', 'codex', 'gemini', 'opencode', 'antigravity', 'shell'])

// Node data a template keeps (everything else is about one machine or one run).
const KEEP = {
  terminal: ['name', 'preset', 'maestro', 'instructions'],
  pipeline: ['name', 'input', 'steps', 'hint', 'budget'],
  note: ['title', 'text', 'color'],
  text: ['text', 'size', 'color'],
  group: ['label', 'color'],
  portal: ['url'],
  knowledge: ['text'],
  files: [],
  diff: [],
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]))
const STEP_KEYS = ['agent', 'prompt', 'parallel', 'approval', 'loopIf', 'loopTo', 'loopMax', 'stopIf', 'timeout']

// A workspace → a template. Positions are made relative to the top-left node.
export function toTemplate(ws, { name, desc = '' } = {}) {
  const nodes = (ws.nodes || []).filter((n) => TYPES.has(n.type) && !n.parentId)
  const x0 = nodes.length ? Math.min(...nodes.map((n) => n.position?.x || 0)) : 0
  const y0 = nodes.length ? Math.min(...nodes.map((n) => n.position?.y || 0)) : 0
  const keep = new Set(nodes.map((n) => n.id))
  return {
    format: TEMPLATE_FORMAT, version: 1, name: name || ws.name || tr('Modelo'), desc,
    nodes: nodes.map((n) => {
      const data = pick(n.data, KEEP[n.type])
      if (n.type === 'pipeline') data.steps = (n.data.steps || []).map((s) => pick({ ...s, agent: keep.has(s.agent) ? s.agent : undefined }, STEP_KEYS))
      return { id: n.id, type: n.type, position: { x: (n.position?.x || 0) - x0, y: (n.position?.y || 0) - y0 }, style: pick(n.style, ['width', 'height']), data }
    }),
    edges: (ws.edges || []).filter((e) => keep.has(e.source) && keep.has(e.target)).map((e) => pick(e, ['id', 'source', 'target', 'type', 'sourceHandle', 'targetHandle'])),
  }
}

// Throws when the file is not a usable template.
export function checkTemplate(t) {
  if (t?.format !== TEMPLATE_FORMAT || !Array.isArray(t.nodes) || !Array.isArray(t.edges)) throw new Error(tr('Arquivo não é um modelo do Solti.'))
  if (!t.nodes.length || t.nodes.length > 60) throw new Error(tr('Modelo vazio ou grande demais.'))
  return t
}

// A template → a new workspace: fresh ids (nodes become pty ids), steps and ropes pointing at the new ids,
// unknown node types and CLIs dropped or replaced. `taken`: workspace names already in use.
export function instantiate(t, uid, taken = new Set()) {
  checkTemplate(t)
  const nodes0 = t.nodes.filter((n) => TYPES.has(n.type))
  const ids = new Map(nodes0.map((n) => [n.id, uid('n')]))
  let maestro = false
  const nodes = nodes0.map((n) => {
    const data = pick(n.data, KEEP[n.type])
    if (n.type === 'terminal') {
      if (!PRESETS.has(data.preset)) data.preset = 'claude'
      data.name = String(data.name || 'agente').slice(0, 40)
      if (data.maestro) { data.maestro = !maestro; maestro = true } // one maestro per workspace
    }
    if (n.type === 'pipeline') data.steps = (n.data?.steps || []).map((s) => ({ ...pick(s, STEP_KEYS), agent: ids.get(s.agent) || '' }))
    return { id: ids.get(n.id), type: n.type, position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 }, style: { width: Number(n.style?.width) || 520, height: Number(n.style?.height) || 320 }, data }
  })
  const edges = t.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...pick(e, ['type', 'sourceHandle', 'targetHandle']), type: e.type || 'floating', id: uid('e'), source: ids.get(e.source), target: ids.get(e.target) }))
  let name = String(t.name || tr('Modelo')).slice(0, 60)
  for (let i = 2, base = name; taken.has(name); i++) name = `${base} (${i})`
  return { id: uid('w'), name, nodes, edges }
}

// ---- Built-in templates -------------------------------------------------------------------------------------------
// Declared with readable keys; `build` turns them into the template format above.
const agent = (id, name, preset, x, y, instructions, extra = {}) => ({ id, type: 'terminal', position: { x, y }, style: { width: 520, height: 320 }, data: { name, preset, instructions, ...extra } })
const flow = (name, input, steps, y = 0) => ({ id: 'flow', type: 'pipeline', position: { x: 0, y }, style: { width: 520, height: 720 }, data: { name, input, steps } })
const note = (text, y) => ({ id: 'note', type: 'note', position: { x: 0, y }, style: { width: 520, height: 200 }, data: { text } })
const ropes = (from, to) => to.map((t) => ({ id: `${from}-${t}`, source: from, target: t, type: 'floating' }))

export function builtinTemplates() {
  return [
    {
      key: 'pr-review',
      format: TEMPLATE_FORMAT, version: 1,
      name: tr('Revisão de PR'),
      desc: tr('Um revisor e um testador olham a mesma branch ao mesmo tempo; o maestro junta tudo num parecer.'),
      nodes: [
        agent('maestro', 'maestro', 'claude', 0, 0, tr('Você coordena a revisão de um PR: consolide os achados do revisor e do testador num parecer curto (aprovar, pedir mudanças), com os pontos em ordem de gravidade.'), { maestro: true }),
        agent('reviewer', 'revisor', 'claude', 620, -180, tr('Você revisa o PR indicado (use git diff contra a branch base): bugs, riscos de segurança, simplificações. Cite arquivo e linha. Não reescreva o código. Ao terminar, chame canvas_done com os achados.')),
        agent('tester', 'testador', 'codex', 620, 180, tr('Você testa o PR indicado: rode a suíte, escreva testes para o que mudou e não está coberto, e relate falhas com o comando exato. Ao terminar, chame canvas_done com o resultado.')),
        flow(tr('Revisar PR'), tr('branch ou número do PR'), [
          { agent: 'reviewer', prompt: tr('Revise o PR: {{input}}') },
          { agent: 'tester', prompt: tr('Teste o PR: {{input}}'), parallel: true },
          { agent: 'maestro', prompt: tr('Monte o parecer do PR {{input}} a partir destes resultados:\n{{prev}}') },
        ], 380),
      ],
      edges: ropes('maestro', ['reviewer', 'tester']),
    },
    {
      key: 'bugfix',
      format: TEMPLATE_FORMAT, version: 1,
      name: tr('Bugfix com testes'),
      desc: tr('Reproduz o bug num teste, corrige, e o revisor manda de volta até aprovar. Pede o seu OK antes de terminar.'),
      nodes: [
        agent('maestro', 'maestro', 'claude', 0, 0, tr('Você coordena a correção de bugs e responde ao usuário. Garanta que todo bug corrigido tenha um teste que falhava antes da correção.'), { maestro: true }),
        agent('tester', 'testador', 'gemini', 620, -360, tr('Você reproduz bugs: escreva um teste automatizado que falha por causa do bug descrito, sem corrigir o código. Ao terminar, chame canvas_done com o caminho do teste e o comando para rodá-lo.')),
        agent('dev', 'dev', 'codex', 620, 0, tr('Você corrige bugs com a menor mudança possível, até o teste indicado passar sem quebrar os outros. Ao terminar, chame canvas_done com o que mudou.')),
        agent('reviewer', 'revisor', 'claude', 620, 360, tr('Você revisa correções de bug. Se a correção estiver certa e testada, comece o resumo com APROVADO; se não, com REPROVADO e o que falta. Chame canvas_done com o resumo.')),
        flow(tr('Corrigir bug'), tr('descreva o bug'), [
          { agent: 'tester', prompt: tr('Reproduza num teste este bug: {{input}}') },
          { agent: 'dev', prompt: tr('Corrija o bug "{{input}}". Teste que reproduz: {{step1}}\n{{prev}}') },
          { agent: 'reviewer', prompt: tr('Revise a correção do bug "{{input}}": {{prev}}'), loopIf: tr('REPROVADO'), loopTo: 2, loopMax: 3 },
          { approval: true, prompt: tr('Correção pronta: {{prev}}') },
        ], 380),
      ],
      edges: ropes('maestro', ['tester', 'dev', 'reviewer']),
    },
    {
      key: 'docs',
      format: TEMPLATE_FORMAT, version: 1,
      name: tr('Documentação'),
      desc: tr('Um agente lê o código e escreve a documentação; outro testa os exemplos e aponta o que ficou confuso.'),
      nodes: [
        agent('writer', 'redator', 'claude', 620, -180, tr('Você escreve documentação técnica a partir do código: README, guias e comentários onde faltam. Linguagem simples, exemplos que rodam. Ao terminar, chame canvas_done com os arquivos alterados.')),
        agent('checker', 'leitor', 'gemini', 620, 180, tr('Você lê documentação como um usuário novo: rode cada exemplo, aponte passos que faltam e trechos confusos. Se estiver tudo certo, comece o resumo com OK; se não, com AJUSTAR e a lista. Chame canvas_done com o resumo.')),
        flow(tr('Documentar'), tr('o que documentar (pasta, recurso…)'), [
          { agent: 'writer', prompt: tr('Documente: {{input}}\n{{prev}}') },
          { agent: 'checker', prompt: tr('Confira a documentação de "{{input}}": {{prev}}'), loopIf: tr('AJUSTAR'), loopTo: 1, loopMax: 2 },
        ], 0),
        note(tr('Use "Executar" no fluxo e diga o que documentar. O leitor devolve ao redator até a documentação ficar clara.'), -260),
      ],
      edges: [],
    },
  ]
}
