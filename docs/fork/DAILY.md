# Daily upstream sync and Mac publish

`develop` is the integration branch and the repo's default branch. It is kept apart from upstream's `main` by name. Upstream is merged in, never rebased, so `develop` only moves forward and is never force-pushed. `fork/base` stays as an alias of the commit that became the integration branch and is not moved by these jobs. `fork/base-upstream` stays the last upstream commit a human pushed there.

GitHub Actions on this fork stay disabled. Neither job calls `workflow_dispatch` or deletes `.github/workflows`. A later upstream merge would restore deleted workflow files, and turning Actions on would run them.

## Cloud agent: merge and checks

Run on a fresh Linux checkout with Node 24, pnpm 12.8.1, and `git config user.name` / `user.email` set:

```bash
bash fork/scripts/daily-sync.sh
```

The script fetches `upstream` (`https://github.com/stablyai/orca.git`) and `origin/develop`, checks out `origin/develop`, and merges `upstream/main` into it with `git merge --no-ff` (message `Merge upstream main through <sha> (<n> commits)`). It then points the local `fork/base-upstream` ref at `upstream/main` and runs `node fork/scripts/sync-skills-source-commit.mjs`. That local ref is what the pin script reads first. The job does not push `fork/base-upstream`.

If the localization runtime catalog verify (`pnpm run verify:localization-runtime-catalog`) fails after a merge, run `pnpm sync:localization-runtime-catalog` manually, review the regenerated `src/renderer/src/i18n/en-runtime-required.json`, and commit it on the attempt branch.

On a clean merge and green checks it pushes `develop` with a plain, non-force push. The push is a fast-forward; if someone else moved `develop` in the meantime, GitHub rejects it and nothing is overwritten. The push updates that branch ref only. It does not push tags or any other branch. Exit code is 0. The summary lines are `daily-sync: OK`, `upstream:`, and `develop:`.

Checks, in order: `check-no-internal-refs.sh`, `pnpm install --frozen-lockfile`, `pnpm exec oxlint`, the RPC / skill-guide / skill-manifest / localization-runtime catalog verifies, fork Vitest plus `src/shared/fork-hooks/update-feed.test.ts`, `pnpm tc`, then the host Linux orcad prebuild, smoke, `pnpm install --frozen-lockfile --dir mobile`, `pnpm build:mobile-web`, and `build-orcad-template.mjs` for that host slot. Set `ORCA_SYNC_DOCKER_SLOTS=1` to also run `fork/scripts/build-orcad-linux-prebuilds.sh` and stage `linux-x64-glibc,linux-arm64-glibc`. The home Mac package still builds those slots.

On a merge conflict, or when a check fails after new commits exist, the script does not update `origin/develop`. It pushes the attempt to `sync/upstream-YYYYMMDD` (`ORCA_SYNC_TZ`, default UTC) with a plain push; if that branch already exists, it uses `-2`, `-3`, … instead, so an earlier manual resolution is never overwritten. An existing `sync/upstream-YYYYMMDD[-n]` branch that already holds the same attempt is reused and not pushed again. That is the same commit, or a branch whose commits from `origin/develop` match this attempt one for one: same count, same tree at each step, and the same upstream merge parent. A re-run after a conflict or a failed check makes new merge and pin commit SHAs, and still matches. A branch with any extra commit on top, such as a manual fix, never matches, even when its tree is unchanged, so the next run uses a new `-n`. A rejected `develop` push (someone moved it during the run) is reported the same way and parks the merge on an attempt branch. A conflict commit is a two-parent merge commit (`develop` and the upstream sha) whose tree contains every conflict marker. Exit code is non-zero. The summary names the reason, the untouched `develop` sha, and the attempt branch. Resolve that branch and open a PR against `develop`; merge it with a merge commit or fast-forward, never with rebase or squash, so the upstream parent is kept.

A dirty worktree, or a check failure when `HEAD` is still `origin/develop`, exits non-zero and pushes nothing.

## Home Mac: build, sign, publish

LaunchAgent `com.orca.fork.mac-auto-update` runs `~/Projects/orca-verify/bin/mac-auto-update.sh`, a copy outside the checkout. The installer refreshes that copy. The script also re-executes itself from a temp file before any git command, so `git reset --hard origin/develop` cannot rewrite the file that is running. After a run that published the updater, including a run whose dmg is still pending, it refreshes the installed copy with `cp` to `.next` and `mv`. A `skipped` run does not. A run that failed before the release was public leaves the previous copy in place.

That script fetches `origin/develop`. When that sha is not the last fully published sha, it resets a clean `develop` checkout to the remote tip (reflog keeps the previous tip), seeds the glibc 2.17 Node archive, and runs `fork/scripts/install-mac-release.sh --build-only`. Signing stays `Orca Local Signing`. It does not install the app. It does not download the zip or dmg back from the release.

