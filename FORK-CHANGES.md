# Fork 维护（develop）

集成分支是 `develop`（名字上和上游的 `main` 区分开）。它从上游 `17a2bced1115f064e834e397c2b949d9e150d275` 起，只加扩展点；之后每天把上游 `main` 合并进来，不再变基，也不强推。`fork/base` 保留为切到集成分支时的那个提交，每日任务不移动它。`fork/base-upstream` 仍是人工推上去的上游指针。行为登记在 `src/fork/`。未登记时上游行为保持不变。上游 main 的 `package.json` 仍是 `1.4.214`（稳定版号只在发布分支上改）。本 fork 写成 `1.4.228`，比已发布的 `1.4.227` 和本机正在用的 `1.4.224` 都新，本地构建不会被当成降级。

- 扩展点说明：[docs/fork/HOOKS.md](docs/fork/HOOKS.md)
- 逐文件审计（每个和上游不同的文件：功能、决定、原因）：[docs/fork/AUDIT.md](docs/fork/AUDIT.md)，由 `fork/scripts/generate-audit.py` 生成，`src/fork/audit-table.fork.test.ts` 检查它和仓库一致。
- 行为清单：[docs/fork/parity/ssh-import.md](docs/fork/parity/ssh-import.md)、[docs/fork/parity/build-skills.md](docs/fork/parity/build-skills.md)、[docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)、[docs/fork/parity/sidebar.md](docs/fork/parity/sidebar.md)
- 同步上游：[docs/fork/SYNC.md](docs/fork/SYNC.md)
- 每日云端变基和家里的 Mac 发布：[docs/fork/DAILY.md](docs/fork/DAILY.md)
- Linux 验收：[docs/fork/VERIFY.md](docs/fork/VERIFY.md)
- F024 停用说明：[docs/fork/skill-update-flow.md](docs/fork/skill-update-flow.md)
- 登记入口：`src/fork/register.ts`（主进程和界面都调用：fork 构建标记、skill 来源、host-directory、旧主机漏发的分组）、`src/fork/main/register-main.ts`（桌面主进程和 orcad）、`src/fork/main/register-electron.ts`（只在 Electron 主进程：更新源、文件密钥、权限助手参数）、`src/fork/register-renderer.tsx`（仅界面）
- 目录约定：只在主进程运行的 fork 代码放 `src/fork/main/`；引用渲染进程的 fork 代码用 `.tsx`；`*.fork.test.ts` 是 node 测试，渲染进程测试用 `.fork.test.tsx`。tsconfig 只按这三条通配，不再逐个列文件。`pnpm tc` 在 tsc 之前先跑 `src/fork/tsconfig-boundaries.mjs`，fork 文件引用了所在工程不包含的文件就失败。用到真实 SQLite 运行时存储的测试要写进 `config/scripts/vitest-node-runtime-files.mjs` 的 `NODE_RUNTIME_INCLUDE`。

## F002 macOS 本地安装

