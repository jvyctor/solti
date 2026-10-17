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

## Windows, macOS e Linux

O app roda nos três sistemas. O instalador de cada um sai do GitHub Actions (aba Actions → "Build installers" → Run workflow, com os arquivos como artefato por 3 dias) ou, ao criar uma tag, vai direto para a Release.

- **Windows**: instalador `.exe` (não assinado; o SmartScreen avisa na primeira execução).
- **macOS**: `.dmg` / `.zip` (Intel e Apple Silicon), **não assinado**: na primeira abertura use botão direito → Abrir (ou `xattr -dr com.apple.quarantine "/Applications/Agent Canvas.app"`). A atualização automática do Mac não funciona sem assinatura: o botão abre a página de download.
- **Linux**: `.AppImage` (`chmod +x` e executar) ou `.deb`. O AppImage se atualiza sozinho.
- No Mac/Linux o terminal usa o seu `$SHELL` (no Mac, como shell de login, igual ao Terminal). O app carrega o PATH do seu shell de login ao abrir, para achar CLIs instalados via Homebrew, nvm ou `~/.local/bin` mesmo quando aberto pelo Dock ou pelo menu. O comando `canvas` funciona dentro dos terminais (script `bin/canvas`).
- Ao fechar, o app encerra a árvore inteira de processos de cada terminal: `taskkill /T` no Windows, descendentes via `ps` no Mac/Linux.
- **Linux, AppImage no Ubuntu 23.10+**: o AppArmor do Ubuntu bloqueia o sandbox do Chromium em AppImages, e o app pode não abrir. Prefira o `.deb`, que instala o `chrome-sandbox` com as permissões certas. Se precisar do AppImage, rode com `--no-sandbox`, sabendo que isso desliga o isolamento das páginas web dos Portais.
- Os testes de interface completos (`npm test`) são do Windows (PowerShell). Em Mac e Linux, o CI roda os testes unitários e o teste de fumaça.

