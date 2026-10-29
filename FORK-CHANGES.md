# Fork 维护（develop）

集成分支是 `develop`（名字上和上游的 `main` 区分开）。它从上游 `17a2bced1115f064e834e397c2b949d9e150d275` 起，只加扩展点；之后每天把上游 `main` 合并进来，不再变基，也不强推。`fork/base` 保留为切到集成分支时的那个提交，每日任务不移动它。`fork/base-upstream` 仍是人工推上去的上游指针。行为登记在 `src/fork/`。未登记时上游行为保持不变。上游 main 的 `package.json` 仍是 `1.4.214`（稳定版号只在发布分支上改）。本 fork 写成 `1.4.228`，比已发布的 `1.4.227` 和本机正在用的 `1.4.224` 都新，本地构建不会被当成降级。

- 扩展点说明：[docs/fork/HOOKS.md](docs/fork/HOOKS.md)
- 逐文件审计（每个和上游不同的文件：功能、决定、原因）：[docs/fork/AUDIT.md](docs/fork/AUDIT.md)，由 `fork/scripts/generate-audit.py` 生成，`src/fork/audit-table.fork.test.ts` 检查它和仓库一致。
- 行为清单：[docs/fork/parity/ssh-import.md](docs/fork/parity/ssh-import.md)、[docs/fork/parity/build-skills.md](docs/fork/parity/build-skills.md)、[docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)、[docs/fork/parity/sidebar.md](docs/fork/parity/sidebar.md)
- 同步上游：[docs/fork/SYNC.md](docs/fork/SYNC.md)
- 每日云端变基和家里的 Mac 发布：[docs/fork/DAILY.md](docs/fork/DAILY.md)
- Linux 验收：[docs/fork/VERIFY.md](docs/fork/VERIFY.md)
- F024 停用说明：[docs/fork/skill-update-flow.md](docs/fork/skill-update-flow.md)
- 登记入口：`src/fork/register.ts`（主进程和界面都调用：fork 构建标记、skill 来源、host-directory、旧主机漏发的分组、Ego Lite cookie 来源）、`src/fork/main/register-main.ts`（桌面主进程和 orcad：含删除项目组时保留文件夹工作区，以及 orcad 上的 Ego Lite cookie 来源）、`src/fork/main/register-electron.ts`（只在 Electron 主进程：更新源、文件密钥、权限助手参数）、`src/fork/register-renderer.tsx`（仅界面）
- 目录约定：只在主进程运行的 fork 代码放 `src/fork/main/`；引用渲染进程的 fork 代码用 `.tsx`；`*.fork.test.ts` 是 node 测试，渲染进程测试用 `.fork.test.tsx`。tsconfig 只按这三条通配，不再逐个列文件。`pnpm tc` 在 tsc 之前先跑 `src/fork/tsconfig-boundaries.mjs`，fork 文件引用了所在工程不包含的文件就失败。用到真实 SQLite 运行时存储、或导入会加载 SQLite 的模块（比如 `persistence-test-harness`）的测试，要写进 `config/scripts/vitest-node-runtime-files.mjs` 的 `NODE_RUNTIME_INCLUDE`。直接 import 这些模块的单测也会被 `findSqliteRuntimeTests()` 追加进 `getNodeRuntimeInclude()`；扫描漏掉的（动态 import、共享 helper）仍要手写。两条 fork 测试继续手写在这个列表里。
- 行数上限：`orcad-entry.ts` 已在 300 行。监听地址和终端准入合成 `resolveOrcadServeBind`（`src/fork/main/orcad-serve-bind.ts`，由 `register-main.ts` 转出，走 orcad-entry 已有的那一行 import）。这不是新行为，顺序仍是先解析地址、再接上准入。AiVault 面板已在 400 行，恢复会话的工作区快照 `useAiVaultResumeTargetState` 与 `useSearchHostLabels` 一样放在 `src/fork/ai-vault/use-list-presentation.tsx`，经面板已有的 fork import 引入。工作区右键菜单的 `forkMenuLabel` 从 commands 模块转出，菜单文件才能并进已有 import，留在 400 行内。

## F002 macOS 本地安装

- 脚本：[fork/scripts/install-mac-release.sh](fork/scripts/install-mac-release.sh)。它只包一层上游发布命令，不再维护单独的 electron-builder 配置。
- 依赖安装是 `pnpm install --frozen-lockfile --cpu=arm64`（安装前设 `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0`，关掉上游默认打开的 pnpm 全局依赖存储，让依赖都在仓库的 node_modules 里；Linux 槽的容器只挂载仓库，编译前脚本会检查 `node-pty` 和它的依赖确实在仓库里），以及 mobile 的 `pnpm install --frozen-lockfile`。应用构建是 `pnpm run build:release`。本机 `darwin-arm64` 槽仍是 `pnpm build:orcad-prebuilds`、`--require-slots`、`--smoke`。Linux 槽由 [fork/scripts/build-orcad-linux-prebuilds.sh](fork/scripts/build-orcad-linux-prebuilds.sh) 按 `node-server-tests.yml` 的 manylinux 镜像编译：`linux-x64-glibc`、`linux-arm64-glibc`、`linux-x64-glibc217`。模板命令是 `node config/scripts/build-orcad-template.mjs --targets darwin-arm64,linux-x64-glibc,linux-arm64-glibc`。然后是文件监视隔离检查、`pinned-node-downloads.mjs darwin-arm64`、`ensure:electron-runtime`，最后 `node config/scripts/build-mac-local.mjs dmg:arm64 zip:arm64`。
- 只覆盖这些事。签名身份是 `Orca Local Signing`（`CSC_NAME` 和 `ORCA_COMPUTER_MACOS_SIGN_IDENTITY`，`CSC_IDENTITY_AUTO_DISCOVERY=false`）；钥匙串里没有该证书就停止。版本后缀由 `build-mac-local.mjs` 写入，脚本不自己算。Electron 包只打 arm64：`dmg:arm64 zip:arm64`。安装、备份和回退仍在这个脚本里。
- 这些 Mac 都是 Apple Silicon。x64 包的 afterPack 会在 Rosetta 下启动交互式 shell 做 PTY 检查，并超时。单独的 `--arm64` 去不掉配置里写死的 x64 目标；空的命令行目标列表会保留配置里的两个架构。`dmg:arm64 zip:arm64` 才是只打一个架构的上游参数。因此不会编 x64 Electron 包，也不会跑 x64 PTY 检查，也不下载 `darwin-x64` Node。`verify-packaged-daemon-entry` 本身不改。
- 不公证。`ORCA_MAC_RELEASE` 等保持 0。需要 Apple 密钥、GitHub 发布，以及 musl、win32、`darwin-x64` 这些本机编不了的槽，仍然跳过，原因写在 [docs/fork/SYNC.md](docs/fork/SYNC.md)。
- 打包后必须有 `Contents/Resources/orcad-template/orcad-template.json`，且 `targets` 含 `linux-x64-glibc`、`linux-arm64-glibc`、`linux-x64-glibc217`、`darwin-arm64`，以及 `app.asar.unpacked/out/cli/skills-source-commit.js`，并再跑一次上游的 CLI 闭包检查。
- `--fast` 跳过两次依赖安装；Linux 槽若已通过 `--require-slots` 也不重编。签名、模板和安装仍会做。`--cleanup-verified-backups <版本号>` 只清理 `/Applications/.orca-previous.*` 里已退出的旧应用。
- 静态资源签名排除通过 `extraMacSignIgnore` 进入现有 `mac.signIgnore`。不再写钥匙串 partition list；后台安装传递 `ORCA_BACKGROUND_LAUNCH=1`。

## 侧栏 host-directory

默认分组是「按执行主机，再按目录」。内置的 Project / Status / PR / None 不改。没有登记这个模式的测试里，缺省分组仍是 `repo`。

- 侧栏启动时上游对每个分区读取 `group.repoIds`（按分区做主机和项目过滤）。host-directory 造出来的分区以前没有 `group`，读到 `undefined.repoIds`，错误边界显示工作区列表出错。现在每个分区（含置顶）都带上游要的 `group`，`repoIds` 是这一目录里实际出现的仓库。`buildRowPlan` 的返回类型改成上游 `planSidebarRows` 的返回类型，上游以后给分区加字段时类型检查会失败。

