# Syncing develop with upstream

`develop` is the integration branch. It currently starts from upstream `17a2bced1115f064e834e397c2b949d9e150d275` plus the fork commits on that head. `fork/base` remains an alias of the commit that was moved onto `develop`; the daily jobs do not move it. `fork/base-upstream` remains the upstream pointer a human last pushed. The daily cloud job creates that ref locally from `upstream/main` before rewriting the skill pin, and does not push it. Feature work lands in `src/fork/` and should not rewrite upstream files beyond the hooks in [HOOKS.md](./HOOKS.md).

The unattended jobs are documented in [DAILY.md](./DAILY.md). GitHub Actions on this fork stay disabled.

## One-time git config

`merge=ours` in `.gitattributes` does nothing until this repo defines the driver. `rerere` remembers hook conflict resolutions. Each `merge=ours` entry is its own later line. Do not append it to an existing `text eol=lf` line: the skill-guide check requires that pin to stay exact, and a later line overrides only the `merge` attribute.

```bash
git config rerere.enabled true
git config merge.ours.driver true
```

`merge.ours.driver true` keeps the current branch’s copy of a generated file. After the merge, regenerate that file from the merged sources and commit the result. Do not leave a stale manifest in place.

Generated paths marked `merge=ours`:

- `resources/skills/current-manifest.json` (and the rest of `resources/skills/*.json`)
- `src/cli/bundled-skill-guides.ts`
- `skills/*/SKILL.md`
- `src/shared/rpc-contract/rpc-params-catalog.generated.ts`
- `src/renderer/src/i18n/en-runtime-required.json`
- `src/main/acp/generated/*.generated.ts`

## Rebase

```bash
git fetch https://github.com/stablyai/orca.git main
git checkout develop
git rebase <upstream-main-sha>
```

Conflicts should be limited to the `// fork:` lines listed in HOOKS.md. Keep the upstream side, then re-apply the hook call if the surrounding function moved. After the first resolution, `git rerere` replays it on the next sync.

```bash
git rerere status
# fix the file, then
git add <file>
git rebase --continue
```

Then regenerate catalogs and skills from the scripts in `package.json` (`verify:rpc-params-catalog`, `verify:bundled-skill-guides`, `verify:skill-bundle-manifest`, `verify:localization-runtime-catalog`) and run the checks in [VERIFY.md](./VERIFY.md).

Rewrite the skill clone ref and commit that file with the sync:

```bash
node fork/scripts/sync-skills-source-commit.mjs
```

The script writes the same module to `src/cli/skills-source-commit.ts` and `src/fork/skills-source-commit.ts`. The CLI copy is the one `out/cli/**` unpacks; `src/cli/index.ts` does not import `src/fork`. It uses `git merge-base HEAD fork/base-upstream`, then `origin/fork/base-upstream`. If that ref is missing, it uses `upstream/main`, then `origin/upstream/main`. If those are missing too, it keeps the checked-in pin. A fork build must not clone `stablyai/orca` at its own commit.

## Local Mac package

`fork/scripts/install-mac-release.sh` runs the macOS release job's commands. It does not keep a second electron-builder config. The overrides are the signing identity (`CSC_NAME` and `ORCA_COMPUTER_MACOS_SIGN_IDENTITY` set to `Orca Local Signing`, `CSC_IDENTITY_AUTO_DISCOVERY=false`), the version suffix from `config/scripts/build-mac-local.mjs`, an Apple Silicon-only Electron package, and the backup/install/rollback at the end of the script.

Every fork Mac is Apple Silicon. The x64 package's afterPack check starts the user's interactive shell under Rosetta and timed out waiting for `OK 42` (`the x64 terminal host did not serve a PTY`). `electron-builder --arm64` does not remove that package: `config/electron-builder.config.cjs` lists `arch: ['x64', 'arm64']` on the dmg and zip targets, and an empty CLI target list keeps those arches (`computeArchToTargetNamesMap` uses the config arch when the CLI target names are empty). `electron-builder --mac dmg:arm64 zip:arm64` names the targets, so the config arch list is not applied and afterPack runs only for arm64. `config/scripts/build-mac-local.mjs` appends its extra arguments after `--mac` so the installer can pass those two targets. `verify-packaged-daemon-entry.cjs` is unchanged. `pnpm build:mac` still follows the config and can build both arches; the fork installer does not call it.

Commands it runs, in order:

