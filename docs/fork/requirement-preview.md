# Requirement preview

This is a separate Orca build for trying the requirement overview. It is not ready to install over a daily Orca until the Mac package is built and checked on the build machine.

The preview does not copy a daily profile, does not register the `orca://` handler, does not check for updates, and does not open SSH or upgrade a remote daemon. A remote daemon shares its socket and storage with the daily app, so live SSH stays off even if `ORCA_REQUIREMENT_PREVIEW_SSH=1` is set. Local terminals stay in this app's own userData daemon directory.

Set `ORCA_REQUIREMENT_PREVIEW_USER_DATA` only when you want a disposable copy of local workspace data. The launch refuses `Orca`, `orca-dev`, and `Orca Dev` under Application Support. It does not install or edit login items.

## Mac package

From a checkout of this branch, with the existing Mac packaging flow:

```sh
export ORCA_REQUIREMENT_PREVIEW=1
export ORCA_MAC_RELEASE=0
node config/scripts/desktop-distribution/macos/build-mac-local.mjs dmg:arm64 zip:arm64
```

The archive is named Orca Requirement Preview. Its bundle id is `com.quzard.orca.requirement-preview` and its URL scheme is `orca-requirement-preview`. Install it beside the daily app, not on top of it. Do not point it at the daily userData directory.

A local fixture with generic repository names:

```sh
sh fork/scripts/requirement-preview-fixture.sh
```

Open the printed parent directory as the existing folder workspace, then use Dry run. Apply links lineage only. It does not create projects by itself, does not reparent a workspace that already has another parent, and does not run `git submodule` commands.

## What the preview does

The sidebar groups a host, then a requirement, then the requirement root labeled 需求根 and the member workspaces. A member whose directory is named `root` stays a member. The requirement header opens an overview and does not start a terminal. Entering a member or the requirement root uses the existing workspace terminal. Overview filters stay with that requirement. Review can show two chosen files and does not stage or merge. Parent source control keeps `docs` and `.gitmodules` and collapses nested worktree paths.