`~/Projects/orca-verify/sync.env` must set `ORCA_BUILD_RELEASES=1` and `ORCA_PUBLISH_RELEASE=1`. `fork/scripts/publish-mac-release.sh` publishes a prerelease on `quzard/orca-fork`, tagged `v<version>` at the built commit. The release stays a draft until the updater files are on it, in this order: each mac zip, that zip's `.blockmap`, then `latest-mac.yml`. That yml lists only the zips. The draft is published as soon as those files are uploaded, and the dmg plus its `.blockmap` are uploaded to the same release afterwards. Installed apps can update while the dmg is still uploading. electron-updater's GitHub provider reads `latest-mac.yml` and requires every file named there to already be an asset; it then downloads the zip. Differential updates also need the zip `.blockmap`. The provider does not download the dmg. Linux SSH prebuilds are packed inside the app by the build and are not release assets. If a later dmg upload fails, the release stays published, `sync-status.json` uses `published-dmg-pending` for both `result` and `release`, and the next run uploads only the missing dmg files. It does not create a second release or a second copy of the zip. A finished release is `published`. Before publishing an existing release, the script may download the small `latest-mac.yml` already on it, and replaces that file when it names something that is not uploaded yet. The home Mac needs `gh` logged in with write access to `quzard/orca-fork`. Client Macs do not need `gh`. The private GitHub provider asks for `latest-mac.yml`; the anonymous public provider tries `local-mac.yml` first and then `latest-mac.yml`. The script has no built-in proxy. If the home Mac needs one, set `ORCA_PROXY=<proxy url>` in `sync.env`; the script uses it for `http_proxy`, `https_proxy`, and `ALL_PROXY` (and the upper-case `HTTP_PROXY` / `HTTPS_PROXY`) unless `sync.env` sets those directly. Without either, it runs without a proxy. It always sets Node's `NODE_USE_ENV_PROXY=1`.

launchd does not load the login shell's `PATH`. The script and the LaunchAgent plist prepend `/opt/homebrew/bin`, `/usr/local/bin`, `~/.orbstack/bin`, and `/Applications/OrbStack.app/Contents/MacOS/xbin`. OrbStack's `docker` lives in that app `xbin` when `~/.orbstack/bin` is absent. `build-orcad-linux-prebuilds.sh` checks the same directories if `docker` is still missing. `sync.env` does not need a Docker `PATH` line. The LaunchAgent runs the copy in `~/Projects/orca-verify/bin`. Re-run `bash fork/scripts/install-mac-auto-update-agent.sh` after pulling a change to this script. A run that did not publish leaves the previous copy in place. A run that published the updater refreshes the copy even when the dmg is still pending.

`gh auth status` runs only after the "already published" check. A sha whose status is `published` does not contact `gh`. `published-dmg-pending` does contact `gh` and retries the dmg. If auth fails, `sync-status.json` keeps the previous `release` value and sets `ghAuth` to `failed` with the reason in `error`. It does not mark that sha `skipped`. When `dist/` still contains that sha (the local version suffix embeds the 12-character commit), the next successful auth publishes those files and does not build or sign again.

A background `codesign` under launchd can stop on a keychain prompt for the `Orca Local Signing` private key and never finish. After install, and before `--bootstrap`, run the installed script once from Terminal and click Always Allow. The build runs in its own process group. A `codesign` in that group that runs longer than `ORCA_CODESIGN_TIMEOUT_SECONDS` (default 600) causes the whole group to be killed, so electron-builder and node do not keep writing `dist/`. A denial (`errSecInternalComponent`, `errSecAuthFailed`, `errSecInteractionNotAllowed`, or "User interaction is not allowed") is recorded in `sync-status.json` instead of leaving the job hung. A lock file stops a second run from building while the first is alive.

Status file: `~/Projects/orca-verify/sync-status.json` (`sha`, `installedSha`, `builtSha`, `version`, `result`, `startedAt`, `finishedAt`, `error`, `release`, `ghAuth`). `result` is `published`, `published-dmg-pending`, `up-to-date`, `built`, `skipped`, or `failed`. `published` means the zip, its blockmap, `latest-mac.yml`, and the dmg are all on the release. `published-dmg-pending` means the updater can already see the release and the dmg upload still needs another run. The build log is `~/Projects/orca-verify/mac-build.log`; each run truncates it.

