# 侧栏与工作区管理返工记录（fork/rework-sidebar）

覆盖 FORK-CHANGES 的「侧栏 host-directory」「界面中文」（侧栏部分）「F003 / F025 批量导入」「F048 删除工作区默认保留文件夹」。需求不变，这里记的是实现方式、上游文件里的改动、需要同步进 FORK-CHANGES / HOOKS / AUDIT 的句子。

本区上游文件（不含 fork 目录）的 fork 改动：返工前 96 个文件 +978/-260，返工后 84 个文件 +384/-73。

## 侧栏 host-directory

- 元数据到工作区行的投影统一走 `forkWorkspaceFields(meta)`（`src/shared/fork-hooks/sidebar-group-membership.ts`）：`mergeWorktree`、`mergeFolderWorkspace`、`mergeRuntimeFolderWorkspace`、`folderWorkspaceToWorktree` 各一行展开。以后 fork 往 meta 里加字段，只改这一个函数。`null`（明确取消分组）照样带回，字段缺失时仍缺失。`runtime-worktree-ps-summaries.ts` 不加：它只供 `orca worktree ps` 和手机列表，两边都不按侧栏分组，桌面侧栏读 `worktree.list` / IPC 的行。
- `worktree.set` 的回复按这次写入后存储里的值回显 `sidebarGroupId` / `manualOrder`（`echoSidebarFields`，取 `setWorktreeMeta` 的返回值），不再回显请求里的值。`show` 解析出的行缺这个字段时（例如文件夹仓库的投影）照样带回；存储没有保存分组时，回复里就没有分组，客户端的「字段已应用」检查照旧报错并回滚。旧主机没有回显，判断不变。只回显这次写入涉及的字段。
- `worktree.set` 处理函数直接传 `sidebarGroupId` 和 `clearFields`（`omitUndefinedProperties` 会去掉未提供的字段），删除 `worktree-create-args.ts` 里的 `sidebarGroupIdSetPatch` 和没人用的 `worktreeSetLineage`。清除字段在宿主上就地写成自己的 `undefined` 键（`applySidebarFieldClears`），IPC 处理函数各加一行，不再改参数类型或把上游调用改成多行。`sidebar-field-clear.ts` 的三处类型断言换成 `Reflect`。
- 拖放排序（`group-drop-order.tsx`）全部按主机身份（主机|工作区 id）计算：排序值、已存的手动排序、分区归属、拖动行都用身份键，结果只写目标主机上的行。以前把拖放分组的身份键剥成裸 id，并按裸 id 去重，另一台主机上同 id 的工作区排在前面时，邻居排序值取成那一行的值，松手后的行落在邻居的另一侧。
- 置顶分区里两台主机各有一个同 id 的工作区时，以前按裸 id 记子树，一台主机的行画两遍、另一台的不见；现在按主机身份记。
- host-directory 行计划改用上游传入的 `repoOfWorktree`（按主机找项目登记），找不到时才按裸 id 查。同一个项目在两台主机上登记时，每台主机的行继承自己那份登记的项目组。
- 拖放写入、分区归属、组是否在目标主机上：没有主机字段的行、项目和组按侧栏的默认主机算（和行计划一样），不再按目标主机算。以前本机没有主机字段的行会被算成 SSH 分区的隐藏成员，重编号时写到它，整次拖放报主机不符。项目登记按行自己的主机查（`findRepoForHost`）。
- 已登记模式但没有行计划时才会走到的三处回退（`group-sections.ts` 的分组标题、`worktree-group-keys.ts` 的分组键、`worktree-grouping.ts` 的分桶）在渲染进程永远到不了（登记后就装上了行计划），删除；模式类型里没人用的 `headerTone`、`groupKeyForWorktree`、`buildOrderedGroups` 一起删。
- `planSidebarRows` 的输入不再带 `workspaceSortBy`：生产路径没人传，行计划从登记的读取函数取排序。fork 测试改为直接调 `planSidebarRows` 并登记排序读取，不再改上游的 `build-rows.test-fixture.ts`。
- 拖放目标的 `data-workspace-sidebar-group` 只在登记了跨组拖放时渲染（`workspaceDropGroupKey`、`hostHeaderDropGroupKey`）；主机标题不再在上游文件里手拼 `hd:` 键。未登记时 DOM 与上游一致。
- 「项目标题外观」判断合成 `hasProjectHeaderChrome(groupBy)`（`repo` 或已登记模式），`SectionHeader`、`item-row`、`empty-project-placeholder-repos` 共用，不再在上游文件里加局部变量。
- 卡片的目录前缀、删除项目组对话框的「仅取消分组」勾选、分组方式菜单的选项都改成 fork 组件或 fork 钩子，上游文件只剩一行调用（`renderWorktreeDirectoryPrefix`、`renderDeleteProjectGroupOption`、`useSidebarGroupByOptions`）。`use-section-rows.ts` 的语言版本订阅也换成 `useSidebarGroupModeLabelsVersion()`。
- 隐藏工作区搜索保留上游的名称/路径匹配，只多一行 `hiddenWorktreeMatchesExtra`（分支）。
- `normalizeGroupBy` 开头加 `normalizeRegisteredGroupBy`，不再改写上游的条件。
- 跨组拖放的两个提交点（指针、原生拖放）各一个三行判断，参数直接传 `event`、拖动会话和上下文。
- 「已从 Orca 移除」列表按每一行自己的项目和侧栏默认主机判断主机，以前用对话框的项目和对话框主机兜底，本机没有主机字段的行会出现在 SSH 主机的列表里。恢复写到这台主机，失败时提示。
- 「隐藏的工作区」菜单按项目的执行主机找项目（含只有 `connectionId` 的 SSH 项目）。
- 创建弹窗的种子按当前主机取当前工作区（同 id 工作区在两台主机时不会取错），默认主机用侧栏默认主机。弹窗打开后改选了另一台主机上的项目时，新建完成后不再写入原来那一组（它在别的主机上）。没有调用方提供的 `initialExecutionHostId` / `targetSidebarGroupId` 两个输入删除。
- 工作区选择器的标签按行自己的项目查，分支去掉 `refs/heads/`。
- 右键菜单分组钩子直接接收菜单模型里的字段名（`handleMoveProjectToGroup` / `handleRemoveProjectFromGroup`）。