- 同一目录在两台主机上各成一块，不合并。组归属只认同一台主机。
- 只看见一台主机时仍保留主机标题。这三处提前返回留在 `host-section-rows.ts`，由 `retainSingleHostHeader` 控制；`use-section-rows.ts` 用 `sidebarModeRetainsHostHeaders` 传入。目录标题如果自带 `hostId`，按这个主机归组，不按标题上仓库的主机：`host-section-rows.ts` 只调用一次 `forkHeaderHostId`，登记了 `retainHostHeaders` 且行上有 `hostId` 才返回它，否则返回 null。没有登记时标题仍按仓库主机归组。
- 不画仓库标题层，工作区直接出现在主机和项目组下面。
- 删除项目组只取消分组。上游「同时移除包含的项目」勾选还在；登记的附加项默认勾上时，这个标志被改成不移除。文件夹工作区留在列表里，变成未分组。主进程也一样（`src/fork/main/project-group-delete.ts`，在 `register-main.ts` 登记，桌面和 orcad 都有）：上游 `deleteProjectGroup` 会连同组删掉它拥有的文件夹工作区，删除后界面重新拉列表时它们就消失了（磁盘上的目录还在）；现在只把 `sidebarGroupId` 设成 `null`，被删的组拥有的工作区从组上补齐缺少的 `folderPath`、`connectionId`、`executionHostId`，仍在原主机上；它们的会话标签页也保留。加载时这些失去所属组的文件夹工作区不再被丢弃，并且一律取消分组（`src/shared/folder-workspaces.ts`），已经存有这种工作区的配置也一样。数据模型里文件夹工作区必须有 `projectGroupId`（合成的 `repoId` 和迁移清单都要求它），没有“无组”的写法，所以保留的工作区仍记着已删组的 id，凡是按 id 找组的地方都要接受找不到：迁移到 orcad 时目标端不再因为组不在而报 `orcad_migration_folder_workspace_project_group_missing`（`orcad-catalog-records.ts`）；Status、PR、None 分组方式给这种已取消分组的工作区配一个用它自己路径和主机的替身组，照样列出（`folder-workspace-lanes.ts`，被隐藏主机的组仍隐藏它的工作区）；agent 状态按工作区自己的 `connectionId` / `executionHostId` 判断主机（`restored-status-dead-terminal-sweep.ts`）。其余按 id 找组的地方本来就允许找不到。对话框里没有“同时删除文件夹工作区”的选项，上游“同时移除包含的项目”勾选仍照旧移除项目。
- 从 Orca 移除单个工作区只归档，不删目录、不删 git 分支。多主机归属不清时中止。顺序与上游删除一致：先在宿主上归档，成功后才停掉它的浏览器和终端；归档失败时终端保持运行。找不到所属仓库的孤立工作区先停再移出列表。
- 删除工作区对话框默认不删磁盘上的文件夹（F048）。git 工作区默认只归档；勾上「同时删除文件夹」才走原来的 `git worktree remove`。本来就不删目录的文件夹工作区不显示这个勾选。
- 隐藏工作区可搜索、可恢复。选择器显示目录、分支、分组和路径。设置里的项目列表可以多选后移除，只从 Orca 注销，不删目录。
- 卡片左侧用淡色、从左侧截断的目录前缀。项目组只有一个工作区、且仓库路径不在组的父目录下时，卡片去掉父目录前缀。
- 已保存的 `groupBy: repo` 在登记后读成 host-directory。未登记时 `repo` 仍是原来的项目标题。
- SSH 状态行上的主机类型和连接状态不换行。连接状态名改用上游 #34680 的 `settings.ssh.status.*`（含中文和其他语言）。`SshTargetCard` 不再包 `withForkSshStatusLabels`。`src/fork/ssh/ssh-status-labels.tsx` 还在，测试仍覆盖它，界面不再走这层。参考实现已经去掉远程工作区同步冲突按钮，这里不把那套界面加回来。
- 旧远端刷新如果省略 `sidebarGroupId`，本机保留原来的分组。显式 `null` 仍表示取消分组。
- 组内排序：smart 保持传入顺序，其他模式在组内重排。拖到另一台主机被拒绝。
- 手动排序时，组内显示和拖放写入用同一个顺序（`src/fork/sidebar/manual-order.ts`）：有效排序值 `manualOrder ?? sortOrder` 从大到小，相同时按名称、再按主机，和上游手动排序、上游拖放目录一致。以前 fork 的显示把没有 `manualOrder` 的行排在最后、按名称排，而写入按有效值算邻居，松手后的行不在插入线的位置。对已有用户：没有 `manualOrder` 的行会出现在它 `sortOrder`（创建时间，或上次智能排序的快照）对应的位置，只变一次，和上游其他分组方式里的顺序一样。拖放的插入位置按显示出来的行计算。
- host-directory 下子工作区画在自己的父工作区正下方：分区先排序再交给上游的层级展开，每个根行后面紧跟它的子树。以前按扁平排序输出行、各自带层级缩进，子工作区会缩进在排在它前面的无关行下面。松手在父子行旁边、邻居的排序值解释不了显示顺序时，按显示顺序重新编号这一段，结果落在松手处。
- 置顶分区标题切换界面语言后立即重绘：fork 的行计划不再把翻译后的标题写进行里（和上游一样由绘制时取），`use-section-rows.ts` 订阅模式标题版本号（语言切换时变化），版本变化时重新生成行数组。未登记 fork 模式时版本号不变。
- 跨组拖放只写目标主机上真实存在的项目组；拖到空项目标题等于拖进该主机的未分组列表，不写假的组 id。多选拖放要么全部写入，要么一项都不写：有一项不在该主机就整体拒绝。写入一项一项串行进行，不会并发改同一份存储；中途失败时按相反顺序把已写入的项精确改回原状态：原本没有自己的分组（继承项目组）就恢复成未设置，原本没有手动排序就去掉手动排序，靠更新旁边的 `clearFields` 删除字段。回滚也失败时弹出错误提示，用显示名列出没能改回的工作区（不是内部 id），并写一条带 id 的错误日志。文件夹工作区的 `sidebarGroupId` 现在会真正保存（以前被参数校验和加载丢掉）。旧版远端主机会丢掉 `sidebarGroupId` 和 `clearFields`、只应用其余字段：文件夹写入按宿主返回值对账，git 工作区写入检查宿主返回的工作区，缺了要求的分组或清除就算失败，整次拖放失败并回滚，这一行已经写进去的排序也改回去，不会只写一半而不报错；提示让用户先更新该主机上的 Orca。“只写了一半”按错误码判断，不比对提示文字：`SidebarFieldsNotAppliedError` 带固定的 `code`（`SIDEBAR_FIELDS_NOT_APPLIED`），`updateWorktreeMeta` 的失败结果保留这个 `code`，用上游的 `hasRuntimeRpcErrorCode` 匹配。这个错误在渲染进程里根据主机对 `worktree.set` 的回复抛出、也在渲染进程里判断，不经过 IPC 或运行时 RPC；错误码要保留的只是 store 的失败结果和包一层的 `cause`。
- 未分组的工作区可以拖：fork 的未分组列表没有标题行，上游按标题行切拖放组，这些行原来并进前一组（或 `all`），拖动会话找不到自己的组，约 46ms 后取消。现在 `groups.ts` 和 `worktree-drag-units.ts` 遇到行自己的分区键变了（不是 `all`）就另起一组；上游自己的行仍在 `all` 里，行为不变。
- 拖出分组、松手在另一张卡片中间时，跨组拖放先于“设为父工作区”判断，不会悄悄把那张卡片设成父级；同组内拖到卡片中间仍按上游设父级。原生拖放路径也一样，而且跨组拖放不再要求指针还在源组里。
- 松手在两行之间（行距 6px）时按 12px 内最近的一行决定目标分区，不再什么都不做；以前只有主机标题能当未分组目标。这个就近判断只用于分组和未分组列表里真正的行间空隙：指针下面必须是列表容器或放行的那一层（不是横幅、按钮或其他非分区元素），而且上下最近的行（12px 内）都得是分组或未分组的行；挨着置顶区的行或标题时不算跨组拖放，交回上游处理。
- 跨组拖放保留当前排序方式：只有手动排序时才写排序，而且只给被拖的行写，取新邻居有效排序值（`manualOrder ?? sortOrder`）之间的值，不再在有行没有手动排序时把整个列表重新编号；邻居排序值相同，或两者之间已经放不下一个严格居中的值（间隔小于 1e-6，或在这个数量级上只剩几个浮点精度单位，比如同一个空位反复拖放几十次后），才只把目标分区按当前显示顺序、被拖的行放在松手位置，重新编号，结果正好落在松手处。只重编号松手处那一段连续的目标分区行，新值放在全列表里这一段上下两侧其他分区的行之间（两侧都有就均分，只有一侧就按步长 1000 往外排），其他行的排序值不变，所以切换到合并分区的分组方式（比如不分组）时，其他行的相对顺序不变；只有两侧其他分区的行之间也放不下（比如所有行排序值都相同）时，才退回从分区自己的最大值开始、步长 1000 的整段重新编号，这种情况下其他分组方式里的顺序可能变，是数据本身没有空间造成的；分区里不显示的行（比如隐藏默认分支）按手动顺序（`manualOrder ?? sortOrder`）留在原位，插入点是被拖的行在显示列表里前一行的正后方（拖到最前时是第一行的正前方），所以放到末尾时只写被拖的行，不会因为隐藏行排在后面而重新编号整组；被重新编号的邻居只写排序、不改分组，回滚恢复原值。其他排序方式只写分组，和上游跨组拖放一样，也不再切换成手动排序。
- 工作区右键菜单的分组项（钩子 `worktree-menu-groups.ts`）：host-directory 模式下按工作区的有效分组判断（自己的分组、否则项目的分组、否则无），“移入分组”只列同一主机的分组，选中后移动这个工作区本身（写它的 `sidebarGroupId`，走跨组拖放的写入和回滚，不改排序），“移出分组”写显式 `null`。多选时右键选中的行打开的是批量菜单，上游在批量菜单里不显示分组项，这里一样，所以不会只移动右键的那一行；右键选区外的行时选区收成这一行，菜单只作用于它。fork 通过 `renderSidebarContextMenu` 加的单行项（隐藏的工作区、从 Orca 移除）以前在批量菜单里也显示、只作用于右键那一行，现在批量菜单里不显示（`WorktreeContextMenuView.tsx` 一行判断）。其他分组模式仍是上游的项目级操作，只是列表去掉 `moveProjectToGroup` 会拒绝的其他主机分组。
- 遗留数据：`sidebarGroupId` 指向已删除的分组、指向其他主机的分组，或显式 `null` 时，显示、拖放和菜单都按未分组处理，读取时判断，不做迁移，不改存储，直到用户移动它。
- 两次拖放互相独立地排队：上一次的写入和回滚全部结束后，下一次才按最新状态规划并写入；上一次失败不影响下一次。插入位置仍按松手时看到的行计算。
- 创建弹窗从分组打开时，主机和分组就是该组。从侧栏空白创建时，主机和分组取当前工作区。状态看板和指定仓库的创建不改。新建的 git 工作区在完成后写入这个分组。

