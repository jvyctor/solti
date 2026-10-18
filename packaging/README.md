# Package managers

Every release updates these files automatically: the `packages` job of the [Release workflow](../.github/workflows/release.yml) runs [`build/package-managers.cjs`](../build/package-managers.cjs), which takes each installer's sha256 from the GitHub release. Do not edit them by hand.

| Manager | Install | Where it lives | Updated by |
|---|---|---|---|
| Scoop (Windows) | `scoop bucket add solti https://github.com/jvyctor/solti`<br>`scoop install solti` | [`bucket/solti.json`](../bucket/solti.json) in this repo | Release workflow (commit to main) |
| Homebrew (macOS) | `brew tap jvyctor/solti https://github.com/jvyctor/solti`<br>`brew install --cask solti` | [`Casks/solti.rb`](../Casks/solti.rb) in this repo | Release workflow (commit to main) |
| winget (Windows) | `winget install jvyctor.Solti` | [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) (copy in [`winget/`](winget)) | Release workflow, with the `WINGET_TOKEN` secret |
| AUR (Arch Linux) | `yay -S solti-bin` | [aur.archlinux.org/packages/solti-bin](https://aur.archlinux.org/packages/solti-bin) (copy in [`aur/`](aur)) | Release workflow, with the `AUR_SSH_PRIVATE_KEY` secret |

Installs from Scoop and the AUR leave updates to the package manager: the app shows the command (`scoop update solti`, `yay -Syu solti-bin`) instead of downloading the installer itself. It knows this from `resources/.managed-by`, which the Scoop manifest and the PKGBUILD write.

## One-time setup (maintainer)

### winget

The first version has to be submitted by hand. After that, wingetcreate updates it on every release.

1. Install the tool: `winget install Microsoft.WingetCreate`.
2. Submit the manifests in `packaging/winget`:
   - create a classic GitHub token with the `public_repo` scope;
   - run `wingetcreate submit packaging/winget --token <token>`.

   This opens a PR in microsoft/winget-pkgs. Automated checks run first, then a moderator reviews it, usually within a few days.
3. Once it is merged, add the same token as the repository secret `WINGET_TOKEN`.

### AUR

1. Create an account at [aur.archlinux.org](https://aur.archlinux.org/register) and add an SSH public key to it.
2. Create the package by pushing it for the first time. On Linux:
   ```sh
   git clone ssh://aur@aur.archlinux.org/solti-bin.git
   cp packaging/aur/PKGBUILD packaging/aur/.SRCINFO solti-bin/
   cd solti-bin && git add . && git commit -m "Initial import" && git push
   ```
3. Add the private key as the repository secret `AUR_SSH_PRIVATE_KEY`.

### Scoop and Homebrew

Nothing to set up. This repository is both the Scoop bucket and the Homebrew tap.

Later, a separate `jvyctor/homebrew-solti` repository would allow the shorter `brew install --cask jvyctor/solti/solti`. Getting into Scoop's `extras` bucket or the official Homebrew casks takes more popularity, and stars count.