## 界面中文

- 上游已经把右键菜单的 Sleep / Sleep N / Delete Selected / Delete N 翻译成中文（`auto.components.sidebar.workspaceBatchActionLabels.*`，zh 与 fork 原文一致），删除 fork 的标签钩子 `worktree-context-menu-labels.ts`、`context-menu-labels.tsx`、`context-menu-label-keys.ts`、命令模块里的 `forkMenuLabel` 转出，以及 `fork.sidebar.contextMenu.*` 键。
- SSH 连接状态名早已改用上游 #34680 的 `settings.ssh.status.*`，界面不再走 `src/fork/ssh/ssh-status-labels.tsx`。删除整个 `src/fork/ssh/`（标签模块、键表、测试）和 fork 语言包里的 `sshConnectionStatus.*`；键目录测试的常量表现在为空，overlay 测试改用 fork 自己的键。
- 删除没人用的 `fork.workspaceDelete.keepFolderOne/keepFolderMany`（旧的拼接后缀）。

## F003 / F025 批量导入

- 导入时清归档元数据改走 store 的 `updateWorktreeMeta`，运行时（orcad）主机上的元数据会真正写到那台主机；以前直接调桌面 IPC，只改了桌面本地那份，托管主机上的行导入后仍在「已从 Orca 移除」里。
- 外部工作区收件箱导入：清归档和隐藏记录并进重新扫描那一行（`reactivateRegisteredImportedWorktrees(...) && fetchWorktrees(...)`），写失败时照旧回滚这次导入。上游的 deps 类型不再改。
- 添加项目后的回调（`registered` 阶段）合成 `runForkRepoRegistered(repo, path)`，上游只剩四行，未登记时仍不多 await。同一路径不再重复清两次。
- 嵌套导入的交接恢复上游变量名 `selectedProjectPaths`，钩子调用多占几行，文件因此加 max-lines 豁免首行（见下）。

## F048 删除工作区默认保留文件夹

