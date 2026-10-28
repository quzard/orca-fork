# SSH, import, and computer-use parity

Paths below are generic. Each item is the behavior a registered build must show.

## F007 Directory symlinks (removed; upstream covers it)

- [ ] SSH browse and managed-server browse list `link-dir` -> `real-dir` as a directory, `dangling` as a file, an empty directory as empty, and fail on a directory that cannot be read. `src/fork/directory-browse.fork.test.ts` runs upstream's code for this.

## F022 Symlinked Cursor sessions

- [ ] Scope, depth, and project matching read `cwdAliases` from upstream. The fork does not realpath a session cwd.
- [ ] Worktree attribution still reads `cwdAliases` and prefers the workspace that leaves the shortest remainder.
- [ ] With no aliases, worktree matching uses `cwd` only, same as upstream.
- [ ] When both `/home/user` and `/home/user/link` own a session via an alias, `/home/user/link` wins.
- [ ] `cwdAliases` survives list-result validation.

## F010 TUI redraw after SSH reconnect

- [ ] An `ssh:<target>@@<pty>` reattach fit resizes to `cols - 1`, then after 200ms restores the captured cols and rows.
- [ ] A later fit does not undo the pulse while it is active. An older timer does not restore over a newer pulse.
- [ ] `remote:` ptys, non-ssh ptys, and grids with `cols <= 2` are unchanged.
- [ ] A reattach that already restored the park model does not pulse.
- [ ] A hidden pane stores the pulse and sends it once, with the size at first show.

## F021 Open an SSH workspace in Cursor (upstream #33877)

Upstream [stablyai/orca#33877](https://github.com/stablyai/orca/pull/33877) covers this. The fork no longer builds a `cursor://` URL or adds an Open in row.

- [ ] A direct SSH workspace enables Cursor, VS Code, and Zed. Cursor launches `cursor --new-window --remote ssh-remote+<alias> <path>`. VS Code uses `--remote ssh-remote+…`. Zed uses an `ssh://` URL.
- [ ] Cursor appears in Open in only after it is configured, same as Zed.
- [ ] The file manager on an SSH workspace stays refused.

## F043 Managed-server remote open and per-port forward

Open in for a server reached over SSH is upstream #33877. The remaining fork behavior is the per-port Forward button.

- [ ] A workspace whose files sit on a managed or paired server enables the same remote rows. The SSH target comes from `orcadDeployment` or `sshAccess` and is not an ephemeral `runtime-ssh-` id. Upstream `getWorkspaceEditorSshHost` decides this.
- [ ] A workspace that server reaches through its own SSH host stays refused. There is no fork environment-to-SSH map and no fork route adjuster.
- [ ] After renderer registration, each detected port row on that workspace has Forward. It opens the existing forward dialog with that remote port, host `localhost`, and the port's process name.
- [ ] Before registration, those rows have no Forward button. The existing Forwarded section is unchanged.

## F041 Plain-directory terminal lifecycle

- [ ] `folder:<id>` resolves to the same worktree shape terminal create uses.
- [ ] A selector that is not a folder returns null and the upstream matcher continues.
- [ ] A missing folder throws `selector_not_found`.
- [ ] Exact stop refreshes liveness with that folder included, because folder workspaces are not in the resolved-worktree map.

## F003 Selected worktrees on bulk import

- [ ] The handoff stores selected paths that are not the repo's own checkout into `importedExternalWorktreePaths` and `externalWorktreeInboxBaselinePaths`.
- [ ] Selecting only the repo checkout changes nothing. A path already stored is not duplicated.
- [ ] A registered runtime import replaces the scan path with the git toplevel. The desktop SSH importer does not run local git.

## F025 Parent folder when importing a sub-repo

- [ ] A non-git parent is added only when at least one selected child is `imported` or `already-known`.
- [ ] An existing folder workspace on the same host and path is reused and unarchived. The host API cannot move it into another group.
- [ ] A new folder is created with `createFolderWorkspace` in the import group (`projectGroupId`). It does not launch an agent and does not open the folder.
- [ ] Parent failure warns and leaves the imported children in place.
- [ ] A git parent does not add another folder.
- [ ] Direct SSH with no runtime environment fails every child in this process, so the parent is not created. A selected runtime environment still creates the parent on that host.

## F006 Computer-use authorization card

- [ ] The Mac authorization window shows a draggable app card (height 42, full width) instead of a static icon, with the hint to drag it into System Settings.
- [ ] `acceptsFirstMouse` is true and `hitTest` returns the card, so the drag starts on the icon or the title and from an inactive window.
- [ ] Linux checks the Swift source only. Dragging into System Settings is Mac-only.