## 界面中文

fork 新增的界面文字（从 Orca 移除、已移除和隐藏的工作区、设置里批量移除项目、跨组拖放的提示、SSH 连接状态名、父目录导入提示、工作区右键菜单的“休眠”和“删除所选”）的英文在 `src/fork/i18n/en.json`，中文在 `src/fork/i18n/zh.json`。渲染进程登记时把两份分别合进 en 和 zh 语言包：只补缺少的键，上游已有的条目优先；其他语言经 i18next 的英文回退拿到英文。上游的 `en.json`、`en-runtime-required.json` 和 `zh.json` 都与上游一致，上游文件不翻译任何 fork 键。“仅取消分组”选项和“主机”分组模式在 `register-mode.ts`（不依赖界面的代码）里登记英文，渲染进程由 `src/fork/sidebar/mode-labels.tsx` 换成随语言变化的取值。删除 SSH 目标对话框里上游写死的 `Remove` / `Removing` 经钩子 `ssh-target-remove-labels.ts` 翻译成“删除”/“正在删除”。工作区右键菜单里上游写死的 `Sleep`、`Sleep N Workspace(s)`、`Delete Selected`、`Delete N Workspace(s)` 经钩子 `worktree-context-menu-labels.ts` 交给 `src/fork/sidebar/context-menu-labels.tsx` 翻译；没有登记时原样用上游的英文。fork 代码统一用 `src/fork/i18n/fork-translate.tsx` 的 `forkTranslate` 翻译，上游的提取检查（`config/i18next.config.ts`，与上游一致）只认 `translate` 等函数名，看不到 fork 键；fork 键由 `src/fork/i18n/fork-keys-catalog.fork.test.ts` 检查：fork 代码里每个字面量键都要有英文，且上游文件不引用 fork 键。测试还保证每个 fork 英文键都有中文，且占位符一致。

分组方式菜单里的“主机”标签是随语言取值的 getter：`mode-labels.tsx` 监听 i18n 的 `languageChanged`，通知 `sidebar-group-mode.ts` 里的标签版本号；上游 `SidebarGroupByToggle` 只加一个 `useSyncExternalStore` 调用订阅它（第三个参数 `getServerSnapshot` 也传版本号读取函数，上游测试用 react-dom/server 渲染侧栏，缺了会报 `Missing getServerSnapshot`；fork 里所有 `useSyncExternalStore` 都传这个参数，`src/fork/server-snapshot.fork.test.tsx` 检查），切换界面语言后菜单立即换成新语言，不用等别的东西触发重渲染。没登记模式时版本号不变，和上游一样。

## F003 / F025 批量导入

交接阶段把选中路径写入 `importedExternalWorktreePaths` 和 `externalWorktreeInboxBaselinePaths`。运行时导入登记了 git 根解析时，用解析出的工作区根代替扫描路径；根和工作区自己的检出相同则不写入。桌面进程不对 SSH 路径做本地 git 解析。

父目录不是 git 仓库、且至少有一个子项导入成功或原本就存在时，才添加父文件夹。同主机同路径已有文件夹则复用并取消归档；新建时用 `createFolderWorkspace` 放进父路径对应的分组。宿主接口不能把已有文件夹改到另一个分组。添加父目录失败只提示，不撤销已导入的子仓库。不自动打开，也不为此启动代理。直接 SSH、没有托管环境时，子项导入在本进程全部失败，父目录因此不会创建。这和当前参考实现一致：桌面导入遇到 `connectionId` 直接记失败，父目录块只在成功数大于 0 时运行，远端创建只走选中的托管环境。

## F006 授权窗口可拖拽的应用卡片

仅 macOS。fork 应用启动权限助手时多传 `--fork-drag-card`（`open` 不传环境变量，所以用参数）。带这个参数时，授权窗口在检查中、缺权限、权限已齐三种状态都把应用卡片放在文案下方同一个位置（高 42），代替上游顶部 58 的图标，所以状态切换时窗口不跳，检查中也没有空白占位。只有缺权限时卡片接收拖拽：整张卡片可拖，未激活窗口也能拖出；检查中和权限已齐时卡片只显示、不能拖。指定单项权限时窗口保持显示，方便拖卡片。没有这个参数时，图标、文案和点击行为都是上游原样；拖拽助手窗口里的卡片也照旧可拖。Linux 只核对 Swift 源码。拖进系统设置需要在 Mac 上做。

## F007 目录软链可选（已移除）

上游已经覆盖：SSH 浏览用 `[ -d ]` 跟随目录软链，`ls` 失败时非零退出；受管服务浏览对软链做 `stat`。fork 的 POSIX 后半段会把空目录列成一个空名字的 `/` 条目，读不了的目录显示成空目录，所以删掉，回到上游。`src/fork/directory-browse.fork.test.ts` 用上游代码验证目录软链、空目录、读不了的目录和失效链接。

## F010 SSH 重连后重绘

重连 fit 对 `ssh:` 终端先把列数减 1，200ms 后恢复这次记下的尺寸。随后的同尺寸 fit 在脉冲期间被挡住。`remote:` 终端和列数小于等于 2 时不脉冲。从停放模型恢复的完整画面不脉冲。面板当时不可见时先记下，第一次显示再用当时的尺寸脉冲，之后的显示不再补。

## F021 / F043 用 Cursor、VS Code 或 Zed 打开远端工作区（Open in 由上游 #33877 覆盖）

