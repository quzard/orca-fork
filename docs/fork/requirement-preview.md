# Requirement preview

This is a separate Orca build for trying the requirement overview. It is not ready to install over a daily Orca until the Mac package is built and checked on the build machine. This checkout has not produced that `.app`.

The preview does not copy a daily profile, does not register the `orca://` handler, does not check for updates, and does not open SSH, WSL, or any other shared remote runtime. A remote daemon shares its socket and storage with the daily app. Local terminals stay in this app's own userData daemon directory. The userData directory is always `Application Support/Orca Requirement Preview`. There is no path override. A daily build ignores `ORCA_REQUIREMENT_PREVIEW` and strips that variable from terminal environments. It does not install or edit login items. The preview does not install or remove `/usr/local/bin/orca`.

## Mac package

Do not run `build-mac-local.mjs` by itself. That command only invokes electron-builder. If `out/` from a daily build is still on disk, the package can pick up the daily daemon and CLI. Use the preview command, which compiles the preview tree first and refuses to continue when that tree is missing:

```sh
node fork/scripts/build-requirement-preview.mjs
node fork/scripts/build-requirement-preview.mjs dmg:arm64 zip:arm64
```

The first command writes `out-requirement-preview/` (main, daemon, CLI, and `requirement-preview-build.json`). The second command, on a Mac, packages only after that tree is complete. electron-builder then writes `dist-requirement-preview/` and names the Mac artifacts `orca-requirement-preview-macos-<arch>`. Unpack globs and the packaged main entry use `out-requirement-preview/`. The daily `out/` directory is excluded. A missing preview daemon does not fall back to `out/main/daemon-entry.js`.

Daily publish checks the selected `dist` and `latest-mac.yml`. A sibling `out-requirement-preview/` directory does not block a daily `dist`. A preview artifact name, preview app bundle, or preview marker inside the daily `out/` tree does, even when `ORCA_REQUIREMENT_PREVIEW` is unset.

The archive is named Orca Requirement Preview. Its bundle id is `com.quzard.orca.requirement-preview` and its URL scheme is `orca-requirement-preview`. Install it beside the daily app, not on top of it.

A local fixture with generic repository names:

```sh
sh fork/scripts/requirement-preview-fixture.sh
```

Open the printed parent directory as a folder workspace. In the preview build, that row has a Requirement button. It opens the overview and Dry run without any saved lineage. Apply links workspace lineage and unarchives an adopted member. It does not create projects by itself, does not reparent a workspace that already has another parent, and does not run `git submodule` commands.

## What the preview does

The sidebar groups a host, then a requirement, then the requirement root and the member workspaces. The root label comes from `fork.requirement.root`. A member whose directory is named `root` stays a member. The requirement header opens an overview and does not start a terminal. Entering a member or the requirement root uses the existing workspace terminal. Overview filters stay with that requirement. Review can show two chosen files. A relative-base file is the blob at the merge base, not the working tree. Review does not stage or merge. Parent source control keeps `docs` and `.gitmodules` and hides nested worktree paths. Local stage all passes those paths as git excludes. Remote stage all is turned off, because this preview does not change a remote host.

## What was not launched here

Electron GUI smoke is not part of the happy-dom tests. If a later check launches the app, it must be the preview binary with `ORCA_BACKGROUND_LAUNCH=1`, and it must not install over `/Applications/Orca.app`.
