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

## Estrutura

- `electron/` processo principal: PTYs, bridge HTTP local, registro do MCP, configurações, briefings e skills.
- `bin/` CLI `canvas` e servidor MCP (`canvas-mcp.cjs`), usados pelos agentes dentro dos terminais.
- `src/` interface React (canvas, sidebar, configurações, temas).
- `build/` ícone (`icon.svg` → `npm run icons`).

Dados do usuário (workspaces, configurações) ficam em `%APPDATA%\agent-canvas`, fora do repositório.