- 脚本：[fork/scripts/install-mac-release.sh](fork/scripts/install-mac-release.sh)。它只包一层上游发布命令，不再维护单独的 electron-builder 配置。
- 依赖安装是 `pnpm install --frozen-lockfile --cpu=arm64`，以及 mobile 的 `pnpm install --frozen-lockfile`。应用构建是 `pnpm run build:release`。本机 `darwin-arm64` 槽仍是 `pnpm build:orcad-prebuilds`、`--require-slots`、`--smoke`。Linux 槽由 [fork/scripts/build-orcad-linux-prebuilds.sh](fork/scripts/build-orcad-linux-prebuilds.sh) 按 `node-server-tests.yml` 的 manylinux 镜像编译：`linux-x64-glibc`、`linux-arm64-glibc`、`linux-x64-glibc217`。模板命令是 `node config/scripts/build-orcad-template.mjs --targets darwin-arm64,linux-x64-glibc,linux-arm64-glibc`。然后是文件监视隔离检查、`pinned-node-downloads.mjs darwin-arm64`、`ensure:electron-runtime`，最后 `node config/scripts/build-mac-local.mjs dmg:arm64 zip:arm64`。
- 只覆盖这些事。签名身份是 `Orca Local Signing`（`CSC_NAME` 和 `ORCA_COMPUTER_MACOS_SIGN_IDENTITY`，`CSC_IDENTITY_AUTO_DISCOVERY=false`）；钥匙串里没有该证书就停止。版本后缀由 `build-mac-local.mjs` 写入，脚本不自己算。Electron 包只打 arm64：`dmg:arm64 zip:arm64`。安装、备份和回退仍在这个脚本里。
- 这些 Mac 都是 Apple Silicon。x64 包的 afterPack 会在 Rosetta 下启动交互式 shell 做 PTY 检查，并超时。单独的 `--arm64` 去不掉配置里写死的 x64 目标；空的命令行目标列表会保留配置里的两个架构。`dmg:arm64 zip:arm64` 才是只打一个架构的上游参数。因此不会编 x64 Electron 包，也不会跑 x64 PTY 检查，也不下载 `darwin-x64` Node。`verify-packaged-daemon-entry` 本身不改。
- 不公证。`ORCA_MAC_RELEASE` 等保持 0。需要 Apple 密钥、GitHub 发布，以及 musl、win32、`darwin-x64` 这些本机编不了的槽，仍然跳过，原因写在 [docs/fork/SYNC.md](docs/fork/SYNC.md)。
- 打包后必须有 `Contents/Resources/orcad-template/orcad-template.json`，且 `targets` 含 `linux-x64-glibc`、`linux-arm64-glibc`、`linux-x64-glibc217`、`darwin-arm64`，以及 `app.asar.unpacked/out/cli/skills-source-commit.js`，并再跑一次上游的 CLI 闭包检查。
- `--fast` 跳过两次依赖安装；Linux 槽若已通过 `--require-slots` 也不重编。签名、模板和安装仍会做。`--cleanup-verified-backups <版本号>` 只清理 `/Applications/.orca-previous.*` 里已退出的旧应用。
- 静态资源签名排除通过 `extraMacSignIgnore` 进入现有 `mac.signIgnore`。不再写钥匙串 partition list；后台安装传递 `ORCA_BACKGROUND_LAUNCH=1`。

## 侧栏 host-directory

默认分组是「按执行主机，再按目录」。内置的 Project / Status / PR / None 不改。没有登记这个模式的测试里，缺省分组仍是 `repo`。

- 同一目录在两台主机上各成一块，不合并。组归属只认同一台主机。
- 不画仓库标题层，工作区直接出现在主机和项目组下面。
- 删除项目组只取消分组。上游「同时移除包含的项目」勾选还在；登记的附加项默认勾上时，这个标志被改成不移除。文件夹工作区留在列表里，变成未分组。
- 从 Orca 移除单个工作区只归档，不删目录、不删 git 分支。多主机归属不清时中止。顺序与上游删除一致：先在宿主上归档，成功后才停掉它的浏览器和终端；归档失败时终端保持运行。找不到所属仓库的孤立工作区先停再移出列表。
- 隐藏工作区可搜索、可恢复。选择器显示目录、分支、分组和路径。设置里的项目列表可以多选后移除，只从 Orca 注销，不删目录。
- 卡片左侧用淡色、从左侧截断的目录前缀。主机标题下不再重复主机名。项目组只有一个工作区、且仓库路径不在组的父目录下时，卡片去掉父目录前缀。
- 已保存的 `groupBy: repo` 在登记后读成 host-directory。未登记时 `repo` 仍是原来的项目标题。
- SSH 状态行上的主机类型和连接状态不换行。状态名由 `src/fork/ssh/ssh-status-labels.tsx` 翻译：`SshTargetCard` 的 `STATUS_LABELS` 保持上游的英文字面量，外面包一层 `withForkSshStatusLabels`，读取时翻译。中文来自 fork 的 zh 覆盖层（见下方「界面中文」），其他语言显示英文。参考实现已经去掉远程工作区同步冲突按钮，这里不把那套界面加回来。
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

