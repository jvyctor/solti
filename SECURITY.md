# Security

Solti runs AI agents in real terminals on your machine, so security reports matter a lot to us.

## Reporting a vulnerability

Please **do not open a public issue**. Use [GitHub's private vulnerability reporting](https://github.com/jvyctor/solti/security/advisories/new) instead, with steps to reproduce and the version affected. You will get an answer within a few days.

## What is in scope

- The **local bridge** (`127.0.0.1`, random port, secret token in `CANVAS_URL`) that agents use to talk to each other.
- The **phone remote**: an HTTPS server on your LAN with one-time QR pairing, per-device credentials, lockout after failed attempts, and optional plain HTTP that is off by default.
- **Approvals**: agents asking to create agents, message each other or drive a browser portal.
- Anything that lets a web page shown in a **Portal**, or a file an agent reads, make the app act without your approval.

## Good to know

- Agents run with **your** user permissions, in the folders you choose. Isolate work with the per-agent git worktree option, and turn on **Settings → Agents → Ask for your approval → Everything** if agents read untrusted content.
- The app never sends your code or prompts anywhere. Agent CLIs talk to their own providers as usual. On its own, the app only checks for updates (GitHub Releases) and reads the Claude quota with Claude Code's own local login. Everything else happens only when you ask for it: cloning a repository, pushing a branch for a PR, and the pages you open in Portals.
- Release builds are **not code-signed** yet. Download only from this repository's [Releases](https://github.com/jvyctor/solti/releases).
