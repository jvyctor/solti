// Ready-made teams: a maestro plus specialists, already roped to the maestro, each with role instructions.
export const TEAMS = {
  dev: {
    label: 'Desenvolvimento',
    desc: 'Maestro + desenvolvedor + revisor + testador',
    members: [
      { key: 'maestro', name: 'maestro', preset: 'claude', maestro: true, instructions: 'Você coordena o time: divide o pedido do usuário, delega ao desenvolvedor, envia o resultado ao revisor e ao testador, e consolida. Só você fala com o usuário.' },
      { key: 'dev', name: 'dev', preset: 'codex', instructions: 'Você é o desenvolvedor. Implemente o que o maestro pedir, com mudanças pequenas e focadas. Ao terminar, chame canvas_done com o que mudou.' },
      { key: 'revisor', name: 'revisor', preset: 'claude', instructions: 'Você é o revisor de código. Leia as mudanças do desenvolvedor (veja o diff), aponte bugs, riscos e simplificações, sem reescrever tudo. Ao terminar, chame canvas_done com o veredito.' },
      { key: 'testador', name: 'testador', preset: 'gemini', instructions: 'Você é o testador. Rode os testes, crie os que faltarem para a mudança e relate falhas com o comando exato. Ao terminar, chame canvas_done com o resultado.' },
    ],
  },
  pair: {
    label: 'Dupla',
    desc: 'Maestro + desenvolvedor',
    members: [
      { key: 'maestro', name: 'maestro', preset: 'claude', maestro: true, instructions: 'Você coordena e delega ao desenvolvedor, depois confere o resultado.' },
      { key: 'dev', name: 'dev', preset: 'codex', instructions: 'Você é o desenvolvedor. Implemente o que o maestro pedir. Ao terminar, chame canvas_done com o que mudou.' },
    ],
  },
  review: {
    label: 'Revisão',
    desc: 'Maestro + revisor + testador (para código que já existe)',
    members: [
      { key: 'maestro', name: 'maestro', preset: 'claude', maestro: true, instructions: 'Você coordena a revisão: envie o escopo ao revisor e ao testador e consolide os achados.' },
      { key: 'revisor', name: 'revisor', preset: 'claude', instructions: 'Você revisa o código indicado: bugs, riscos, simplificações. Ao terminar, chame canvas_done com o veredito.' },
      { key: 'testador', name: 'testador', preset: 'gemini', instructions: 'Você roda e cria testes para o código indicado e relata falhas. Ao terminar, chame canvas_done com o resultado.' },
    ],
  },
}

const unique = (name, taken) => {
  let n = name
  for (let i = 2; taken.has(n); i++) n = `${name}-${i}`
  taken.add(n)
  return n
}

// opts: { origin: {x,y}, presets: {memberKey: preset}, where: {memberKey: {cwd, git}}, taken: Set of names, uid }
// -> { nodes, edges }. The maestro goes left, specialists stack on the right, each roped to the maestro.
export function teamNodes(teamId, { origin = { x: 80, y: 80 }, presets = {}, where = {}, taken = new Set(), uid }) {
  const team = TEAMS[teamId]
  const names = new Set(taken)
  const size = { width: 520, height: 320 }
  const nodes = team.members.map((m, i) => {
    const spec = i > 0
    const at = where[m.key] || {}
    return {
      id: uid('n'),
      type: 'terminal',
      style: size,
      position: spec ? { x: origin.x + 600, y: origin.y + (i - 1) * 360 } : { x: origin.x, y: origin.y + 360 },
      data: { name: unique(m.name, names), preset: presets[m.key] || m.preset, maestro: !!m.maestro, instructions: m.instructions, ...(at.cwd ? { cwd: at.cwd } : {}), ...(at.git ? { git: at.git } : {}) },
    }
  })
  const edges = nodes.slice(1).map((n) => ({ id: uid('e'), source: nodes[0].id, target: n.id, type: 'floating' }))
  return { nodes, edges }
}