- `DeleteWorktreeDialog.tsx` 恢复上游代码原位（空列表关闭、开关、确认按钮焦点三段不再挪到 `workspace-folder-delete-lifecycle.tsx`，该文件删除），首行加 `/* oxlint-disable max-lines -- fork: hook call only */`。fork 只剩：一次 `useWorkspaceFolderDeleteDialog(...)`、两个确认处理函数开头各一个三行提前返回、描述/改动警告/未保存提示三个属性、子工作区提示的一个属性、勾选框一行。
- 子工作区提示（`DeleteWorktreeLineageNotice.tsx`）不再整段重新缩进上游的翻译调用：两处 `translate(` 换成 `title.t(` / `body.t(`，由 `keptLineageText` 在保留文件夹时给出 fork 文案，否则就是上游的 `translate`。
- 跳过确认的两条路径（`delete-worktree-flow.ts`）各一行 `skipConfirmHardDeletes`：登记后 git 工作区只归档并回报，文件夹工作区交回上游删除（本来就不删目录）。分区逻辑搬进 fork，按上游删除用的 `findRepoForHost` 找所属项目。
- 硬删除成功后清隐藏记录：从两个侧栏辅助文件（`run-worktree-delete-with-toast.ts`、对话框的强制删除）挪到 `dispatchWorktreeRemoval` 一行，在宿主确认删除之后执行，所有删除入口（对话框、跳过确认、强制删除、清理）都覆盖；两个辅助文件恢复上游。
- 新建时清归档（桌面新建、运行时新建、预置根目录）改为在新的 `instanceId` 旁边展开一行 `...reusedPathUnarchiveMeta()`（`src/shared/fork-hooks/reused-path-unarchive.ts`，`register-main.ts` 登记，桌面和 orcad 都有），不再把上游的 meta 字面量包一层（运行时那处以前重新缩进了约 60 行）。未登记时不写 `isArchived`。原来在上游测试文件里的断言搬到 `src/fork/main/reused-path-*.fork.test.ts`（上游已删掉运行时那份测试）。
- 删除旧的 `src/shared/worktree/reused-path-archive.ts`（fork 文件放在上游目录里）。

## 钩子变化（同步进 HOOKS.md）

新增：`reused-path-unarchive.ts`（`registerReusedPathUnarchive` / `reusedPathUnarchiveMeta`）；`sidebar-group-membership.ts` 的 `forkWorkspaceFields`；`sidebar-field-clear.ts` 的 `applySidebarFieldClears`、`echoSidebarFields`；`sidebar-group-mode.ts` 的 `normalizeRegisteredGroupBy`、`hasProjectHeaderChrome`；`sidebar-chrome.ts` 的 `renderWorktreeDirectoryPrefix` / `registerWorktreeDirectoryPrefix`、`hiddenWorktreeMatchesExtra`、`workspaceDropGroupKey`、`hostHeaderDropGroupKey`；`project-group-delete.ts` 的 `renderDeleteProjectGroupOption` / `registerDeleteProjectGroupOptionRenderer`；`workspace-durable-archive.ts` 的 `applyRegisteredDurableArchiveToRow`、`releaseRegisteredRemovedWorkspaceArchive` / `registerRemovedWorkspaceArchiveRelease`、`reactivateRegisteredImportedWorktrees` / `registerImportedWorktreeReactivate`；`workspace-folder-delete.ts` 的 `skipConfirmHardDeletes`、`keptLineageText`；`post-import.ts` 的 `runForkRepoRegistered`。fork 侧 React 钩子：`useWorkspaceFolderDeleteDialog`、`useSidebarGroupByOptions`、`useSidebarGroupModeLabelsVersion`。

改签名：`commitRegisteredWorkspaceGroupDrop(pointer, drag, ctx)`；`registerWorkspaceGroupDrop(commit, hostHeaderKey)`；`worktreeMenuGroups` 接收菜单模型字段名；`registerWorkspaceFolderDelete(skipConfirm)`；`standInGroupForGroupLessFolderWorkspace` 接收部分字段（agent 主机解析也用它）；`buildGroupDropOrder` 的 `belongsToTarget` 收到的是主机身份键。

