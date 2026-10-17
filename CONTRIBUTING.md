# Contributing to Agent Canvas

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/jvyctor/agent-canvas/issues/new/choose) and include:

- What you did, what you expected and what happened.
- **Settings → Diagnostics → Copy diagnostics**, pasted into the issue. It contains versions, the agent checks and the recent error log, and nothing from your files.
- Your OS, and which agent CLIs are involved (Claude Code, Codex, Gemini CLI, OpenCode, Antigravity).

## Development setup

Requirements: Node.js 22+ and git. Agent CLIs are optional (a plain shell terminal works for most changes).

```bash
git clone https://github.com/jvyctor/agent-canvas.git
cd agent-canvas
npm install
npm run dev        # Vite + Electron with hot reload
```

If `npm install` skips Electron's download, run `node node_modules/electron/install.js`.

## Tests

| Command | What it runs | Where |
|---|---|---|
| `npm run test:unit` | Logic tests, no UI (seconds) | any OS |
| `npm run build && npm run test:smoke` | App opens, the shell runs the `canvas` CLI, quitting ends the terminal | any OS (Linux: `xvfb-run -a`) |
| `npm run build && npm test` | Everything, including the UI tests that drive real terminals | Windows (PowerShell) |

CI runs the unit and smoke tests on Windows, macOS and Linux for every push and pull request.

## Project layout

```
electron/   main process
  main.cjs        start-up only
  state.cjs       shared state (terminals, graph, window)
  terminals.cjs   ptys, agent launch, what you type (history)
  bridge.cjs      local API the agents call (canvas CLI / MCP)
  window.cjs      window and macOS menu
  ipc.cjs         settings, routines, phone remote, git, history, costs…
bin/        `canvas` CLI and the MCP server agents use
src/        React UI (canvas, nodes, pipelines, settings)
test/       node:test suites (unit, smoke, UI)
```

## Pull requests

- Keep changes focused, and add or adjust a test for behaviour changes.
- UI strings are written in Portuguese and passed through `tr()`. Add the English text to `src/locales/en.js` (the English UI test fails on any untranslated string).
- Run `npm run test:unit` before pushing.
- Describe the change from the user's point of view. Add an entry under **Unreleased** in `CHANGELOG.md`.

## Releasing (maintainers)

1. Move the **Unreleased** notes in `CHANGELOG.md` to a new version heading, and set the same version in `package.json`.
2. Commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The Release workflow tests on the three OSes, builds every installer and publishes a GitHub Release with that version's changelog section as notes.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