**O que foi verificado no Linux** (Debian 12 em container, Node 22): `npm ci` compila o node-pty, os testes unitários passam, e o teste de fumaça passa sob tela virtual (o app abre, o bash roda o `canvas` e fechar encerra os processos do terminal). O `.AppImage` e o `.deb` são gerados. O Mac é verificado pelo CI no GitHub (macOS), mas ainda não foi aberto numa máquina Mac real.

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
git tag v0.6.0
git push origin v0.6.0
```

O GitHub Actions (`.github/workflows/release.yml`) confere se a tag bate com o `package.json`, roda os testes unitários, cria a Release e publica os instaladores de Windows, macOS e Linux, sem o erro 422.

Quem tem uma versão anterior (a partir da 0.2.1) recebe o aviso ao abrir o app, ou em Configurações → Atualizações → Verificar atualizações.

Testes: `npm run build` e depois `npm test` (abre o app em perfil temporário; inclui o fluxo de atualização com um feed falso). `npm run test:unit` roda só os testes sem interface (segundos) e `npm run test:smoke` o teste de fumaça que funciona em Windows, macOS e Linux.

**CI** (`.github/workflows/ci.yml`): a cada push e pull request, testes unitários e o teste de fumaça do app compilado em Windows, macOS e Linux (este com tela virtual). O workflow de release roda o mesmo CI antes de publicar.

## Recursos de orquestração

- **Worktree por agente**: em "Novo terminal…" escolha uma pasta ou um link do Git, a branch de partida e (marcado por padrão) "Isolar em worktree". Cada agente trabalha na própria branch `canvas/<nome>`, numa pasta separada.
- **Revisão (Diff)**: nó ligado por corda a um agente em worktree. Lista os arquivos alterados, mostra o diff e tem **Aprovar** (commit), **Merge** na branch-base e **PR** (envia a branch e abre a página de PR do GitHub).
- **Retomar conversa**: ao reabrir o app (ou "Recarregar"), Claude, Codex, Gemini, OpenCode e Antigravity retomam a conversa anterior (Antigravity, Codex e OpenCode pela conversa mais recente da pasta). "Nova conversa" começa do zero.
- **Status ao vivo** em cada agente: trabalhando, esperando você, ocioso, encerrado (detectado pela saída do terminal).
- **Conhecimento do projeto**: nó de memória compartilhada por workspace. Os agentes leem no início e usam `canvas_knowledge` / `canvas_remember`.
- **Fluxos (pipeline)**: nó "Fluxo" com passos (agente + instrução). Executa em sequência: digita a instrução no agente, espera ele chamar `canvas_done` e passa o resumo ao próximo (`{{input}}`, `{{prev}}`, `{{step1}}`). "Parar se o resumo contiver…" encerra o fluxo. O fluxo só roda enquanto o app está aberto.
  - **Paralelo**: o botão de colunas num passo faz ele rodar ao mesmo tempo que o passo de cima (agentes diferentes); o fluxo espera todos, e o `{{prev}}` seguinte traz uma linha `nome: resumo` por agente.
  - **Repetição**: "Se o resumo contiver X, voltar ao passo N, no máximo M vezes" (ex.: revisor reprovou → volta ao dev com a revisão em `{{prev}}`). Esgotadas as repetições, o fluxo segue e avisa.
  - **Tempo limite** por passo (15 min por padrão) e **orçamento** do fluxo em US$ (gasto dos agentes do fluxo desde o início; ao atingir, para e interrompe os agentes).
  - **Aprovação humana**: um passo "Aprovação" pausa o fluxo até você permitir, no diálogo do app ou pelo celular (o texto pode usar `{{prev}}`). Sem resposta no prazo (60 min por padrão) ou negado, o fluxo para.
  - Cada execução fica registrada (estado, rodadas, duração e gasto) em "Últimas execuções" e no histórico.
  - Antes de cada execução o app cria um **ponto de restauração**.
- **Notificações do sistema** (Configurações → Geral → Notificações): agente concluiu (com o resumo), agente esperando você, fluxo terminou ou parou, orçamento atingido. Só aparecem com a janela fora de foco; clicar traz o app e centraliza o terminal.
- **Custo e orçamento**: cada agente mostra tokens e o custo estimado pelo preço de API do modelo que aparece no log do CLI (Claude, Codex, Gemini). O painel de uso soma o gasto do workspace e aceita um **orçamento em US$**: ao atingir, os agentes do workspace são interrompidos, os fluxos param e novos fluxos ficam bloqueados até você aumentar o valor. A tabela de preços (US$ por 1M de tokens, por prefixo do modelo) fica em Configurações → Agentes e pode ser editada. Em planos por assinatura não há cobrança por token: o valor é o que custaria pela API.
- **Histórico por agente**: botão direito num terminal → Histórico… (ou Ctrl+K → "Histórico dos agentes"). É uma linha do tempo, com busca e filtro por tipo, que reúne:
  - o que você digitou;
  - o que foi pedido ao agente (fluxos, rotinas);
  - as mensagens e perguntas trocadas;
  - os resumos de `canvas_done`.

  O registro do que você digita pode ser desligado em Configurações → Agentes. Ele não vale para terminais de shell simples nem para uma linha digitada logo após um pedido de senha ou token.
- **Gasto por dia**: o painel de uso mostra um gráfico dos últimos 14 dias do workspace (`costs.json` na pasta de dados), a partir do crescimento do custo de cada conversa.
- **Pontos de restauração** (Configurações → Dados, ou Ctrl+K): cópias nomeadas de todos os workspaces, feitas por você, antes de cada fluxo e antes de restaurar (as 30 mais recentes). Restaurar mantém rodando os terminais que existem nas duas versões.
- **Estabilidade**: fechar o app (ou um terminal) encerra a árvore inteira de processos de cada terminal (agente, servidores MCP, servidores de dev). Erros internos vão para `logs/main.log` na pasta de dados e aparecem como um aviso discreto; Configurações → Diagnóstico → **Copiar diagnóstico** junta versões, estado dos agentes e o log recente para relatar problemas.
- **Concluído**: agentes chamam `canvas_done(resumo)` ao terminar; o terminal mostra "Concluído" e, se você estava fora da janela, ao voltar aparece o resumo de quem terminou.
- **Segurança do trabalho**: backup automático a cada 10 min (20 últimos, em `%APPDATA%gent-canvasackups`), gravação atômica, restauração automática se o arquivo estragar, exportar/importar workspaces (Configurações → Dados) e desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z).
- **Paleta (Ctrl+K)**: ir para workspace ou terminal, buscar na saída dos terminais e executar ações.
- **Primeira execução e diagnóstico**: ao abrir pela primeira vez, uma tela de boas-vindas mostra se cada agente (Claude, Codex, Gemini, Antigravity, OpenCode) está instalado, logado (estimativa a partir dos arquivos do CLI) e com o canvas registrado, com botão **Consertar**. Fica em Configurações → Diagnóstico. Um canvas vazio oferece "Criar um time".
- **Times prontos**: Desenvolvimento (maestro + dev + revisor + testador), Dupla e Revisão, já ligados por cordas, com instruções de papel e worktree por especialista (menu Adicionar → Time pronto…, ou Ctrl+K).
- **Rotinas agendadas** (Configurações → Rotinas): mandam uma instrução a um agente, ou iniciam um fluxo, todo dia em horário fixo, a cada N minutos ou uma vez. Só funcionam com o app aberto; um horário diário perdido é pulado.
- **Fluxos** continuam rodando se você abrir outro workspace.
- **Aparência por terminal**: botão direito num terminal → Aparência… (esquema, cores, fonte), sobrepondo as configurações globais só naquele terminal.
- **Idioma**: Português e English (Configurações → Geral → Idioma; automático por padrão, segue o idioma do sistema). A página do celular segue o idioma do navegador e as instruções dos times prontos são traduzidas; os briefings e skills que o app instala nos agentes continuam em português.
- **macOS**: menu nativo e atalhos com Cmd (⌘K paleta, ⌘, configurações, ⌘Z desfazer no canvas).
- **Controle de uso**: tokens por agente (Claude Code, Codex e Gemini; no Codex é a sessão mais recente da pasta do agente), limite configurável em Configurações → Agentes, e "Interromper todos os agentes" no painel de uso.
- **Controle remoto (celular)**: Configurações → Controle remoto. Liga um servidor HTTPS na sua rede Wi-Fi; você escaneia um QR code (uso único, 2 minutos) e o celular passa a ver os terminais ao vivo, digitar, aprovar pedidos dos agentes e interromper. Cada celular tem credencial própria, revogável; nada de configuração ou criação/exclusão pelo celular; 10 tentativas inválidas bloqueiam o endereço por 10 minutos. O certificado é autoassinado (o navegador avisa na primeira vez). Use só em redes de confiança.
- **Atividade e aprovação**: o botão de pergaminho (canto inferior direito) mostra a linha do tempo do que os agentes fizeram entre si. Em Configurações → Agentes → Segurança você escolhe pedir aprovação ao criar agentes (padrão), em tudo ou nunca; sem resposta em 2 minutos o pedido é negado.
- **Portal controlável**: o agente ligado a um Portal usa `canvas_portal` para abrir URLs (http/https), clicar, digitar, rolar e tirar capturas de tela. `canvas_peers` / `canvas_read` mostram e leem tudo que está ligado ao agente (notas, portais, árvores de arquivos, revisões).

## Estrutura

- `electron/` processo principal. `main.cjs` só inicializa; o resto fica em módulos:
  - `state.cjs`: estado compartilhado (terminais, grafo, janela).
  - `terminals.cjs`: PTYs, comando de cada agente, o que você digita.
  - `bridge.cjs`: API local que os agentes usam.
  - `window.cjs`: janela e menu do Mac.
  - `ipc.cjs`: configurações, rotinas, celular, git, histórico, pontos, custos.
  - Também: `proc.cjs` (encerra árvores de processos), `ledger.cjs` (gasto por dia), `inputlog.cjs`, `pricing.cjs`, registro do MCP, briefings e skills.
- `bin/` CLI `canvas` e servidor MCP (`canvas-mcp.cjs`), usados pelos agentes dentro dos terminais.
- `src/` interface React (canvas, sidebar, configurações, temas).
- `build/` ícone (`icon.svg` → `npm run icons`).

Dados do usuário (workspaces, configurações) ficam em `%APPDATA%\agent-canvas`, fora do repositório.