删除：`worktree-context-menu-labels.ts` 整个文件；`hiddenWorktreeMatchesQuery`；`registerDurableWorkspaceMetaReactivate` / `reactivateRegisteredArchivedWorktreeMeta`；`takeWorkspaceRecordRemoval`、`workspaceFolderDeleteOffered`、`workspaceFolderDeleteSuffix`、`gitWorktreesInDelete`、`workspaceLineageKeptNotice`；`SidebarGroupMode` 的 `headerTone` / `buildOrderedGroups` / `groupKeyForWorktree` 与 `SidebarGroupKeyContext`；`ComposerSeedInput` 的 `explicitHostId` / `explicitGroupId`。

## FORK-CHANGES 需要改的句子

- 开头「行数上限」一段里「工作区右键菜单的 `forkMenuLabel` 从 commands 模块转出…」删除。
- 「侧栏 host-directory」里「当前主机在 `show` 之后按这次写入回显分组和手动排序…」改为：按这次写入后存储返回的值回显，存储没保存时回复里就没有，客户端照样报错。
- 「SSH 状态行…」一条里「`src/fork/ssh/ssh-status-labels.tsx` 还在…」改为已删除。
- 「界面中文」里右键菜单「休眠」「删除所选」改为上游翻译，删掉 `worktree-context-menu-labels.ts` / `context-menu-labels.tsx` 的描述。
- F048 最后一段（`DeleteWorktreeDialog.tsx` 顶着行数上限、lifecycle 文件）改为：对话框首行豁免 max-lines，上游代码原位，fork 只有钩子调用。补充：硬删除后清隐藏记录在 `dispatchWorktreeRemoval`；导入清归档走 store（运行时主机生效）。

## AUDIT 变化

新增：`src/fork/main/reused-path-desktop-create.fork.test.ts`、`src/fork/main/reused-path-unarchive.fork.test.ts`、`src/fork/sidebar/archived-workspaces.fork.test.tsx`、`src/fork/sidebar/composer-seed-assign.fork.test.tsx`、`src/fork/sidebar/directory-prefix.tsx`、`src/fork/sidebar/project-group-delete-option.tsx`、`src/fork/sidebar/workspace-archive-release.tsx`、`src/fork/sidebar/workspace-choice.fork.test.tsx`、`src/shared/fork-hooks/reused-path-unarchive.ts`、本文件。

删除：`src/fork/sidebar/context-menu-label-keys.ts`、`context-menu-labels.tsx`、`context-menu-labels.fork.test.tsx`、`reused-path-worktree-meta.ts`、`workspace-folder-delete-lifecycle.tsx`、`src/fork/ssh/`（三个文件）、`src/shared/fork-hooks/worktree-context-menu-labels.ts`、`src/shared/worktree/reused-path-archive.ts`。

恢复成上游：`worktree-create-args.ts`、`workspace-selectors.ts`、`group-sections.ts`、`worktree-group-keys.ts`、`worktree-grouping.ts`、`run-worktree-delete-with-toast.ts`、`delete-worktree-dialog-force-delete.ts`、`use-worktree-context-menu-commands.ts`、`use-worktree-context-menu-model.tsx`、`build-rows.test-fixture.ts`、`worktrees-create-metadata-persistence.test.ts`、`runtime-folder-workspace.test.ts`。新进入 fork 改动的上游文件：`dispatch-worktree-removal.ts`（两行）。

`src/fork/audit-table.fork.test.ts` 在返工前就失败（AUDIT.md 落后于仓库），返工后仍需重新生成表。

## max-lines 豁免

`DeleteWorktreeDialog.tsx`、`useAddRepoNestedImportFlow.ts` 首行加了 `/* oxlint-disable max-lines -- fork: hook call only */`。上游 lint 里的 `check:max-lines-ratchet` 会把这两个文件当成新的豁免报出来；fork 若跑完整 `pnpm lint`，需要把它们记进 `config/max-lines-baseline.txt`（同样会是 fork 改动）或接受这一步失败。

## 没做的

- `runtime-worktree-ps-summaries.ts` 不加 `sidebarGroupId`（见上，没有读取方）。
- `useSyncExternalStore` 的服务端快照测试（`server-snapshot.fork.test.tsx`）的上游调用点清单已清空：两处订阅都在 fork 钩子里。
- 导入时解析 git 根仍用同步的 `getGitRepoRoot`（每个项目一次 rev-parse，orcad 上会短暂阻塞事件循环）；改成异步要动上游的 `results.map` 那一行。
