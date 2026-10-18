# Code signing policy

**Status:** an application to the [SignPath Foundation](https://signpath.org) free code signing program for open source is in progress. Until it is approved, Windows installers are published **unsigned**. Once approved, the line below replaces this status:

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

- The Windows installer (`Solti-Setup-<version>.exe`) of every release published on [GitHub Releases](https://github.com/jvyctor/solti/releases).
- Only binaries built from this repository's source by the [Release workflow](.github/workflows/release.yml) on GitHub-hosted runners. Nothing built on a personal machine is ever signed.
- The product name (`Solti`) and the product version (same as `package.json` and the git tag `vX.Y.Z`) are set by the build for every file.
- macOS and Linux builds are not covered: SignPath signs Windows files only.

## How a release is signed

1. A maintainer pushes a version tag (`vX.Y.Z`) that matches `package.json` and has a section in `CHANGELOG.md`.
2. The Release workflow runs the tests on Windows, macOS and Linux, then builds the Windows installer.
3. The installer is submitted to SignPath from the workflow (origin verified by SignPath's GitHub integration).
4. An **approver** reviews and approves the signing request manually in SignPath.
5. The workflow takes the signed installer, rebuilds the auto-update files (`latest.yml`, `.blockmap`) for it, and attaches everything to the release.

## Team roles

| Role | Members |
|---|---|
| Committers and reviewers | [@jvyctor](https://github.com/jvyctor) |
| Approvers | [@jvyctor](https://github.com/jvyctor) |

- **Committers** may change the source code without further review.
- **Reviewers** review every change from contributors who are not committers (pull requests) before it is merged.
- **Approvers** approve each signing request.

All team members use multi-factor authentication for GitHub and SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. In detail:

| What | Where it goes | Can it be turned off? |
|---|---|---|
| Update check (version number only, no personal data) | GitHub Releases (`github.com`) | Yes: Settings → Updates → automatic updates |
| Claude plan quota shown in the usage panel, read with Claude Code's own local login | Anthropic (`api.anthropic.com`) | Yes: Settings → Agents → Privacy |
| Cloning a repository, pushing a branch for a PR | The git remote you chose | Only happens when you ask |
| Web pages opened in a Portal | The sites you open | Only happens when you ask |
| Phone remote | Your phone, on your local network | Off by default |

There is no telemetry, analytics or crash reporting. The agent CLIs you run in Solti (Claude Code, Codex, Gemini CLI, OpenCode, Antigravity) talk to their own providers under their own privacy policies:

- [Anthropic](https://www.anthropic.com/legal/privacy)
- [OpenAI](https://openai.com/policies/privacy-policy)
- [Google](https://policies.google.com/privacy)

Solti does not change those connections.

## Reporting

Report a signed binary that does not match this policy, or any security issue, privately via [GitHub security advisories](https://github.com/jvyctor/solti/security/advisories/new).

---

## Maintainer setup (one time)

1. Apply at [signpath.org/apply](https://signpath.org/apply). The program requires:
   - an OSI license (MIT);
   - no proprietary components;
   - releases already published;
   - this policy page;
   - multi-factor authentication for the whole team.
2. After approval, in SignPath:
   - add the predefined **GitHub.com** trusted build system and link it to the project;
   - install the SignPath GitHub App on this repository;
   - create an artifact configuration with a ZIP root, because `actions/upload-artifact` uploads a ZIP:

   ```xml
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <zip-file>
       <pe-file path="Solti-Setup-*.exe">
         <authenticode-sign />
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```

3. In GitHub, go to **Settings → Secrets and variables → Actions** and add:
   - the secret `SIGNPATH_API_TOKEN`;
   - the variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG`.

   The Release workflow signs as soon as `SIGNPATH_ORGANIZATION_ID` is set.
4. Replace the **Status** at the top of this page with the attribution line, as the program requires. Keep the "Code signing policy" link on the home page and in the release notes.