1. `pnpm install --frozen-lockfile --cpu=arm64` and `pnpm --dir mobile install --frozen-lockfile` (`--fast` skips both). The host Node must be arm64.
2. `pnpm run build:release`.
3. Host `darwin-arm64` orcad lane: `pnpm build:orcad-prebuilds`, `--require-slots` of `node config/scripts/build-orcad-prebuilds.mjs --print-slot`, `--smoke`. The host slot must be `darwin-arm64`. Linux slots: `bash fork/scripts/build-orcad-linux-prebuilds.sh` (`--fast` skips a slot that already passes `--require-slots`). Then `node config/scripts/build-orcad-template.mjs --targets darwin-arm64,linux-x64-glibc,linux-arm64-glibc`. `ORCA_ORCAD_TEMPLATE_TARGETS` is that list and `ORCA_REQUIRE_ORCAD_TEMPLATE=1`. `linux-x64-glibc217` is not in the list; the template script stages it when the `linux-x64-glibc` prebuild's compat slot is present.
4. `node config/scripts/runtime-file-watcher-fault-harness.mjs`, then the same file under `ELECTRON_RUN_AS_NODE=1` via `pnpm exec electron`.
5. `node config/scripts/pinned-node-downloads.mjs darwin-arm64`, `pnpm run ensure:electron-runtime`, and `node config/scripts/build-mac-local.mjs dmg:arm64 zip:arm64`. The built app is `dist/mac-arm64/Orca.app`.

After packaging, the script fails unless `Contents/Resources/orcad-template/orcad-template.json` exists and its `targets` include `linux-x64-glibc`, `linux-arm64-glibc`, `linux-x64-glibc217`, and `darwin-arm64`, and unless `Contents/Resources/app.asar.unpacked/out/cli/skills-source-commit.js` exists. It then runs `verify-skills-cli-runtime` on that unpacked tree.

Skipped, because the upstream step needs a CI secret or an artifact this machine cannot produce:

- `node config/scripts/verify-macos-release-env.mjs`. It requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, and `CSC_KEY_PASSWORD`. The script forces `ORCA_MAC_RELEASE`, `ORCA_MAC_HOURLY`, `ORCA_MAC_DAILY`, and `ORCA_MAC_ADHOC` to `0` and unsets `CSC_LINK` plus the Apple variables, so notarization stays off. Upstream's own message for this case is to use the local packager (`build-mac-local.mjs`) instead of the notarized release command.
- Downloading the `orcad-template` artifact from the parent release-cut run. That needs `release_run_id` and `GITHUB_TOKEN`, and the published template cannot be reused: `orcad.js` is the esbuild bundle of `src/main/orcad/main.ts`, which imports `orcad-entry.ts` and calls `registerForkMainModules`. Shipping the upstream artifact would drop those hooks on SSH hosts. `fork/scripts/build-orcad-linux-prebuilds.sh` instead runs the CI images from `linux_glibc_floor` and `linux_glibc217_compat` (`manylinux_2_28` x86_64 and aarch64, and `manylinux2014_x86_64`). The host downloads the pinned Node; the container compiles with `--slot` and smokes. A cache outside the checkout (`ORCA_NODE_RUNTIME_CACHE_DIR`; on the home Mac the default is `~/Projects/orca-verify/node-runtime-cache`) is mounted at `/node-runtime-cache`. A cache inside the checkout is reached through the repo mount at `/work`. The script does not `pnpm install` inside the image. Docker must be able to run `linux/amd64` and `linux/arm64`. musl, win32, and `darwin-x64` are still absent: the prebuild script only labels the machine it is actually running on, and an Apple Silicon Mac cannot emit the `darwin-x64` slot. SSH to one of those hosts still fails later. The full matrix remains the `desktop_template` job.
- The parent-run conclusion check (`gh api .../actions/runs/<id>`). It needs `GH_TOKEN` and a parent run, and it only guards a GitHub publish.
- `electron-builder --mac` with GitHub publish. That would upload to `stablyai/orca` and needs `GH_TOKEN`. `build-mac-local.mjs` is the upstream command that packages macOS without publishing and stamps `ORCA_LOCAL_BUILD_VERSION`. Do not set that variable in the shell; the script reads `CFBundleShortVersionString` from the built app. The installer adds `dmg:arm64 zip:arm64` after `--mac`.
- `assert-github-release-is-draft.mjs`. There is no GitHub release.
- `verify-telemetry-constants.mjs`. It needs `ORCA_POSTHOG_WRITE_KEY` compiled into the app. That secret is not set, so a local build has no PostHog write key. `ORCA_DIAGNOSTICS_TOKEN_URL` is the public release URL and is set.
- Restoring `release-javascript` from a parent run (`ORCA_RELEASE_JAVASCRIPT_SOURCE_SHA`). The wrapper always takes the workflow's other branch, `pnpm run build:release`.

`pnpm build:mac` is not used. It typechecks and rebuilds the desktop assets that `build:release` already built, and it does not build the orcad template.