fork 新增的界面文字（从 Orca 移除、已移除和隐藏的工作区、设置里批量移除项目、跨组拖放的提示、历史面板的索引状态、SSH 连接状态名、父目录导入提示、工作区右键菜单的“休眠”和“删除所选”）的英文在 `src/fork/i18n/en.json`，中文在 `src/fork/i18n/zh.json`。渲染进程登记时把两份分别合进 en 和 zh 语言包：只补缺少的键，上游已有的条目优先；其他语言经 i18next 的英文回退拿到英文。上游的 `en.json`、`en-runtime-required.json` 和 `zh.json` 都与上游一致，上游文件不翻译任何 fork 键。“仅取消分组”选项和“主机”分组模式在 `register-mode.ts`（不依赖界面的代码）里登记英文，渲染进程由 `src/fork/sidebar/mode-labels.tsx` 换成随语言变化的取值。删除 SSH 目标对话框里上游写死的 `Remove` / `Removing` 经钩子 `ssh-target-remove-labels.ts` 翻译成“删除”/“正在删除”。工作区右键菜单里上游写死的 `Sleep`、`Sleep N Workspace(s)`、`Delete Selected`、`Delete N Workspace(s)` 经钩子 `worktree-context-menu-labels.ts` 交给 `src/fork/sidebar/context-menu-labels.tsx` 翻译；没有登记时原样用上游的英文。fork 代码统一用 `src/fork/i18n/fork-translate.tsx` 的 `forkTranslate` 翻译，上游的提取检查（`config/i18next.config.ts`，与上游一致）只认 `translate` 等函数名，看不到 fork 键；fork 键由 `src/fork/i18n/fork-keys-catalog.fork.test.ts` 检查：fork 代码里每个字面量键都要有英文，且上游文件不引用 fork 键。测试还保证每个 fork 英文键都有中文，且占位符一致。

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

## F021 / F043 用 Cursor 或 VS Code 打开远端工作区

命令不是 VS Code 启动器时，可以返回 `cursor://vscode-remote/ssh-remote+...`，用 `shell.openExternal` 打开。SSH 主机名或别名放进 URL 前做百分号编码（`@` 保留），含空格、`/`、`?`、`#`、`%` 的别名不会截断 URL。Open in 多一行 Cursor；用户已经配置了 cursor 命令时不重复。直接 SSH，以及托管环境上仍存在的 `orcadDeployment.sshTargetId`，会启用 VS Code 系和 Cursor。文件管理器和解析不出的所有者仍然拒绝。没有手工的环境到 SSH 映射。

托管工作区的端口行在渲染进程登记后显示 Forward，打开已有的转发对话框并填上该端口。未登记时没有这个按钮。

## F022 软链目录上的 Cursor 会话

扫描前把作用域路径做 `realpath`。会话的 `cwd` 仍是恢复用的原路径；`cwdAliases` 只参与匹配、深度和归属。更长的工作区路径优先，避免父目录抢走子仓库的会话。会话记录的 cwd 换了一种软链写法（例如 macOS 的 `/var` 实际是 `/private/var`）或目录已经不在时，按 cwd 最深的现存上级做 `realpath` 后再匹配；每次扫描每个不同的 cwd 只查一次，只在有别名时才查。失效链接记一条 scope 问题，扫描继续。本机和 orcad 都登记这条策略（`src/fork/main/ai-vault/scope-aliases.ts`）。

## F041 普通目录的终端生命周期

`folder:<id>` 在 `resolveWorktreeSelector` 之前解析。没有这个文件夹时仍抛 `selector_not_found`。`stopExact` 把该结果放进存活刷新用的工作区列表，因为文件夹不在原来的 resolved map 里。

## 历史会话（已登记）

- 列表默认看所有主机。多台主机先有可折叠的主机行，下面是完整目录；只有一台主机时不重复主机行。新组默认收起，标题栏一次收起主机和目录。
- 全文搜索保持命中顺序。多台主机的命中在行上标出来源。索引状态默认收起，离线、读失败、索引未就绪或有细节行时展开。列表正在刷新时另写一行。逐主机最近成功扫描时间属于已移除的主机扫描缓存，不再显示。主机菜单把没有会话、不是当前主机、也没连上的远端收进「其他已配置主机」。
- 扫描进程的内存按本机内存计算，下限仍是 384 MiB。工具输出按块写入索引，索引版本 +1，旧的截断索引会重建。
- 启动时浏览器分区的代理改成后台应用，不再挡住第一个窗口。每个分区在排队时同步标成「代理未就绪」，请求守卫会扣住该分区的请求直到代理生效，失败则取消请求，所以不会有请求先走直连。`src/fork/main/startup/browser-session-proxy.fork.test.ts` 验证这一点。
- Mac 签名忽略 `/ai-vault/` 静态资源。
- 没有另做一份主机扫描缓存。Linux 上用合成会话量过：上游冷扫描已经能在一次扫描里给出列表，热扫描大约 10 毫秒；旧的 150 毫秒提前返回在冷扫描时是空列表。数字记在 [docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)。

## F024 Skill 安装来源（已放弃）