上游 [stablyai/orca#33877](https://github.com/stablyai/orca/pull/33877)（修 #30593）用 CLI 参数打开直接 SSH，以及文件就在这台机器上、经 SSH 到达的托管或配对服务器。Cursor 是 `cursor --new-window --remote ssh-remote+<authority> <path>`，VS Code 系是 `--remote ssh-remote+…`，Zed 是 `ssh://` URL。菜单是否可点由上游 `getExternalEditorOpenCapability` 和 `getWorkspaceEditorSshHost` 决定：编辑器是 Cursor、VS Code 或 Zed；托管侧认 `orcadDeployment` 或 `sshAccess` 上的 `sshTargetId`（临时 `runtime-ssh-` 目标不算），并且工作区文件在这台服务器上。主进程再用 `isEditorSshHostForOwner` 核对主机、代次和围栏。

fork 不再改这条打开路径。已经去掉的是：

- `cursor://vscode-remote/ssh-remote+…`，以及用 `shell.openExternal` 打开它。登记之后它挡在上游 CLI 前面。
- Open in 里多出来的 Cursor 行。Cursor 跟 Zed 一样，在打开方式里配置之后才出现。
- `adjustRemoteOpenRoute` 和 `environment-ssh-target.ts`。它只在上游判定不能打开时才跑，用连接 id 或 `orcadDeployment.sshTargetId` 打开，并把 `ownerHostId` 写成 `ssh:<id>`，主进程因此跳过运行时围栏。上游已经能打开的直接 SSH，以及「文件在这台服务器上」的托管工作区，不经过它。去掉之后，托管服务器再经自己的 SSH 访问的工作区，以及所有者还没落到这台机器上的路径，跟上游一样保持拒绝。

剩下的 fork 只有托管工作区的端口行：渲染进程登记后，每个检测到的端口有 Forward，打开已有的转发对话框，填上该端口、主机 `localhost` 和进程名。未登记时没有这个按钮。已有的 Forwarded 区不变。

## F022 软链目录上的 Cursor 会话

只保留工作区归属。上游的范围、深度和项目匹配已经读 `cwdAliases`；`resolveWorktreeInfoFromCandidates` 不读别名，所以 `ai-vault-session-worktree.ts` 仍通过 `src/shared/fork-hooks/ai-vault-cwd.ts` 按最短剩余路径排序。没有别名时排序与上游相同。

## F045 远端终端链接文件的 Markdown 预览（已移除）

上游会把终端链接的 `terminalArtifactGrantId` 复制到 Markdown 预览上，预览不再需要单独的授权钩子。fork 的这一段已经删掉。

## F046 终端文件链接留在当前工作区

没有设置开关。上游 #33304 撤回了 #32320：本地跨工作区打开回到归属工作区。fork 不恢复「留在点击时的工作区」开关，也不再自己实现那套本地停留。SSH 和服务器上的文件不切走，留在点击时的工作区，只读。嵌套工作区拥有当前根里面的路径时，改成只读视图（未保存时先不改，干净后再查）。上游已经删掉只读提示，fork 不把提示加回来。

`terminal-file-open-routing.ts` 在上游路由之外还有这些接线。未登记时调用保持上游：

- `retainSshServerLinkInSource` 和 `deeperWorkspaceReadOnlyView`，都在 `src/shared/fork-hooks/terminal-file-link-workspace.ts`。
- `terminalHtmlIsDirectSshOutsideWorktree`：认出工作区外的直接 SSH HTML。本地 HTML 不经过这里。预览地址铸不出来时，调用方仍退回编辑器源码。
- `openRemoteTerminalHtmlPreview`（`src/fork/terminal/html-preview-open.tsx`）：托管主机上没有工作区认领的 HTML、归属在另一个运行时工作区里的 HTML、托管 SSH 工作区里的 HTML、以及工作区外的直接 SSH HTML，在点击时的工作区打开应用内文档预览。字节仍走已有的 `orca-preview`。本地 HTML 和直连 SSH 工作区里的 HTML 返回 false，调用方保持上游。
- `terminalLinkViewFields`：给停留中的只读视图补字段。服务器视图留着运行时 id，本地嵌套视图不带运行时 id。路由文件直接 import `src/fork/terminal/file-link-route.tsx`。宿主解析、远程 HTML 预览、同路径兄弟标签碰撞和嵌套相对路径也放在这个文件里，避免路由文件超过行数上限。

两个钩子的行为：

- `retainSshServerLinkInSource`：宿主已经指出另一个工作区，或直接 SSH 路径属于另一个工作区时，打开目标改回点击时的工作区，并给出只读视图。点在工作区根上仍激活那个工作区。授权文件、本机文件、浮动工作区不处理。
- `deeperWorkspaceReadOnlyView`：路径在当前工作区里面，但更深的工作区拥有它时，同样改成只读视图。只有 SSH 或服务器才把路径记进 `orca.fork.terminal-file-link-stay`。本地嵌套只降级，不记标记，读取走上游的 `isClientLocalReadOnlyTab`。

外层已经打开的可写标签，在内层再打开同一路径后改为只读，标签留在外层。外层还有未保存的修改时先不改，干净后再查。本地降级不写停留标记。SSH 或服务器降级会写；编辑器加载时按归属工作区读，不重挂。没有标记的绝对路径仍按上游重挂。标记只在这台浏览器的 `localStorage` 里，键是工作区 id 和路径。只有 `hydrationSucceeded` 为真才清。启动失败时文件列表是空的，这一轮不清。

托管主机上没有工作区认领的 `.html` / `.htm`、另一个运行时工作区已经认领的 HTML、以及工作区外的直接 SSH HTML，都在点击时的工作区里用应用内浏览器渲染，不再把编辑器源码当作主路径。读取方式记在 `src/shared/fork-hooks/terminal-html-preview.ts`，`buildDocPreviewGrantRequest` 先取这条记录。没有记录时授权请求跟上游。

- 没有工作区认领、但 orcad 发了只读授权的文件：预览只读这一份绝对路径，走已有的 `files.readTerminalArtifactPreview`。和编辑器同一条授权：10 分钟过期，托管预览上限 512 KiB。同目录里的其他文件不读，相对资源会 404。样式写在 HTML 里面的页面可以渲染。铸不出预览时（终端链接钩子还没登记，或目标不是运行时环境）退回编辑器只读打开，不走上游的浏览器打开。
- 另一个运行时工作区已经认领的 HTML：预览根放在那个工作区上，走已有的 `files.readDocPreview`。标签仍留在点击时的工作区。相对资源按文档预览原来的目录授权。
- 工作区外的直接 SSH：桌面按已有连接读，实现在 `src/fork/main/ssh-html-preview-read.ts`，由 `registerForkMainModules` 登记。预览上限 10 MiB，和托管授权的 512 KiB 不是同一个上限。ssh2 用 SFTP。系统 SSH 没有 SFTP 时，先在远端跑 `realpath -e` 解析文件和所在目录，确认解析后的路径仍在父目录里、没有落到 `~/.ssh`、`~/.gnupg`、`~/.orca`、`~/.aws`，并看过大小，才 `downloadFile`。名叫 `x.html`、指向 `~/.ssh/id_rsa` 的软链不下载。父目录本身是软链时用解析后的目录比较，避免家目录软链被误判成越界。没连上、或没登记读取函数时，预览是上游的 404，打不开预览才退回编辑器。工作区里的 SSH HTML 不抢走，仍走上游的文档预览计划。
- 托管 orcad 如果部署在真实 SSH 上（`getOrcadSshDeployment` 的 `sshTargetId`，排除 `runtime-ssh-` 临时目标），工作区外的 HTML 用同一条 SSH 预览读取，连接 id 是这个 `sshTargetId`。不走 `files.readTerminalArtifactPreview`：那条授权在 SSH 文件路由上会被 `terminal_file_grant_mismatch` 拒绝。orcad 因 SSH 路由拒绝本机磁盘授权（`HostFileRefusal`）时也不再 toast，仍打开这份预览；远端文件其实不存在时，用户看到的是预览 404，不是原来的「找不到」提示。桌面必须已经有一条 id 等于这个 `sshTargetId`、并且处于已连接的 SSH 连接。没有这条连接，或托管部署之后断开了，读取返回 null，预览同样是上游的 404，不会自动重连。页面留在本机文档预览，不把绝对路径交给 SSH 路由的浏览器。id 对不上时同样是空白文档预览加 404，不会改成 `file://`。工作区里的 HTML 也打开同一份文档预览，但字节走 `files.readDocPreview`，不走 SFTP：点击时的文件上下文有时没有运行时 id（终端被看成 local-or-ssh），上游就会把远端绝对路径写成 `file://`，SSH 分区里的 Chromium 在这台 Mac 上找这个路径，得到 `ERR_FILE_NOT_FOUND`。文件上下文没有连接、工作区执行主机却是带真实 `sshTargetId` 的运行时，或就是这条 SSH 主机时，先标上连接，避免系统浏览器和 `file://`。这条连接只给预览用。预览铸不出来（终端链接钩子还没登记）而路径在工作区外时，不把标上去的 `sshTargetId` 交给编辑器当桌面 SSH 连接：托管部署上桌面往往没有这条连接，读取会报「工作区主机变了」。改为在部署所在的运行时里只读打开源码，不带 `externalSshTargetId`。工作区外的绝对路径运行时读不到，编辑器报路径在工作区外。工作区里的 HTML 仍走文档预览计划。直连 SSH 工作区里的 HTML 仍走上游的文档预览计划。临时目标没有这条部署时，仍用原来的授权预览。浏览器页或标签的引用变了，而且地址是这次点过的预览时，裸绝对路径和 `file://`（含百分号编码的文件名）都拉回文档预览。没有 `terminalArtifactGrantId` 的运行时预览也拉回，这是故意的：工作区里的 HTML 记的就是运行时文档预览，地址被写成 `file://` 时要拉回来。带授权 id 的记录不会被拉过去。还没记下读取方式的 `file://` HTML，只有 SSH 浏览器路由开着才补上同样的记录再拉回。路由开关关掉，或这个目标在禁用列表里时，页在本机分区，不补记录、也不拉回，手贴且本机存在的 `file://` 留在本地。地址栏手贴、且工作区不是 SSH 路由的路径不会被拉进预览。

沙箱 webview 的 `browser-window-close-preload.js` 和 `doc-preview-link-preload.js` 跟主进程打在同一次 Rolldown CJS 构建里。Rolldown 1.2.14 会抽出 `chunks/rolldown-runtime-<hash>.js`，沙箱 `preloadRequire` 加载不了这个相对路径，控制台就是 `Unable to load preload script` 加上 `module not found: ./chunks/rolldown-runtime-….js`。preload 文件本身在 asar 里，不是漏打。同步 #40 的 Rolldown 线程上限和 macOS 终端宿主改回官方 Node 都没改这个版本，也没把 preload 从包里拿掉。`createSandboxedPreloadRuntimeInlinePlugin` 在 `generateBundle` 里把这份运行时内联进这两个入口，其它入口仍引用原来的 chunk。内联之后如果 `browser-window-close-preload.js` 或 `doc-preview-link-preload.js` 还含有 `require("./chunks/`，或者这两个入口不在 bundle 里，构建直接失败。运行时 chunk 自己再去 `require` 另一个 chunk 也会被同一条检查抓住，不会在 Rolldown 升级后悄悄打回沙箱加载失败。这和 `file://` 打不开不是同一个问题。

本地 HTML 跟上游，默认用系统浏览器，fork 不覆盖。不是 SSH 路由的工作区里，地址栏手贴的绝对路径不会变成 `orca-preview`，要点链接才会铸预览授权。SSH 浏览器路由开着时，手贴的 `file://` HTML 会补上预览记录并拉回文档预览；路由关掉时留在本机。

已经打开的运行时文档预览（或同一工作区里的浏览器页）在地址栏改成工作区外的绝对路径或 `file://` HTML 时，以前仍走 `files.readDocPreview` 的边界检查，提示「工作区之外的文件尚无法在配对服务器上预览」。路由开着、并且部署是真实 `sshTargetId`（不是 `runtime-ssh-`）时，地址栏提交才记下和点击相同的 SSH 预览，再把当前页转成文档预览。解析、补全只判断，不写记录。字节走这条 SSH 读取。路由关掉或目标在禁用列表里时不记、不转，保留原来的拒绝，也不把本机 `file://` 收成远端预览。已经记下的地址栏预览，在开关关掉或目标被禁用后清掉，计划也不再按旧记录放行。点击记下的预览不随这次清理删除。连接 id 对不上时仍是空白文档预览加 404，不会退回 `file://`。工作区里的 HTML 仍走 `files.readDocPreview`。

`src/fork/terminal/file-link-route.tsx` 负责查找归属、在上游解析之后套用 SSH 停留、做嵌套只读降级、把远程 HTML 送进应用内预览、以及同路径兄弟标签是否跳转，并给服务器上的只读视图补回运行时 id，避免路由文件超过行数上限。写成 `.tsx` 是因为 node 工程只收录 `src/fork/**/*.ts`，这个文件要引用渲染进程的 `@/` 别名。`src/fork/terminal/file-link-stay-watch.tsx` 的 `registerTerminalFileLinkStayWatch` 登记停留标记的读写，并监视外层标签；这里没有设置开关。

托管服务器上的 orcad 另外登记 `src/shared/fork-hooks/terminal-disowned-host-file.ts`（只在 `installForkOrcadHost`，桌面进程不登记）。登记的是打开函数，实现在 `src/fork/main/disowned-host-file-open.ts`。上游 `terminal-path-resolver.ts` 只调用这个钩子。终端或对话里的路径、`file://`，HTML 与否都一样：这台服务器上没有任何工作区认领，而且近期输出授权也失败时，以前 `files.resolveTerminalPath` 不 stat 就返回 `exists:false`。客户端因此拒绝「outside every workspace on its host」，停留钩子也不会跑。对话链接通常不带 `terminalHandle`，也不带 `nativeChatContext`。登记之后，`crossWorkspace` 的请求会 stat 本机文件。普通文件存在就发只读 `absolute-file` 授权，来源记为 `disowned-host`，绑在发起请求的那个工作区上。非 HTML 仍在编辑器里只读打开源码。`.html` / `.htm` 由客户端打开应用内预览，不进系统浏览器，也不切到 `~`。目录不发源码授权。`~/.ssh`、`~/.gnupg`、`~/.orca`、`~/.aws` 不发授权，软链落到这些目录同样拒绝。SSH 路由不在这台机器上 stat。未登记时仍是 `exists:false`，不碰磁盘。客户端目录里就算有 `~` 文件夹工作区，也不拿它当服务器上的归属。

## F047 工作区里的多个仓库（只读）

一个需求目录常常是 Orca 工作区，根上还有好几份 git 检出（前端、客户端、后端、控制台各自的 feature 分支，很多是 `git worktree add`）。以前源代码管理只看根仓库，嵌套仓库里的改动看不见。

源代码管理多一个范围开关，按工作区记在本地：当前仓库（和上游完全一样）或工作区仓库。工作区范围里每个仓库一栏，有相对路径、分支、领先/落后，以及已暂存、未暂存、未跟踪、相对主干的提交。点文件打开 diff。比较目标存在这台主机上，键是主机、工作区绝对路径、仓库相对路径和分支；没有覆盖时用上游的 `getBaseRefDefault`（`origin/HEAD`，然后 `origin/main`、`origin/master`），再没有就显示未设置。不写工作区自己的 baseRef，也不查 MR/PR。

发现只看工作区根下的第一层：根仓库自己，加上直接子目录里带 `.git` 目录或文件的检出（`git worktree add` 的 `.git` 是文件，也算）。名字以 `.` 开头的子目录和 `node_modules` 跳过。目录软链不跟，就算目标还在工作区里面也不跟，避免深层检出借软链出现在第一层。发现到的仓库不再往下扫，所以子仓库里的子模块不会再各占一栏。第一层以下的检出（例如 `svc/api` 这种 worktree）不再单独成组，父目录仍可能以未跟踪目录出现在根仓库的变更列表里。根上的 `.gitignore` 不影响这一层（嵌套检出经常被忽略）。数量上限、超时和逃出工作区的检查还在，按 realpath 去重。根仓库自己也占一行。根仓库 `.gitmodules` 里还没检出的子模块不单列，界面收进最后一栏、默认收起的「其他」。已经检出的路径（含第一层以下、目录里已有 `.git` 的）不收进「其他」。

根仓库这一栏只去掉已经单独成栏的嵌套仓库的未跟踪条目（正好是该仓库根，或在它里面的未跟踪路径）。嵌套检出被报成未跟踪目录才去掉。已暂存或未暂存的 gitlink（根 `.gitmodules` 里已初始化的子模块有新提交，或指针已暂存）是根仓库自己的改动，留在根分组里，并算作有改动。根仓库自己的未跟踪文件、以及只是路径前缀撞车的文件，都留着。比较在 fork 的状态读取里做，不改上游 `git.status`。

有未提交改动、或领先比较目标的仓库排在前面并自动展开；没有改动的收起。根仓库固定在最上面：它是打开的这个工作区，收起时只有一行，下面的仓库按改动集合重排时它不跳。「其他」固定在最后。栏目标题直接显示未提交数量和领先/落后。排序只看「哪些仓库有改动」这个集合，条数变化不重排。用户手动展开过的栏不会被自动收起，手动收起的也不会被下一轮自动展开。这一栏按工作区 id 作为 key，换工作区时不把展开状态带到同名子仓库上。「只显示有改动的」记在本机 localStorage（`orca.fork.source-control-only-changed`，整个面板一份，不按工作区分），缺省为关。状态还没回来、或者比较还在算的仓库先留在列表里，避免比较结果到达前被滤掉。比较已经结束但不是 ready（出错、基线无效、没有合并基线、HEAD 还没出生）且没有未提交文件时，视为没有改动，打开过滤后不再一直留着。

新 RPC 是 `git.workspaceRepositories` 和它的 `status`、`branchCompare`、`diff`、`branchDiff`、`setCompareTarget`。不往上游的 `git.status` 等参数里加 `repositoryPath`：旧主机会丢掉不认识的字段，静默返回根仓库。能力 `fork.git.workspace-repositories.v1` 放在 `src/shared/fork-hooks/git-workspace-capability.ts` 再摊进 `RUNTIME_CAPABILITIES`，这样 CLI 工程不用包含 `src/fork`。渲染进程对本地桌面视为已有这个能力；配对或托管主机用 `runtimeEnvironmentSupportsCapability`，没有就灰掉开关。`repositoryPath` 不能逃出工作区，realpath 也不能顺着软链跑出去，并且必须在这次发现结果里。

git 目标解析器在 `runtime-construction.ts` 里绑定。`resolveRuntimeGitTarget` 声明在更下层的子类上，`orca-runtime.ts` 又顶着行数上限，所以这里做一次结构转换，不把方法挪到最终类上。

这一步只读。暂存、取消暂存和提交留到下一步。

`ssh:` 和 `runtime:` 的工作区在读任何文件之前就拒绝：桌面进程不能按远端路径扫自己的磁盘。托管 SSH 主机的请求目标是 `environment`，方法在那台主机的 orcad 上执行，开关等能力探测通过再打开。桌面上直接标成 `ssh:` 的仓库，以及只有 `connectionId` 的旧 SSH 行，扫不了，开关灰掉并说明要用那台主机上的 Orca。默认比较目标按仓库、分支和 HEAD 记住，五分钟过期，最多留 64 条；手动刷新或 HEAD 变了立刻重算。分支比较在第一次、刷新、HEAD 或比较目标变化时做；状态里带一次 rev-parse 得到的基线提交，它变了就重比，否则满一分钟再比。这是每次状态轮询、每个仓库多出来的一次 background rev-parse：比较目标解析只给出 ref 名，没有可以共用的 oid。比较目标的写入在本进程排队，发布前再读一次合并；文件在但读不了（坏 JSON，或不是缺文件的错误）就不覆盖。桌面和 `orca serve` 可以共用 userData，平时靠实例锁互斥；锁状态是 unavailable 时桌面仍会启动，两边可能同时写。diff 标签只有在这条路由和能力允许时才先要清单；发现失败或主机没有这个方法就退回上游，并短时间记住，避免每个文件再探一次。已经确定落在嵌套仓库里的路径不会改拿根仓库的 diff。

## F048 删除工作区默认保留文件夹

删除工作区对话框对 git 工作区（含一次删多个、含子工作区）多一个「同时删除文件夹」勾选，默认不勾。不勾时只从 Orca 移除：复用「从 Orca 移除」的归档（`isArchived: true`），不调用 `git worktree remove`，目录留在磁盘上。勾上之后仍是现在的硬删除，文案也仍是「会从 git 删除并删掉工作区文件夹」，未提交的改动那句警告只在勾上时出现。

文件夹工作区本来就只删 Orca 里的记录、不删目录，对话框不显示这个勾选，确认仍走原来的路径。

软删除写成归档，是因为下次 git 扫描会合并已有元数据：`isArchived` 还在，侧栏不会把同一行立刻加回来，也可以从「已从 Orca 移除」里恢复。不用 forget-local：那会删掉元数据，下一次列表把这行当成新工作区加回来，归档标记是默认的否。git 里的 worktree 登记还在，目录也还在，也不另做「`git worktree remove` 但留下目录」。

没有所属仓库、主机对不上、或扫描时对不上原来的 id / 身份键时，元数据里的 `isArchived` 写不进去或读不回来。软删除另外在本机 `localStorage`（`orca.fork.archived-workspaces`）记下一条隐藏记录。有所属仓库时按工作区 id（路径写法折叠后比较）、身份键和主机对上。没有所属仓库时再按规范化路径对上，同一台主机上换成另一个仓库 id 也对得上。记录和候选行两边都写了主机时，路径记录也必须是同一台主机，所以一台 SSH 上的孤立行不会藏起另一台主机的同一路径，也不会藏起另一台主机上有所属仓库的活行。某一边没有主机时仍按路径对上：占位行或旧记录可能还没标主机，宁可继续藏着，也不要把软删除的行漏回活动列表。强制刷新和普通 worktree 扫描都在合并进侧栏之前套上这条记录。SSH 终端水合占位、运行时会话占位，以及已知 SSH 工作区的回退列表（不经过那次合并）也套上。对上的行标成归档，活动列表不显示，已移除列表里可以恢复。恢复和撤销会先删掉这条记录。新建工作区成功、导入成功（添加项目、选中的关联工作区、外部工作区收件箱）会清掉同一条路径上、按上面的规则对得上的记录，避免以后在同一路径再建一个工作区时被悄悄藏起来。只清这条记录不够：profile-state 里同一 repo+path 的元数据还会把软删除写下的 `isArchived: true` 合并进新行，刷新之后仍在「已从 Orca 移除」。桌面新建、运行时新建和预置根目录在换上新的 `instanceId` 时把 `isArchived` 写成否。导入在重新扫描之前也对这条路径写 `isArchived: false`。发现扫描补上缺失的 `instanceId`、以及给已经不在的父工作区轮换血统，都不清归档，所以普通刷新仍把软删除的行留在已移除里。硬删除成功后元数据本来就会丢掉，不会为了清归档再写回去。勾选「同时删除文件夹」的硬删除成功后也清掉（强制删除成功同样清，因为目录已经不在）。这条硬删除本身仍是原来的 `git worktree remove`，软删除不写「同时删除文件夹」的记录。

「不要再问」只跳过对话框。登记了这个钩子之后，跳过确认的删除也是软删除，不会因为上次勾过「同时删除文件夹」就在以后静默删目录。没登记时（上游测试）跳过确认仍是硬删除。勾选和「不要再问」一起确认时，这一次硬删除，之后的跳过确认仍是软删除。

按主机查不到的行按失败关闭：整批返回空数组，不归档也不硬删除。跳过确认拿到空数组时，不会把没对上的 git 工作区交给 `git worktree remove`。软删除返回 null 时（全是文件夹工作区），登记之后的回退也只删文件夹记录，不会顺手删 git 行。

硬删除失败后的强制删除（`canForceDelete`）不再显示「同时删除文件夹」，文案改回上游的硬删除。Force Delete 仍会删目录。

软删除不丢掉编辑器里还没保存的内容，也不关这些标签。对话框在不勾选时不显示「未保存的编辑将被丢弃」。缓冲区留到用户自己关标签。

一次归档多个 git 工作区只弹一条汇总提示，不逐行提示。单行仍是原来的「已移除」和撤销。

命令行和配对客户端的 `worktree.rm` 不经过这个对话框，仍会硬删除文件夹。

`DeleteWorktreeDialog.tsx` 顶着行数上限。复选框和软删除在 `src/fork/sidebar/workspace-folder-delete.tsx`，对话框直接 import。空列表时关闭、开关和确认按钮焦点在 `src/fork/sidebar/workspace-folder-delete-lifecycle.tsx`：这是上游对话框里的行为，为了行数挪过来，不是新钩子。同步时把这三处当上游逻辑。行为仍由 `registerForkWorkspaceFolderDelete` 打开；没登记时没有勾选，确认仍硬删除。子工作区在软删除时只归档，不按硬删除那样先删子级。

## F049 从 Ego Lite 导入 Cookie

设置里「会话和 Cookie」的导入菜单，在本机发现 Ego Lite 时多一项「从 Ego Lite」。有多个配置时和 Arc 一样出子菜单。没安装，或配置目录里没有 Cookies 库时不显示这一行，和没装的 Chrome 一样。点选之后走上游的 Chromium 导入：快照、解密、合并、失败提示，菜单底部仍是「Google 登录信息未导入」。Safari 和从文件导入不改。

登记在 `src/fork/ego-lite-cookie-browser.ts`。桌面和渲染进程由 `register.ts` 登记，导入提示名单在渲染进程里算；orcad 不走 `register.ts`，由 `register-main.ts` 再登记一次，远端导入才会在那台机器上发现浏览器。未登记时发现结果、配置切换、Windows 密钥目录和提示名单都与上游一致。登记里如果再写一个已有 family（比如 chrome），上游那一条仍然优先，换不掉 Chrome 或 Arc。

macOS 根目录是 `~/Library/Application Support/Citro Labs/ego lite`，`Local State` 和各个配置直接放在这下面。钥匙串通用密码的服务名是 `ego safe storage`、账户是 `ego`，都是小写；不是按显示名拼出来的 “Ego Lite Safe Storage”。Windows 根目录是 `%LOCALAPPDATA%\Citro Labs\ego lite\User Data`，比 macOS 多一层 `User Data`，和 Chrome 相同；解密仍读这份 `Local State` 里的 DPAPI。这两处路径分别对过 SweetCookieKit 的目录和 citrolabs/ego-lite 的 Windows 问题记录。Linux 还在官方路线图上，不设根目录。Cookie 文件先找 `<配置>/Network/Cookies`，没有再找 `<配置>/Cookies`。配置名单来自 `Local State` 的 `info_cache`，不单独解析 Space。

菜单文案沿用上游的 `From {{value0}}` / `从 {{value0}}`，填进去的名字是 `Ego Lite`。导入之后会话来源的 family 是 `ego-lite`，设置行用 `BROWSER_FAMILY_LABELS` 显示 Ego Lite。

## F041 普通目录的终端生命周期

`folder:<id>` 在 `resolveWorktreeSelector` 之前解析。没有这个文件夹时仍抛 `selector_not_found`。`stopExact` 把该结果放进存活刷新用的工作区列表，因为文件夹不在原来的 resolved map 里。

## F044 全部主机时经 SSH 的 Orca 服务器（已移除）

上游已经覆盖（#31226）：保存的环境记录对 SSH 一律带 `connectionDependency: 'ssh-tunnel'`（`runtime-environments.ts` 里的收窄）。全部主机扫描按这个字段给 SSH 隧道 15 秒，其余 3 秒。fork 的超时回退已删除，`src/main/ipc/ai-vault.ts` 回到上游。

## 历史会话（已登记）

- 列表默认看所有主机。多台主机先有可折叠的主机行，下面是完整目录；只有一台主机时不重复主机行。新组默认收起，标题栏一次收起主机和目录。
- 全文搜索保持命中顺序。多台主机的命中在行上标出来源，由上游 #31261 提供（环境名和 i18n 提示）。历史面板里不另显示索引状态（以前 fork 在列表上方逐主机列出，已删除），索引状态只在上游的设置「智能体会话搜索」页里看。主机菜单把没有会话、不是当前主机、也没连上的远端收进「其他已配置主机」。
- `src/fork/ai-vault/agents-panel-empty-profile.fork.test.tsx` 用空配置渲染整个「Agents」面板（登记了 fork 的面板插槽和列表呈现），检查不会报 React #185（Maximum update depth exceeded）：fork 插槽以前在 zustand 选择器里每次新建数组，`useSyncExternalStore` 一直重渲染，右侧栏崩溃。
- 扫描进程的内存按本机内存计算，下限仍是 384 MiB。工具输出按块写入索引，索引版本 +1，旧的截断索引会重建。
- 启动时浏览器分区的代理改成后台应用，不再挡住第一个窗口。每个分区在排队时同步标成「代理未就绪」，请求守卫会扣住该分区的请求直到代理生效，失败则取消请求，所以不会有请求先走直连。`src/fork/main/startup/browser-session-proxy.fork.test.ts` 验证这一点。
- Mac 签名忽略 `/ai-vault/` 静态资源。
- 没有另做一份主机扫描缓存。Linux 上用合成会话量过：上游冷扫描已经能在一次扫描里给出列表，热扫描大约 10 毫秒；旧的 150 毫秒提前返回在冷扫描时是空列表。数字记在 [docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)。

## F024 Skill 安装来源（已放弃）

不再移植自定义仓库。skills 仍从 `https://github.com/stablyai/orca` 安装，内容与上游相同。fork 构建不能把本次构建提交当作 clone ref：该提交不在上游，`npx skills add` 会报 Failed to clone repository。

渲染进程、WSL，以及可复制的 `npx skills add` 命令用的 ref 是上游基线提交，只写在 `src/cli/skills-source-commit.ts` 一处。tsc 仍会发出 `out/cli/skills-source-commit.js`，安装脚本只检查这个文件存在；打包后的 CLI 闭包不再要求它，因为上游 CLI 已改为拷贝内置技能文件，不再按提交克隆。渲染进程的登记（`src/fork/register.ts`、`agent-feature-install-commands.ts`）引用同一个文件，主进程不再登记。生产 CLI 代码不引用 `src/fork`。同步后运行 `node fork/scripts/sync-skills-source-commit.mjs` 重写这个文件：先 `git merge-base HEAD fork/base-upstream`（再 `origin/fork/base-upstream`）；没有该引用就用 `git merge-base HEAD upstream/main`（再 `origin/upstream/main`），不用上游 main 的最新提交；都没有就保留已写入的值。上游里断言构建提交地址的测试只 mock 掉这次登记、保持上游原样，pin 本身由 `src/fork/skills-source-commit.fork.test.ts` 和 `skills-source-commit-renderer.fork.test.tsx` 检查；本机没有任何上游引用时，前者跳过并在用例名里写明原因。`src/shared/agent-feature-install-commands.ts` 与上游一致，没有 skill 仓库钩子，也没有 `ORCA_FORK_SKILLS_SOURCE`。

## F036 本机 orcad 模板目标

`ORCA_ORCAD_TEMPLATE_TARGETS`（逗号分隔）设置时，打包清单校验收窄到该子集。未设置则仍要求全部目标，发布 CI 行为不变。安装脚本把它设成 `darwin-arm64,linux-x64-glibc,linux-arm64-glibc`，并设置 `ORCA_REQUIRE_ORCAD_TEMPLATE=1`。`linux-x64-glibc217` 不写进这个变量：模板脚本在基座槽 `linux-x64-glibc` 已请求且预编译存在时自动放进清单，上游校验又会把清单里的兼容槽加进期望集合，写两次会对不上。打包后的检查另外要求这四个名字都在 `targets` 里。不能改用上游发布的 orcad 模板：`orcad.js` 打包的是 `src/main/orcad/main.ts`，它引入 `orcad-entry.ts` 并调用 `registerForkMainModules`。musl、win32、`darwin-x64` 仍不在本地包里；Apple Silicon 编不出 `darwin-x64`。SSH 到未编进模板的主机仍会失败。

## 应用内更新

发布检查只指向 `quzard/orca-fork` 的 GitHub Releases，用 electron-updater 的公开 GitHub provider 匿名读取（`private: false`，没有 `token` 字段），打开 `allowPrerelease`，元数据文件是 `latest-mac.yml`。不读令牌文件，不读 `GH_TOKEN` / `GITHUB_TOKEN`，请求里没有 `Authorization`。设置页没有令牌输入，也没有相关 IPC。

fork 构建（`registerForkBuild`，主进程、渲染进程和 orcad 都登记）不访问上游：不列上游版本、不解析指定的上游 tag、不拉上游 atom、发行说明链接指向 `quzard/orca-fork`；`onorca.dev` 的 changelog 和 nudge 直接返回空；agent 状态规则不从上游 Releases 下载，只用内置规则和用户的覆盖文件。未登记时仍是上游行为。所有拼上游发布地址的源文件列在 `src/fork/upstream-release-sources.fork.test.ts`，每个都要调用 `isForkBuild()`，上游新加一处时测试会失败。这个扫描只检查有没有这次调用，不检查门挡的是不是正确的分支；行为由 `upstream-release-reads.fork.test.ts` 和 `updater-fork-feed.fork.test.ts` 在运行时覆盖。

后台下载完成后，macOS 要等 Squirrel 暂存完成（`isMacInstallerReady()`）才弹重启卡片；暂存期间手动检查只把界面放回「已下载 100%」。暂存失败时清掉暂存中的版本，界面进入错误状态，重新检查会重新下载。受监管的无界面 serve 把暂存推迟到 `quitAndInstall`（`isMacStagingDeferredToInstall()`），这种情况下下载完就算就绪。已知限制：Squirrel 既不完成也不报错时，版本一直停在暂存中，后台检查一直挂起，手动检查一直显示「已下载 100%」。

家里的 LaunchAgent 只在 `develop` 前进时构建、签名并发布。它跑的是 `~/Projects/orca-verify/bin/mac-auto-update.sh`，安装脚本负责复制。已经装过、仍指向仓库内脚本的代理，要重跑安装脚本，再在终端手动跑一次并点 Always Allow，然后 `--bootstrap`。脚本在 git 操作之前从临时文件重新执行，退出时删掉该副本；成功结束后才用 mv 换掉稳定副本。构建在独立进程组里，锁文件挡住第二次同时构建。codesign 超时会 `kill` 整个进程组。glibc 2.17 的 Node 压缩包先放进 `~/Projects/orca-verify/node-runtime-cache`（缺了就从 `ORCA_NODE_UNOFFICIAL_MIRROR` 取），文件名、版本和 sha256 读上游的 `src/shared/node-runtime-pin.ts`，脚本里不另写一份；读到后先校验格式（版本 `X.Y.Z`、64 位小写十六进制 sha256、文件名必须是 `node-v<版本>-linux-x64-glibc-217.tar.gz`），不符合就报明哪一项并停止（`mac-auto-update-seed.test.sh`）。状态文件不再写 `installedSha`：Mac 上没有地方读它。代理只来自 `sync.env` 的 `ORCA_PROXY`（或直接写的 `http_proxy` 等）。

发布用 `gh release create`。`gh auth status` 放在「这个 sha 已发布」之后。失败时 `release` 保持原值，`ghAuth` 记为 `failed`，不写成 skipped。`dist/` 里版本后缀已经对上该 sha 时，gh 恢复后只补发，不重新签名。客户机不需要 gh，也不再用 `gh release download` 安装。

launchd 里签名可能停在 Orca Local Signing 的钥匙串确认上。`--bootstrap` 之前先在终端跑一次稳定副本，点 Always Allow。超时或拒绝写入 `sync-status.json`，默认 600 秒（`ORCA_CODESIGN_TIMEOUT_SECONDS`）。已登记的 fork 构建不列出、不钉、也不打开上游 stablyai 的发行说明。

## F038 macOS 本地文件密钥

仅打包后的 macOS、且不是隔离配置时，桌面 `SecretStore` 换成 `MacosFileSecretStore`。32 字节随机密钥，AES-256-GCM，密钥在 `~/.orca/secrets/macos-key-v1`，目录 0700、文件 0600。并发首次启动用排他硬链接，只保留先发布的密钥。密钥缺失或损坏会报错，不回退明文。插件和账号会话走同一个 `guardedSafeStorage` 后端。开发、Windows、Linux、SSH orcad 仍走各自原来的存储。

## F040 自用发布

- 家里的 Mac 用 [fork/scripts/mac-auto-update.sh](fork/scripts/mac-auto-update.sh) 构建、签名并发布（见“应用内更新”）。构建步骤是 [fork/scripts/install-mac-release.sh](fork/scripts/install-mac-release.sh) `--build-only`：上游发布步骤、`darwin-arm64` 与 Linux glibc orcad 槽、`dist/mac-arm64/Orca.app`。
- 手动安装仍用 `install-mac-release.sh`（不带参数）：安装前备份旧应用，替换失败时改回；验收后用 `--cleanup-verified-backups` 清理。只给已删除的发布入口用的 `--install-built` 已去掉。
- 旧的手动发布入口 `release-personal-orca.mjs`、它的 `personal-release-checks.cjs` 和本机任务检查 `personal-orca-host.py` 已删除，Mac 上从未使用。

## 内部标识

本 fork 新增的文档、脚本和 `src/fork` 不得写入雇主或内部环境的名称、地址、主机和数量。检查是 `fork/scripts/verify/check-no-internal-refs.sh`，扫描 `src/fork`、`src/shared/fork-hooks`、`docs/fork`、`fork/`、本文件，以及从 skill pin 记录的上游基点以来新增的所有文件（任何扩展名）；没有那个提交时退回按 `*.fork.test.ts(x)` 和 `*-fork.test.ts(x)` 文件名收集。具体模式放在未入库的 `fork/scripts/verify/internal-ref-patterns.local`，或环境变量 `ORCA_INTERNAL_REF_PATTERNS`。上游文件复制或改名而来的 fork 文件也按新增扫描（`--no-renames`）。

## 提交身份

`fork/scripts/verify/check-commit-identity.sh [REF]`（默认 `HEAD`）检查 `git rev-list REF ^upstream/main ^下限` 里的每个提交，合并提交也算：作者和提交者都必须正好是 `quzard <30899719+quzard@users.noreply.github.com>`，否则列出不合规的 SHA 并失败。没有 `upstream/main` 引用时直接失败，不退回别的基点。下限 `8fd7c96acc934cb25e41b5da17f1743e88219bbe`（develop 的 8fd7c96acc）写死在脚本里，不从任何文件读：以前的 `fork/scripts/verify/identity-baseline` 从被检查引用自己的树里读，后面的提交可以把它挪过一个坏提交，从而跳过检查，现在这个文件已删除，提交改不了下限。仓库里没有这个提交，或它不是被检查引用的祖先，都直接失败。下限之前的提交已经公开，加检查时查过，没有个人邮箱（其中 20 个是 2026-10-16/17 的 `Cursor Agent <cursoragent@cursor.com>`，无法改写）。不要改这个下限。`check-no-internal-refs.sh` 扫完内容后接着跑它（`ORCA_IDENTITY_REF` 可指定引用）；`daily-sync.sh` 在推 attempt 分支和 `develop` 之前各跑一次，它自己的合并、pin 和冲突提交由脚本设置成这个身份（`GIT_AUTHOR_*` / `GIT_COMMITTER_*`），机器上不用配置；`fork/push_github.sh` 推送前跑；`mac-auto-update.sh` 发布 release 前对要发布的提交跑。这两处和 `run-linux-verify.sh` 在检查前先用 `fork/scripts/verify/fetch-upstream-main.sh` 拉最新的上游 main（`upstream` 远端，没有时用 daily-sync 添加的同一个地址），拉取失败就不推送、不发布；daily-sync 本来就在合并前拉过。拉取有超时：默认 600 秒（Mac 上一次拉取用了约 6 分钟），用 `ORCA_UPSTREAM_FETCH_TIMEOUT` 改；超时后杀掉 fetch（先 TERM，5 秒后 KILL，连同它的子进程），以非零退出，调用方按拉取失败处理。不依赖 GNU `timeout`，macOS 自带的 bash 3.2 也能用；另外设了 git 的 `http.lowSpeedLimit` / `http.lowSpeedTime`，传输停滞 120 秒也会中止。fetch 在自己的进程组里（`set -m` 作业控制；macOS 没有 `setsid`），launchd 停止任务（卸载、注销、关机）时杀的是脚本的进程组，碰不到 fetch 和它的子进程（git-remote-https 等），它们会成为孤儿继续跑。所以脚本捕获 TERM、INT、HUP：先停看门狗，再停 fetch 的整个进程组，然后按惯例退出（143、130、129）；正常结束和超时由 EXIT 陷阱做同样的清理，每一步只做一次，不会重复杀。停一个子进程时每 0.1 秒重发一次 TERM，3 秒后还在就发 KILL，清理时不 `wait` 任何子进程（bash 自己回收，退出时剩下的僵尸交给 init），所以清理最多几秒，不会一直等。不 `wait` 是因为：launchd 把 TERM 发给脚本的整个进程组时看门狗也收到，它若恰好在信号打断脚本等 fetch 的 `wait` 时退出，bash 3.2 和 5.2 都可能把它悄悄回收掉，之后再 `wait` 它就会一直等到另一个子进程（fetch）结束，而这时 fetch 已经没有看门狗管了（身份测试“TERM to the script's group (launchd)”在高负载下偶尔要等假 fetch 的 `sleep 300` 结束才退出，就是这个原因）。看门狗收到 INT、HUP 时和 TERM 一样结束它正在睡的 `sleep`（后台的 `sleep` 忽略 INT，看门狗直接死掉会把它留下）。判断“没了”时用 `ps` 排除僵尸进程；没有可用的 `ps`（精简容器里缺它、运行失败或什么都不输出）时只看 `kill -0`，当作还在，照样重发 TERM、3 秒后 KILL。重发是因为 bash 的子进程刚起来、还没换上自己的陷阱时，收到的信号会被丢掉：父进程捕获着 TERM 时，子进程开头仍用父进程的陷阱处理函数，记下的信号在它重置陷阱时被清掉。以前只发一次 TERM 再无限期 `wait` 看门狗，信号落在启动窗口里时（约 1%～2%）脚本要等到看门狗超时（生产 600 秒）才退出。看门狗收到 TERM 时也结束它正在睡的 `sleep`，包括 TERM 落在起 `sleep` 和记下它的 pid 之间的情况，不留下 `sleep`。信号如果落在 fetch 和看门狗刚启动、pid 还没记下的那一刻，陷阱只记下信号，两个 pid 都拿到后立即按上面的步骤处理，不会漏掉 fetch。测试是 `fork/scripts/check-commit-identity.test.sh`（含评审复现的“挪基线跳过坏提交”现在失败，以及假的卡住拉取被超时杀掉、脚本收到 TERM/INT/HUP 时连同子进程一起被杀掉，包括信号落在启动 fetch 和记下 pid 之间的情况）。压力测试是 `fork/scripts/fetch-upstream-signal-stress.test.sh`：TERM、INT、HUP 各在启动窗口里打 200 次（`ORCA_FETCH_STRESS_RUNS` 调次数，`ORCA_FETCH_STRESS_BASH` 换被测的 bash），每次都要在 5 秒内按退出码退出，事后不剩 fetch、它的子进程、看门狗或看门狗的 `sleep`；另外在被测脚本的 PATH 最前面放让 `ps` 失败或什么都不输出的垫片，各跑 20 次，再用一个根本没有 `ps` 的 PATH（链接原 PATH 里除 `ps` 以外的全部命令，脚本以后多用命令也不用改测试）跑 20 次（`ORCA_FETCH_STRESS_NO_PS_RUNS`）；fetch 和它的子进程都忽略 TERM 时，每次都要走 3 秒后的 KILL 分支，用时在 2.9～8 秒之间（Mac 上 4.5～4.85 秒）、不剩进程（`ORCA_FETCH_STRESS_KILL_RUNS`，默认 3 次）；fetch 已经在跑、脚本在等它时把 TERM、INT、HUP 发给脚本的整个进程组（和 launchd 一样，看门狗一起收到），各 100 次，每次 5 秒内退出、不剩进程（`ORCA_FETCH_STRESS_GROUP_RUNS`）。找不到被测的 bash、`ps`、git、perl 或 awk 时测试在 stderr 说明并以 2 退出，不会悄悄退出。测试自己的检查用绝对路径的 `ps`，单次运行超过 35 秒就从外面 KILL 掉并算失败，测试不会卡死。同一个检出里可以同时跑几次压力测试或身份测试，互不干扰：压力测试每次把被测脚本复制到自己的临时目录里测，只按这份副本的路径、自己的临时目录、自己的进程组和自己的 `sleep` 辅助进程找残留进程、杀进程，从不按名字或模式杀；身份测试只杀它自己记下的 pid 和进程组。从非交互 shell 的后台作业（`bash -c '… &'`）启动时 INT 一开始就被忽略，用 `nohup` 启动时 HUP 被忽略（`nohup … &` 两个都被忽略），bash 改不回来，INT、HUP 用例会误报超时；所以两个测试开头都用 `fork/scripts/signal-test-preflight.sh` 检查被测的 bash 能不能捕获 INT 和 HUP，不能就用 perl 把两者恢复成默认后重新执行自己一次（bash 3.2 和 5.2 都行），还不行就说明原因并以 2 退出，不报超时。

## 根目录杂项

`push_github.sh` 在 [fork/push_github.sh](fork/push_github.sh)。主机、仓库路径、GitHub 地址和分支都要由环境变量给出，没有内置默认值。示例路径是 `/srv/wt/project`。

早期方案和评审笔记没有入库，见 [docs/fork/historical-notes.md](docs/fork/historical-notes.md)。

## F050 聊天盖住终端时藏起 xterm 画布

原生聊天盖住终端时，给 `.xterm` 打上 `data-native-chat-covered`。`terminal.css` 把该终端里的 canvas 设成 `visibility: hidden` 和 `pointer-events: none`。盖层卸下后去掉属性。分屏里没被盖住的终端不动。画布仍占布局盒，不释放 WebGL backing。
