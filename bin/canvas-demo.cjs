// `canvas demo <role> [previous result]`: a simulated agent for the demo workspace, so Solti can be tried without
// any AI CLI installed. It prints a short, plausible session and then really calls canvas_done (POST /done),
// which drives the demo pipeline exactly as a real agent would. Language: CANVAS_LANG (set by the app).
const en = process.env.CANVAS_LANG === 'en'
const c = { dim: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m', bl: '\x1b[34m', m: '\x1b[35m', cy: '\x1b[36m', gr: '\x1b[90m' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T = (pt, eng) => (en ? eng : pt)

const banner = (title, sub) => [`${c.gr}╭──${c.r} ${c.b}${title}${c.r} ${c.gr}· demo${c.r}`, `${c.gr}│${c.r}  ${c.dim}${sub}${c.r}`, `${c.gr}╰──${c.r}`]

// Each scene: lines printed one by one, then the canvas_done summary (none = just print).
function scene(role, prev) {
  const rejected = /REJECTED|REPROVADO/i.test(prev || '')
  switch (role) {
    case 'maestro':
      return {
        lines: [
          ...banner('maestro', T('coordena o time · agente simulado', 'coordinates the team · simulated agent')),
          '',
          `${c.m}●${c.r} ${T('Pedido: adicionar login com OAuth e testes', 'Request: add OAuth login with tests')}`,
          `  ${c.dim}├─${c.r} dev      → ${T('implementa o callback /auth/oauth', 'implements the /auth/oauth callback')}`,
          `  ${c.dim}├─${c.r} tester   → ${T('testes e2e do fluxo', 'e2e tests for the flow')}`,
          `  ${c.dim}└─${c.r} reviewer → ${T('revisa quando os dois terminarem', 'reviews once both are done')}`,
          '',
          `${c.y}▶${c.r} ${T('Clique em Executar no Fluxo ao lado para ver o time trabalhando.', 'Click Run on the Pipeline to watch the team work.')}`,
        ],
      }
    case 'idle':
      return { lines: banner(prev || 'agent', T('esperando tarefas do maestro · agente simulado', 'waiting for tasks from the maestro · simulated agent')) }
    case 'dev':
      return rejected
        ? {
            lines: [
              `${c.cy}[from reviewer]${c.r} ${prev}`,
              `${c.bl}▸${c.r} ${T('Corrigindo oauth.ts:41: valida o parâmetro state', 'Fixing oauth.ts:41: validate the state parameter')}`,
              `${c.bl}▸${c.r} ${T('Cookie de sessão com SameSite=Lax', 'Session cookie with SameSite=Lax')}`,
              `${c.bl}▸${c.r} npm test -- auth ${c.g}✓ 16 passed${c.r}`,
            ],
            done: T('Corrigido: state validado (CSRF) e SameSite=Lax; 16 testes ok', 'Fixed: state checked (CSRF) and SameSite=Lax; 16 tests ok'),
          }
        : {
            lines: [
              `${c.bl}▸${c.r} ${T('Lendo', 'Read')} src/auth/session.ts`,
              `${c.bl}▸${c.r} ${T('Editando', 'Edit')} src/auth/oauth.ts ${c.g}+86${c.r} ${c.m}-4${c.r}`,
              `${c.bl}▸${c.r} ${T('Editando', 'Edit')} src/routes/auth.ts ${c.g}+22${c.r}`,
              `${c.bl}▸${c.r} npm test -- auth ${c.g}✓ 14 passed${c.r}`,
            ],
            done: T('Callback OAuth e cookie de sessão; 14 testes ok', 'OAuth callback and session cookie; 14 tests ok'),
          }
    case 'tester':
      return {
        lines: [
          `${c.bl}▸${c.r} ${T('Criando', 'Create')} tests/auth.oauth.spec.ts`,
          `${c.bl}▸${c.r} playwright test auth`,
          `  ${c.g}✓${c.r} ${T('redireciona para o provedor', 'redirects to the provider')}`,
          `  ${c.g}✓${c.r} ${T('cria a sessão no callback', 'creates the session on callback')}`,
          `  ${c.g}✓${c.r} ${T('rejeita state adulterado', 'rejects a tampered state')}`,
        ],
        done: T('3 testes e2e, todos passando', '3 e2e tests, all passing'),
      }
    case 'reviewer':
      // First review rejects (the pipeline loops back to the dev); the next one approves.
      return rejected
        ? {
            lines: [`${c.g}✓${c.r} ${T('state validado, SameSite=Lax, testes cobrem o caso adulterado', 'state checked, SameSite=Lax, tests cover the tampered case')}`],
            done: T('APROVADO: os dois problemas foram corrigidos', 'APPROVED: both issues fixed'),
          }
        : {
            lines: [
              `${c.y}!${c.r} oauth.ts:41 ${T('parâmetro state não é validado → risco de CSRF', 'state param not checked → CSRF risk')}`,
              `${c.y}!${c.r} session.ts:12 ${T('cookie sem SameSite=Lax', 'cookie missing SameSite=Lax')}`,
              `${c.g}✓${c.r} ${T('caminhos de erro cobertos', 'error paths covered')}`,
            ],
            done: T('REPROVADO: 2 problemas (state sem validação, cookie sem SameSite)', 'REJECTED: 2 issues (state not checked, cookie missing SameSite)'),
          }
    default:
      return { lines: [T('uso: canvas demo maestro|idle <nome>|dev|tester|reviewer [resultado anterior]', 'usage: canvas demo maestro|idle <name>|dev|tester|reviewer [previous result]')] }
  }
}

module.exports = async function demo(args, post) {
  const [role, ...rest] = args
  const s = scene(role, rest.join(' '))
  const animated = ['dev', 'tester', 'reviewer'].includes(role)
  // A clean screen per scene, like an agent's own UI: hides the shell banner and the command typed by the pipeline.
  if (role !== undefined && process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H')
  if (animated) { process.stdout.write(`${c.gr}${T('pensando…', 'thinking…')}${c.r}\n`); await sleep(900) }
  for (const line of s.lines) { console.log(line); if (animated) await sleep(450 + Math.random() * 500) }
  if (s.done) {
    await sleep(400)
    console.log(`${c.g}✓${c.r} canvas_done ${c.dim}"${s.done}"${c.r}`)
    await post('/done', { summary: s.done })
  }
}

module.exports.scene = scene