The glibc 2.17 tarball is not downloaded from the unofficial Node host. Place `node-v24.21.0-linux-x64-glibc-217.tar.gz` (sha256 `b1d164136d4b218d663e664f40ba5e260ebc07f90e2bd784c63a57d8c0e6aa8a`) in `~/Projects/orca-verify/node-runtime-cache/`, or set `ORCA_NODE_UNOFFICIAL_MIRROR` in `sync.env` to a URL or base that serves that exact archive. That directory is the default `ORCA_NODE_RUNTIME_CACHE_DIR`. It stays outside the checkout so `git clean` does not delete it. The Linux prebuild mounts it into the manylinux container at `/node-runtime-cache` and rewrites the pinned Node path. Leave the variable unset. Do not point it at `out/node-runtime-cache` inside the repo.

LaunchAgent `com.orca.fork.mac-auto-update` runs the script at login and every 30 minutes. It uses the Mac's local timezone only for the clock; the interval is not a 03:00 schedule. Codesign needs an unlocked login keychain, so the user stays logged in. Locking the screen is fine. Logging out skips the run.

```bash
mkdir -p ~/Projects/orca-verify/node-runtime-cache
# copy the glibc 2.17 archive into that directory
printf '%s\n' 'ORCA_BUILD_RELEASES=1' 'ORCA_PUBLISH_RELEASE=1' > ~/Projects/orca-verify/sync.env
# only if this Mac needs a proxy:
# echo 'ORCA_PROXY=<proxy url>' >> ~/Projects/orca-verify/sync.env
# gh auth status must succeed, with write access to quzard/orca-fork
bash fork/scripts/install-mac-auto-update-agent.sh
ORCA_REPO="$PWD" ~/Projects/orca-verify/bin/mac-auto-update.sh
# click Always Allow on the Orca Local Signing prompt, then:
bash fork/scripts/install-mac-auto-update-agent.sh --bootstrap
```

Run the installer from the checkout. The installed copy cannot infer the repo, so the manual run sets `ORCA_REPO`. Do that manual run before `--bootstrap`: `RunAtLoad` would otherwise show the keychain prompt under launchd, where it cannot be clicked.

An agent installed earlier still points its plist at `fork/scripts/mac-auto-update.sh` inside the checkout. That copy re-executes from a temp file, so `git reset` does not cut it off mid-run, but it is not the stable path. Re-run `bash fork/scripts/install-mac-auto-update-agent.sh`, run `ORCA_REPO="$PWD" ~/Projects/orca-verify/bin/mac-auto-update.sh` once and click Always Allow, then `bash fork/scripts/install-mac-auto-update-agent.sh --bootstrap`.

Remove the agent with `bash fork/scripts/uninstall-mac-auto-update-agent.sh`. Installing the plist does not load the agent until `--bootstrap`.

## In-app updates

Settings → Updates has an optional GitHub token field. The token is a fine-grained PAT with read-only Contents on `quzard/orca-fork`. It is stored as the contents of `~/.orca/github-update-token` with mode `0600`, via `writeSecureFile`. It is not put in the macOS Keychain and not put in `safeStorage`. The settings page can save or clear it. The saved value is not sent back to the window.

`quzard/orca-fork` is public, so the token is optional. Without the file, release checks read `quzard/orca-fork` anonymously through electron-updater's public GitHub provider (the releases atom feed and `releases/download` assets on github.com); `GH_TOKEN` / `GITHUB_TOKEN` are not used. With the file, they use electron-updater's private GitHub provider for `quzard/orca-fork` with that token, which gets the higher API rate limit. The file is re-read on every check, so removing it switches the next check to anonymous. If GitHub rejects the saved token (HTTP 401 or 403), that check falls back to the anonymous public provider for `quzard/orca-fork`, including the download it starts, and logs a warning that names only the status code. The next check tries the token again. `allowPrerelease` is on, because every fork release is a prerelease and `/releases/latest` would 404. The public provider first asks for `local-mac.yml` (from the `-local.` prerelease tag) and falls back to `latest-mac.yml`. A registered fork build does not list upstream versions, pin a specific upstream tag, or open `stablyai/orca` release notes. Unregistered (upstream) builds still use the public `stablyai/orca` feed.

The app already installed on each Mac still requests `https://github.com/stablyai/orca/releases/latest/download` until one manual install of a build that contains this hook. After that, both Macs update from the published prerelease. `1.4.228` sorts above `1.4.228-local.<timestamp>.<sha>`, so an unhooked build can still be offered the upstream stable release. A later local timestamp sorts above an earlier one under the `semver` package electron-updater uses.

ShipIt checks the downloaded zip against the running app's designated requirement (`codesign -d -r-`). The same `Orca Local Signing` certificate on both Macs satisfies that check. This tree does not run that replacement. The end-to-end check is: install an older fork build that contains this hook, publish a newer prerelease, then confirm the notification, the download, the install, and the relaunch. If ShipIt rejects the zip, install the dmg from the same release by hand.