不再移植自定义仓库。skills 仍从 `https://github.com/stablyai/orca` 安装，内容与上游相同。fork 构建不能把本次构建提交当作 clone ref：该提交不在上游，`npx skills add` 会报 Failed to clone repository。

安装、更新和 CLI 用的 ref 是上游基线提交，只写在 `src/cli/skills-source-commit.ts` 一处。它随 `out/cli/**` 打进包供 CLI 使用；桌面主进程和渲染进程的登记（`src/fork/register.ts`、`src/fork/main/register-main.ts`、`agent-feature-install-commands.ts`）引用同一个文件。生产 CLI 代码不引用 `src/fork`。同步后运行 `node fork/scripts/sync-skills-source-commit.mjs` 重写这个文件：先 `git merge-base HEAD fork/base-upstream`（再 `origin/fork/base-upstream`）；没有该引用就用 `git merge-base HEAD upstream/main`（再 `origin/upstream/main`），不用上游 main 的最新提交；都没有就保留已写入的值。上游里断言构建提交地址的测试只 mock 掉这次登记、保持上游原样，pin 本身由 `src/fork/skills-source-commit.fork.test.ts` 和 `skills-source-commit-renderer.fork.test.tsx` 检查；本机没有任何上游引用时，前者跳过并在用例名里写明原因。`src/shared/agent-feature-install-commands.ts` 与上游一致，没有 skill 仓库钩子，也没有 `ORCA_FORK_SKILLS_SOURCE`。

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

`fork/scripts/verify/check-commit-identity.sh [REF]`（默认 `HEAD`）检查 `git rev-list REF ^upstream/main ^下限` 里的每个提交，合并提交也算：作者和提交者都必须正好是 `quzard <30899719+quzard@users.noreply.github.com>`，否则列出不合规的 SHA 并失败。没有 `upstream/main` 引用时直接失败，不退回别的基点。下限 `8fd7c96acc934cb25e41b5da17f1743e88219bbe`（develop 的 8fd7c96acc）写死在脚本里，不从任何文件读：以前的 `fork/scripts/verify/identity-baseline` 从被检查引用自己的树里读，后面的提交可以把它挪过一个坏提交，从而跳过检查，现在这个文件已删除，提交改不了下限。仓库里没有这个提交，或它不是被检查引用的祖先，都直接失败。下限之前的提交已经公开，加检查时查过，没有个人邮箱（其中 20 个是 2026-10-16/17 的 `Cursor Agent <cursoragent@cursor.com>`，无法改写）。不要改这个下限。`check-no-internal-refs.sh` 扫完内容后接着跑它（`ORCA_IDENTITY_REF` 可指定引用）；`daily-sync.sh` 在推 attempt 分支和 `develop` 之前各跑一次，它自己的合并、pin 和冲突提交由脚本设置成这个身份（`GIT_AUTHOR_*` / `GIT_COMMITTER_*`），机器上不用配置；`fork/push_github.sh` 推送前跑；`mac-auto-update.sh` 发布 release 前对要发布的提交跑。这两处和 `run-linux-verify.sh` 在检查前先用 `fork/scripts/verify/fetch-upstream-main.sh` 拉最新的上游 main（`upstream` 远端，没有时用 daily-sync 添加的同一个地址），拉取失败就不推送、不发布；daily-sync 本来就在合并前拉过。拉取有超时：默认 600 秒（Mac 上一次拉取用了约 6 分钟），用 `ORCA_UPSTREAM_FETCH_TIMEOUT` 改；超时后杀掉 fetch（先 TERM，5 秒后 KILL，连同它的子进程），以非零退出，调用方按拉取失败处理。不依赖 GNU `timeout`，macOS 自带的 bash 3.2 也能用；另外设了 git 的 `http.lowSpeedLimit` / `http.lowSpeedTime`，传输停滞 120 秒也会中止。测试是 `fork/scripts/check-commit-identity.test.sh`（含评审复现的“挪基线跳过坏提交”现在失败，以及假的卡住拉取被超时杀掉）。

## 根目录杂项

`push_github.sh` 在 [fork/push_github.sh](fork/push_github.sh)。主机、仓库路径、GitHub 地址和分支都要由环境变量给出，没有内置默认值。示例路径是 `/srv/wt/project`。

早期方案和评审笔记没有入库，见 [docs/fork/historical-notes.md](docs/fork/historical-notes.md)。
