# Requirement preview

This is a separate Orca build for trying the requirement overview. It is not ready to install over a daily Orca until the Mac package is built and checked on the build machine.

The preview does not copy a daily profile, does not register the `orca://` handler, does not check for updates, and does not open SSH, WSL, or any other shared remote runtime. A remote daemon shares its socket and storage with the daily app. Local terminals stay in this app's own userData daemon directory. The userData directory is always `Application Support/Orca Requirement Preview`. There is no path override. A daily build ignores `ORCA_REQUIREMENT_PREVIEW` and strips that variable from terminal environments. It does not install or edit login items.

## Mac package

From a checkout of this branch, with the existing Mac packaging flow:

```sh
export ORCA_REQUIREMENT_PREVIEW=1
export ORCA_MAC_RELEASE=0
node config/scripts/desktop-distribution/macos/build-mac-local.mjs dmg:arm64 zip:arm64
```

The archive is named Orca Requirement Preview. Its bundle id is `com.quzard.orca.requirement-preview` and its URL scheme is `orca-requirement-preview`. Electron-vite writes `out-requirement-preview/`. electron-builder writes `dist-requirement-preview/` and names the Mac artifacts `orca-requirement-preview-macos-<arch>`. Daily publish scripts exit if the preview env, a preview marker in `out/`, or that artifact name is present. Install it beside the daily app, not on top of it.

A local fixture with generic repository names:

```sh
sh fork/scripts/requirement-preview-fixture.sh
```

Open the printed parent directory as the existing folder workspace. The overview opens for that folder even before any member is linked, so Dry run is reachable on a fresh profile. Apply links workspace lineage and unarchives an adopted member. It does not create projects by itself, does not reparent a workspace that already has another parent, and does not run `git submodule` commands.

## What the preview does

The sidebar groups a host, then a requirement, then the requirement root and the member workspaces. The root label comes from `fork.requirement.root`. A member whose directory is named `root` stays a member. The requirement header opens an overview and does not start a terminal. Entering a member or the requirement root uses the existing workspace terminal. Overview filters stay with that requirement. Review can show two chosen files. A relative-base file is the blob at the merge base, not the working tree. Review does not stage or merge. Parent source control keeps `docs` and `.gitmodules` and hides nested worktree paths. Local stage all passes those paths as git excludes. Remote stage all is turned off, because this preview does not change a remote host.
