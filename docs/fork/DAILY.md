# Daily upstream sync and Mac publish

`develop` is the integration branch. `fork/base` stays as an alias of the commit that became `develop` and is not moved by these jobs. `fork/base-upstream` stays the last upstream commit a human pushed there.

GitHub Actions on this fork stay disabled. Neither job calls `workflow_dispatch` or deletes `.github/workflows`. A later rebase would restore deleted workflow files, and turning Actions on would run them.

## Cloud agent: rebase and checks

Run on a fresh Linux checkout with Node 24, pnpm 12.8.1, and `git config user.name` / `user.email` set:

```bash
bash fork/scripts/daily-sync.sh
```

The script fetches `upstream` (`https://github.com/stablyai/orca.git`) and `origin/develop`, checks out `origin/develop`, and rebases that branch onto `upstream/main`. It then points the local `fork/base-upstream` ref at `upstream/main` and runs `node fork/scripts/sync-skills-source-commit.mjs`. That local ref is what the pin script reads first. The job does not push `fork/base-upstream`.

On a clean rebase and green checks it pushes `develop` with `--force-with-lease` against the `origin/develop` sha it fetched. The push updates that branch ref only. It does not push tags or any other branch. Exit code is 0. The summary lines are `daily-sync: OK`, `upstream:`, and `develop:`.

Checks, in order: `check-no-internal-refs.sh`, `pnpm install --frozen-lockfile`, `pnpm exec oxlint`, the RPC / skill-guide / skill-manifest / localization-runtime catalog verifies, fork Vitest plus `src/shared/fork-hooks/update-feed.test.ts`, `pnpm tc`, then the host Linux orcad prebuild, smoke, and `build-orcad-template.mjs` for that host slot. Set `ORCA_SYNC_DOCKER_SLOTS=1` to also run `fork/scripts/build-orcad-linux-prebuilds.sh` and stage `linux-x64-glibc,linux-arm64-glibc`. The home Mac package still builds those slots.

On a rebase conflict, or when a check fails after new commits exist, the script does not update `origin/develop`. It pushes the attempt to `sync/upstream-YYYYMMDD` (`ORCA_SYNC_TZ`, default UTC). A conflict commit contains the conflict markers and stops at the first conflict. Exit code is non-zero. The summary names the reason, the untouched `develop` sha, and the attempt branch. Resolve that branch and open a PR against `develop`.

A dirty worktree, or a check failure when `HEAD` is still `origin/develop`, exits non-zero and pushes nothing.

## Home Mac: build, sign, publish

`fork/scripts/mac-auto-update.sh` fetches `origin/develop`. When that sha is not the last published sha, it resets a clean `develop` checkout to the remote tip (reflog keeps the previous tip), seeds the glibc 2.17 Node archive, and runs `fork/scripts/install-mac-release.sh --build-only`. Signing stays `Orca Local Signing`. It does not install the app and it does not download a release with `gh`.

`~/Projects/orca-verify/sync.env` must set `ORCA_BUILD_RELEASES=1` and `ORCA_PUBLISH_RELEASE=1`. Publish uploads `dist/latest-mac.yml`, the arm64 zip, dmg, and blockmaps as a prerelease on `quzard/orca`, tagged at the built commit (`v<version>`). The private GitHub provider asks for `latest-mac.yml`, not `local-mac.yml`. The script defaults the proxy to `http://127.0.0.1:6152` and Node's `NODE_USE_ENV_PROXY=1`.

Status file: `~/Projects/orca-verify/sync-status.json` (`sha`, `installedSha`, `builtSha`, `version`, `result`, `startedAt`, `finishedAt`, `error`, `release`). `result` is `published`, `up-to-date`, `built`, `skipped`, or `failed`.

The glibc 2.17 tarball is not downloaded from the unofficial Node host. Place `node-v24.21.0-linux-x64-glibc-217.tar.gz` (sha256 `b1d164136d4b218d663e664f40ba5e260ebc07f90e2bd784c63a57d8c0e6aa8a`) in `~/Projects/orca-verify/node-runtime-cache/`, or set `ORCA_NODE_UNOFFICIAL_MIRROR` in `sync.env` to a URL or base that serves that exact archive.

LaunchAgent `com.orca.fork.mac-auto-update` runs the script at login and every 30 minutes. It uses the Mac's local timezone only for the clock; the interval is not a 03:00 schedule. Codesign needs an unlocked login keychain, so the user stays logged in. Locking the screen is fine. Logging out skips the run.

```bash
mkdir -p ~/Projects/orca-verify/node-runtime-cache
# copy the glibc 2.17 archive into that directory
printf '%s\n' 'ORCA_BUILD_RELEASES=1' 'ORCA_PUBLISH_RELEASE=1' > ~/Projects/orca-verify/sync.env
bash fork/scripts/install-mac-auto-update-agent.sh --bootstrap
```

Remove it with `bash fork/scripts/uninstall-mac-auto-update-agent.sh`. Installing the plist does not load the agent until `--bootstrap`.

## In-app updates

Settings → Updates has a GitHub token field. The token is a fine-grained PAT with read-only Contents on `quzard/orca`. It is stored as the contents of `~/.orca/github-update-token` with mode `0600`, via `writeSecureFile`. It is not put in the macOS Keychain and not put in `safeStorage`. The settings page can save or clear it. The saved value is not sent back to the window.

With a token, release checks call electron-updater's private GitHub provider for `quzard/orca` only. `allowPrerelease` is on, because every fork release is a prerelease and `/releases/latest` would 404. Without a token there is no update check, and both the settings row and Check for Updates say so. Unregistered (upstream) builds still use the public `stablyai/orca` feed.

The app already installed on each Mac still requests `https://github.com/stablyai/orca/releases/latest/download` until one manual install of a build that contains this hook. After that, both Macs update from the published prerelease. `1.4.228` sorts above `1.4.228-local.<timestamp>.<sha>`, so an unhooked build can still be offered the upstream stable release. A later local timestamp sorts above an earlier one under the `semver` package electron-updater uses.

ShipIt checks the downloaded zip against the running app's designated requirement (`codesign -d -r-`). The same `Orca Local Signing` certificate on both Macs satisfies that check. This tree does not run that replacement. The end-to-end check is: install an older fork build that contains this hook, publish a newer prerelease, then confirm the notification, the download, the install, and the relaunch. If ShipIt rejects the zip, install the dmg from the same release by hand.
