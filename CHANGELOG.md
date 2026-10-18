# Changelog

All notable changes to Solti. Versions follow [Semantic Versioning](https://semver.org); the format follows [Keep a Changelog](https://keepachangelog.com).
Downloads for every version: [Releases](https://github.com/jvyctor/solti/releases).

## [Unreleased]
### Added
- [Code signing policy](CODE_SIGNING.md) with team roles and a privacy statement, ready for the SignPath Foundation's free code signing for open source. The Release workflow signs the Windows installer through SignPath as soon as it is configured, then rebuilds the auto-update files for the signed file.
- Settings → Agents → Privacy: turn off the Claude plan quota check, the app's only request to Anthropic.

## [0.8.2] - 2026-10-17
### Added
- **Try the demo**: a demo workspace with a maestro and three simulated agents that runs a full pipeline in plain shells: parallel steps, a reviewer that rejects and loops back to the dev, and your approval at the end. No AI CLI needed. Open it from the welcome screen (it is the main button when no CLI is installed), from an empty canvas or from `Ctrl/⌘+K`.
- **Agents are briefed in your language**: briefings, skills, the pipeline reminder and the messages typed into agents follow the app's language (English or Portuguese). Switching language rewrites the skills the app manages.
- An animated demo at the top of the README and on the download page.
- [Solti Teams waitlist](https://github.com/jvyctor/solti/discussions/1) on the download page and in the README.

### Fixed
- The app could fail to start in environments where the system data folder cannot be resolved early (seen with a custom home folder).

## [0.8.1] - 2026-10-17

**Agent Canvas is now Solti**, named after the conductor Georg Solti, because it conducts your agents. This is the first public release. Everything from 0.8.0 below is included.

### Changed
- New name: **Solti**. Your workspaces, settings, history and backups carry over: an existing "Agent Canvas" data folder is kept. Installing over Agent Canvas replaces it, so you do not end up with two copies.
- The repository moved to [jvyctor/solti](https://github.com/jvyctor/solti). Old links redirect.
- About shows a "Star on GitHub" card and links to what's new, the source and issues.

### Fixed
- The Claude quota card shows a clear message instead of a raw system error.
- History search: the icon sits next to the field.

## [0.8.0] - 2026-10-17

The first open-source release, and the first one for **macOS and Linux**.

### Added
- **macOS and Linux builds** (`.dmg` / `.zip` for Apple Silicon and Intel, `.AppImage` / `.deb`), tested in CI on every push.
- **Pipelines, much more capable**
  - **Parallel steps**: run several agents at once and wait for all of them. The next step gets one `name: summary` line per agent in `{{prev}}`.
  - **Loops**: "if the summary contains X, go back to step N, at most M times". A typical use: a reviewer that rejects sends the work back to the dev.
  - **Human approval step**: the pipeline pauses until you allow it, in the app or from your phone.
  - **Per-step timeout**, a **pipeline budget** in US$, and a list of **recent runs** (state, rounds, duration, spend).
  - A **restore point** is saved before every run.
- **Cost and budgets**
  - Estimated cost per agent, worked out from the model in each CLI's log (Claude Code, Codex, Gemini CLI).
  - A **workspace budget**: when it is reached, the workspace's agents are interrupted and its pipelines stop.
  - A **spend per day** chart covering 14 days.
  - An editable price table.
- **Agent history**: a searchable timeline for each agent, covering what you typed, what pipelines and routines asked, messages between agents and the `canvas_done` summaries.
- **Restore points**: named snapshots of every workspace, made by you or automatically. Restoring keeps running the terminals that exist in both versions.
- **System notifications**: an agent finished (with its summary), is waiting for you, a pipeline ended, or a budget was reached. Clicking one brings the app forward and shows the terminal.
- **Copy diagnostics** (Settings → Diagnostics): versions, agent checks and the recent error log, ready for a bug report.

### Changed
- Settings sections are listed in a sidebar, so every section is visible.
- The sidebar footer opens the agent history. New workspaces are created from the `+` at the top.
- Updates are now published in this repository.

### Fixed
- Gemini CLI could open the app 3–4 times on start: its MCP server launch dropped `ELECTRON_RUN_AS_NODE`. The app now also allows a single instance per profile.
- The `canvas` command was not found inside terminals on Windows (`Path` vs `PATH`).
- "Object has been destroyed" error dialog when closing the window.
- Closing the app or a terminal left agents and their child processes (MCP servers, dev servers) running. The whole process tree is now ended.
- macOS: terminals did not start (node-pty's `spawn-helper` without the execute bit).
- macOS/Linux: agent CLIs installed through Homebrew, nvm or `~/.local/bin` were not found when the app was opened from the Dock or a menu. The login shell's `PATH` is now loaded.
- An unexpected error now shows a small notice and is written to `logs/main.log`, instead of a blocking dialog.

## [0.7.0] - 2026-10-17
### Added
- Scheduled **routines**: send a prompt to an agent, or start a pipeline, daily, every N minutes or once.
- Ready-made **teams**: Development (maestro + dev + reviewer + tester), Pair and Review, already roped together.
- **Diagnostics** and a first-run welcome that checks every agent CLI (installed, logged in, canvas registered) and can fix it.
- Per-terminal look (scheme, colors, font). Full English UI. macOS application menu and Cmd shortcuts.
### Changed
- Pipelines keep running when you switch workspaces. Agents keep running while the window is minimised.

## [0.6.0] – [0.6.2] - 2026-10-16
### Added
- **Phone remote**: an HTTPS server on your Wi-Fi with QR pairing and revocable devices. From the phone you can watch terminals, type, approve agent requests and interrupt.
- Optional plain-HTTP listener for browsers that refuse the self-signed certificate.

## [0.5.0] - 2026-10-16
### Added
- `canvas_done`, **pipelines** (sequential steps that hand summaries to each other), a "while you were away" digest and the Done badge.
- Command palette (`Ctrl+K`) with search across terminal output.
- Undo/redo on the canvas. Rolling backups, atomic saves and export/import of workspaces.
- Token use for Codex and Gemini.

## [0.4.0] - 2026-10-16
### Added
- Activity timeline and an **approval gate** for actions agents take on each other.
- **Portal** control: agents can open, click, type into and screenshot a browser node.

## [0.3.0] – [0.3.1] - 2026-10-16
### Added
- **Git worktree per agent**, a **Review (Diff)** node (approve, merge, open a PR), shared **project knowledge**, live agent status, resuming conversations on restart, and token use with a limit and interrupt-all.
- Agents can read every connected node (notes, portals, file trees, diffs).

## [0.2.0] – [0.2.2] - 2026-10-16
### Added
- In-app updates, persistent terminal screens and terminal styling.

## [0.1.0] - 2026-10-15
- First version: terminals on a canvas, roped together, with a maestro and agents that talk through MCP tools.

[0.8.2]: https://github.com/jvyctor/solti/releases/tag/v0.8.2
[0.8.1]: https://github.com/jvyctor/solti/releases/tag/v0.8.1
[0.8.0]: https://github.com/jvyctor/solti/releases/tag/v0.8.0
[0.7.0]: https://github.com/jvyctor/agent-canvas-releases/releases/tag/v0.7.0
