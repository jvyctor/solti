# Agent Canvas

Canvas para orquestrar agentes de IA (Claude Code, Codex, Gemini, Antigravity, OpenCode) em terminais conectados.
Um **Maestro** delega e agentes executam, trocando mensagens por ferramentas MCP (`canvas_send`, `canvas_ask`, `canvas_spawn`…).

Stack: Electron + React + Vite + xterm.js + node-pty + React Flow.

## Rodar em desenvolvimento

Requisitos: Windows, Node.js 22+ e os CLIs de agente que quiser usar (já logados).

```
npm install
npm run dev
```

`npm install` baixa o binário do Electron; se o script de instalação for bloqueado, rode `node node_modules/electron/install.js`.

## Gerar o instalador (Windows)

```
npm run dist
```

Saída: `%LOCALAPPDATA%\agent-canvas-release\Agent-Canvas-Setup-<versão>.exe`.
O instalador não é assinado; o SmartScreen mostra um aviso na primeira execução.

## Publicar uma versão

O app confere atualizações no repositório público de releases `jvyctor/agent-canvas-releases` (só instaladores; o código fica neste repositório privado). Não precisa de token no app.

1. Suba `"version"` no `package.json` (ex.: `0.2.2` → `0.2.3`) e faça commit/push.
2. Rode, com um token do GitHub com permissão de escrita no repositório de releases em `GH_TOKEN`:
   ```
   npm run release
   ```
   Com o Git Credential Manager (Git Bash):
   ```
   GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p') npm run release
   ```
3. Se falhar com `422 ... valid tag`, rode o mesmo comando de novo: ele reaproveita a Release e envia o que faltou. Leva alguns minutos (o instalador tem ~110 MB).
4. Confira na Release `vX.Y.Z` os 3 arquivos: `Agent-Canvas-Setup-X.Y.Z.exe`, `.exe.blockmap` e `latest.yml`.

**Automático (recomendado):** com o segredo `RELEASES_TOKEN` configurado no repositório (Settings → Secrets → Actions; token com escrita em `jvyctor/agent-canvas-releases`), basta subir a versão no `package.json`, fazer commit/push e criar a tag:

```
git tag v0.5.0
git push origin v0.5.0
```

O GitHub Actions (`.github/workflows/release.yml`) confere se a tag bate com o `package.json`, roda os testes unitários, cria a Release e publica o instalador, sem o erro 422.

Quem tem uma versão anterior (a partir da 0.2.1) recebe o aviso ao abrir o app, ou em Configurações → Atualizações → Verificar atualizações.

Testes: `npm run build` e depois `npm test` (abre o app em perfil temporário; inclui o fluxo de atualização com um feed falso).

## Recursos de orquestração

- **Worktree por agente**: em "Novo terminal…" escolha uma pasta ou um link do Git, a branch de partida e (marcado por padrão) "Isolar em worktree". Cada agente trabalha na própria branch `canvas/<nome>`, numa pasta separada.
- **Revisão (Diff)**: nó ligado por corda a um agente em worktree. Lista os arquivos alterados, mostra o diff e tem **Aprovar** (commit), **Merge** na branch-base e **PR** (envia a branch e abre a página de PR do GitHub).
- **Retomar conversa**: ao reabrir o app (ou "Recarregar"), Claude, Codex, Gemini e OpenCode retomam a conversa anterior. "Nova conversa" começa do zero. Antigravity ainda não tem retomada.
- **Status ao vivo** em cada agente: trabalhando, esperando você, ocioso, encerrado (detectado pela saída do terminal).
- **Conhecimento do projeto**: nó de memória compartilhada por workspace. Os agentes leem no início e usam `canvas_knowledge` / `canvas_remember`.
- **Fluxos (pipeline)**: nó "Fluxo" com passos (agente + instrução). Executa em sequência: digita a instrução no agente, espera ele chamar `canvas_done` e passa o resumo ao próximo (`{{input}}`, `{{prev}}`, `{{step1}}`). "Parar se o resumo contiver…" encerra o fluxo. O fluxo só roda enquanto o workspace está aberto.
- **Concluído**: agentes chamam `canvas_done(resumo)` ao terminar; o terminal mostra "Concluído" e, se você estava fora da janela, ao voltar aparece o resumo de quem terminou.
- **Segurança do trabalho**: backup automático a cada 10 min (20 últimos, em `%APPDATA%gent-canvasackups`), gravação atômica, restauração automática se o arquivo estragar, exportar/importar workspaces (Configurações → Dados) e desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z).
- **Paleta (Ctrl+K)**: ir para workspace ou terminal, buscar na saída dos terminais e executar ações.
- **Controle de uso**: tokens por agente (só Claude Code), limite configurável em Configurações → Agentes, e "Interromper todos os agentes" no painel de uso.
- **Atividade e aprovação**: o botão de pergaminho (canto inferior direito) mostra a linha do tempo do que os agentes fizeram entre si. Em Configurações → Agentes → Segurança você escolhe pedir aprovação ao criar agentes (padrão), em tudo ou nunca; sem resposta em 2 minutos o pedido é negado.
- **Portal controlável**: o agente ligado a um Portal usa `canvas_portal` para abrir URLs (http/https), clicar, digitar, rolar e tirar capturas de tela. `canvas_peers` / `canvas_read` mostram e leem tudo que está ligado ao agente (notas, portais, árvores de arquivos, revisões).

## Estrutura

- `electron/` processo principal: PTYs, bridge HTTP local, registro do MCP, configurações, briefings e skills.
- `bin/` CLI `canvas` e servidor MCP (`canvas-mcp.cjs`), usados pelos agentes dentro dos terminais.
- `src/` interface React (canvas, sidebar, configurações, temas).
- `build/` ícone (`icon.svg` → `npm run icons`).

Dados do usuário (workspaces, configurações) ficam em `%APPDATA%\agent-canvas`, fora do repositório.
