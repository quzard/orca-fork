# 杂项区域重做说明（fork/rework-misc）

基点：`fork/rework-20261101`（30373e420f）。上游基点 `upstream/main` 4365547899。本区域碰过的上游文件从 64 个、+1271/−94 行降到 36 个、+225/−23 行（其中 55 行是新加的 `ForkPermissionCard.swift`）；整棵上游树从 206 个文件、+3238/−514 降到 178 个、+2192/−443（含其他区域没动的部分）。下面各节写成可以直接替换 FORK-CHANGES 对应段落的样子。

## 审计表（AUDIT.md）

- 生成只有一条命令：`python3 fork/scripts/generate-audit.py`。它读 `src/fork/skills-source-commit.ts` 记录的上游基点，对工作区跑 `git diff --no-renames <基点>`，主表一行一个和基点不同的已跟踪文件（上游文件也算），一个不多一个不少；再经仓库里的 oxfmt 格式化后写入。`--check` 只比对，表过期时以 1 退出。需要 git、python3 和 `node_modules`（oxfmt）。
- 原因列默认写「fork 自有文件」「fork 新增文件（上游目录）」或「上游文件，fork 改动 N 行」。脚本里的 `REASONS` 只给少数行补一句说明；`HISTORY` 单列已恢复成上游或已删除的文件。补充说明指向的文件和基点相同、或者 `HISTORY` 里的文件又和基点不同时，脚本直接报错，不会悄悄留下过期条目。旧脚本按 PR #6 之前的提交算「shrink」，需要那几个老提交，已去掉；以前各轮写的 PR 备注不再沿用。
- `src/fork/audit-table.fork.test.ts` 自己用 git 重算文件集合（不信任生成器）：主表等于和基点不同的文件、决定都是 keep；`HISTORY` 里的文件仍和基点相同、删除的文件确实不存在；汇总数字对得上；最后跑一次 `--check`。
- 推送门：`fork/push_github.sh` 推送前先跑 `generate-audit.py --check`，再跑 fork 测试（`src/fork src/shared/fork-hooks`，含审计表测试），任何一项失败都不推送。推送的检出因此要有 `node_modules`。
- 每日同步：`daily-sync.sh` 在 install 之后跑生成器，表变了就提交 `docs(fork): regenerate the audit table`，之后的 fork 测试照常检查。上游合并移动了基点、或者 PR 带进来过期的表，都在这一步自动修好。
- 本分支已经重新生成过一次，只为让测试在本分支通过。各区域合并之后在 develop 上再跑一次 `python3 fork/scripts/generate-audit.py` 并提交。

## F050 聊天盖住终端时藏起 xterm 画布

原生聊天盖层是窗格（`.pane`）的直接子元素（`.native-chat-pane-shell`）。渲染进程登记时注入一张样式表（`src/fork/terminal/covered-terminal-canvas.tsx`）：含有这个盖层的窗格里，盖层之外的 `.xterm` 设 `pointer-events: none`，它里面所有 canvas 设 `visibility: hidden` 和 `pointer-events: none`。画布仍占布局盒，不释放 WebGL backing。盖层卸下后选择器自然不再命中；盖住之后才创建的画布（WebGL 挂上、context 丢失重建）、之后才 open 的 xterm 也都覆盖，不需要 MutationObserver。分屏里没被盖住的窗格、盖层自己内容里的元素不受影响。没有 document 的环境（node 下登记渲染模块的测试）什么都不做。

上游文件全部恢复：`use-covered-terminal-focus-handoff.ts`、两个盖层、`RetainedPaneHost.tsx`、`tab-group-body-anchor.ts`、`terminal.css` 以及两份上游测试。智能体会话盖层的分支删除：它和同组终端宿主都按 `group.activeTabId` 决定显示，会话标签激活时同组终端宿主一定是隐藏的（inert，display:none 或预热时 opacity 0），原来的代码从未打上任何标记。这是一个可以报给上游的 bug（macOS 把 WebGL 画布合成到 z-10 的 HTML 之上），fork 只保留一张样式表。测试：`src/fork/terminal/covered-terminal-canvas.fork.test.tsx` 用真实的 `NativeChatPaneCover`。

## F010 SSH 重连后重绘

行为不变。三个上游文件各只有一行调用：`reattach-grid-fit.ts` 保留上游的 `await fit.completion`，下一行 `notifyTerminalReconnectFit(session, ctx, ptyId, fit.completion)`；`session-reconcile-dispose.ts` 的可见恢复一行 `notifyTerminalPaneShown(session)`；`connect-pane-pty.ts` 在 `installPtyInputForward` 之后一行 `holdDesktopResizeDuringTuiRepaint(session)`。读当前载荷、停放模型、可见性和挡住同尺寸 fit 的逻辑都在 `src/shared/fork-hooks/terminal-lifecycle.ts`，未登记时是空操作。通知在 fit 完成后的下一个微任务里判断载荷是否仍是当前的。

## 应用内更新

- fork 构建（主进程、渲染进程、orcad 都登记 `registerForkBuild`）只用 `quzard/orca-fork` 的匿名公开 GitHub 源（`private: false`、没有 token、`allowPrerelease`）。以前「fork 构建但没登记更新源」的 skip 状态在运行更新器的桌面主进程里不会出现，`registerForkUpdateFeed`、菜单检查和后台调度里的拦截都已删除，`updater-menu-checks.ts`、`updater-scheduling.ts`、`updater-build-selection.ts` 回到上游（指定版本时 `resolveTargetBuild` 仍抛 `FORK_UPSTREAM_RELEASE_BLOCKED`，上游的 catch 显示这个错误）。
- 读取上游的地方各一个提前返回：changelog、nudge、atom（`fetchNewerReleaseTagsWithReadiness`）、版本列表、指定版本、agent 状态规则、WSL 主机策略；发行说明链接 `forkReleaseNotesUrl`。`forkGuardedReleaseDownloadUrl`（以及它放错位置的 JSDoc）随那个到不了的兜底一起删除。agent 状态规则和退出即装不再把上游表达式重新缩进：前者是 `const run` 之后的三行，后者是上游赋值之后一行 `||= forkInstallsOnQuit(this.updateInstallMode)`。
- 后台下载和 Squirrel 暂存的行为不变。`keepForkStagedUpdate`、`downloadForkBackgroundUpdate` 搬到 `src/fork/main/updater-background-class.ts` 的 `ForkBackgroundUpdates`（继承上游 `UpdaterDownloadInstall`，`UpdaterSetup` 改为继承它）；`updater-check-failure.ts` 只留一个抽象声明和三行调用。事件接线从 `src/main/updater-fork-background.ts` 搬到 `src/fork/main/updater-background-wiring.ts`。
- `src/fork/upstream-release-sources.fork.test.ts` 加强：也扫描 `src/fork`，只认代码里的 `isForkBuild()`（注释里的不算）。

## F038 macOS 本地文件密钥

`main-process-preflight.ts` 一行：`setSecretStore(registeredDesktopSecretStore() ?? new ElectronSecretStore())`。登记的工厂在打包后的 macOS、非隔离配置时返回 `MacosFileSecretStore`，同时把上游的 `guardedSafeStorage` 对象的三个方法路由到同一个文件密钥库（插件密钥、账号会话），否则返回 null，仍是上游的钥匙串。`safe-storage-availability.ts`、`electron-secret-store.ts` 回到上游；路由对象用 `satisfies typeof guardedSafeStorage`，上游以后加方法时类型检查失败。以前对 `safeStorageWithheldReason()` 的改写已删除：它只被 `ElectronSecretStore` 读，而文件密钥库生效时不安装它。

## F006 授权窗口可拖拽的应用卡片

卡片搬到 `native/computer-use-macos/Sources/OrcaComputerUseMacOS/ForkPermissionCard.swift`：上游 `DraggableAppTile` 的子类，整张卡片可拖、未激活窗口也能拖、只在缺权限时拖。`main.swift` 恢复上游的图标代码，只改三处：`DraggableAppTile` 去掉 `private final`（子类需要）、一行 `ForkPermissionCard.install(...)`、带参数时一行 `showWindow`。拖拽助手窗口里的卡片回到上游原样（以前 fork 的 acceptsFirstMouse/hitTest 也作用到它）。TS 侧一行 `helperArgs.push(...)`。本机 `swift build` 通过。

## F049 Ego Lite Cookie

主进程登记（桌面和 orcad 的 `register-main.ts`）把 Ego Lite 的定义追加进上游的 `CHROMIUM_BROWSERS`（已有同名 family 时不追加），上游的发现、切换配置、Windows/Linux 取密钥都直接读到它；`browser-cookie-detection(-types).ts`、`browser-cookie-key.ts` 回到上游。`BROWSER_FAMILY_LABELS['ego-lite']` 在登记时补（`??=`，上游以后有了就用上游的），`constants.ts` 不再有这一行。导入提示名单一行展开调用。上游 cookie 测试里多加的 `'ego-lite'` 已删除：那个测试不登记。

## F021 / F043 端口 Forward

行为不变。端口面板渲染一个 fork 对话框槽位，有 SSH 转发目标时发布一个打开函数；行的悬停按钮和右键菜单各渲染一个 fork 槽位读它。`local-port-section.tsx` 回到上游，`local-port-row.tsx` 三行、`local-workspace-ports-panel.tsx` 两行。

## SSH 状态名、界面中文

`src/fork/ssh/ssh-status-labels.tsx`、`ssh-status-keys.ts` 和测试删除（没有调用方），`sshConnectionStatus.*` 从 fork 的 en/zh 删除。状态行只剩两个 nowrap class。i18n 测试里的类型断言补了 SAFETY 说明。

## orcad

`orcad-entry.ts` 恢复上游的 `resolveOrcadBindHost` 和 `bindOrcadStopTerminalAdmission` 两行，只加一行 `installForkOrcadHost()`（在上游 host adapters 之前）和文件首行的 max-lines 豁免。`src/fork/main/orcad-serve-bind.ts` 删除。

## F041 普通目录的终端生命周期

`worktree-terminal-stop-targets.ts` 不再重新缩进上游表达式：上游那一行之后一行 `appendMissingTargetWorktree(resolvedWorktrees, worktree)`（`src/fork/main/folder-stop-target.ts`，用上游的 `includeTargetResolvedWorktree`）。`workspace-selectors.ts` 多出的一行注释删除。上游的睡眠路径已经这样做，只有 exact stop 漏了，可以报给上游。

## 登记入口

`src/main/index.ts`、`src/renderer/src/main.tsx` 各只有一个 import 和一个调用：`registerForkDesktopMain()`（`register-electron.ts`，依次登记共用、Electron、主进程，仍在 preflight 之前）和 `registerForkRenderer()`（先分组模式，再渲染槽）。

## 构建、发布、skill pin

- skill pin 搬到 `src/fork/skills-source-commit.ts`。上游渲染进程只用 `ORCA_BUILD_COMMIT` 拼 `npx skills add`，所以 `electron.vite.config.ts` 在渲染进程的 define 里多一行 `...forkRendererDefines()`，把它换成上游基点。删除的：`src/shared/fork-hooks/skill-source-commit.ts`、`agent-feature-install-commands.ts` 里的副作用 import 和调用、三个上游测试里的 `vi.mock`、tsconfig 里的三行 `src/cli/...`、打包后对 `out/cli/skills-source-commit.js` 的检查。`src/fork/skills-source-commit.fork.test.ts` 检查构建配置给出的值、渲染进程没有别的地方读这个 define、同步脚本能逐字节重写 pin 文件。`sync-skills-source-commit.mjs`、`daily-sync.sh`、`check-no-internal-refs.sh` 改用新路径。
- orcad 模板（F036）：`ORCA_ORCAD_TEMPLATE_TARGETS` 在上游 `verifyPackagedOrcadTemplate` 的默认参数里收窄，压缩、浏览器和模板脚本里的调用全部回到上游；签名排除一行 push。Mac 包要带的四个目标（`darwin-arm64`、`linux-x64-glibc`、`linux-arm64-glibc`、`linux-x64-glibc217`）在 `src/fork/packaging.cjs` 的 `LOCAL_TEMPLATE_TARGETS`，安装脚本在模板构建之后立即检查一次（缺 glibc 2.17 时在 electron-builder 之前就失败），打包后再检查一次。`templateTargetNames` 和 `--print-built-targets` 没有调用方，已删除。
- `package.json` 只剩版本号；`tsconfig-boundaries.mjs` 不再作为 `pnpm tc` 前置命令（tsc 自己报 TS6307），只在 fork 测试里跑。`vitest-node-runtime-files.mjs` 回到上游：SQLite 扫描本来就找到那两个 fork 测试。
- `.gitattributes` 回到上游。`merge=ours` 对 fork 不改的生成文件没有作用，对 RPC 参数目录则在上游每次改它时留下旧内容、让 `verify:rpc-params-catalog` 失败；去掉之后按文本合并。`daily-sync.sh` 也不再设置 `merge.ours.driver`。
- 沙箱 preload 的 Rolldown runtime 内联插件和测试从 `config/` 搬到 `src/fork/main/`。`build-mac-local.mjs` 的目标参数保持原样（electron-builder 没有按环境变量选架构的办法）。

## 需要同步改的文档（本分支没改）

- FORK-CHANGES：第 14 行「行数上限」里 `resolveOrcadServeBind` 一句删除；F002 第 23 行去掉 `out/cli/skills-source-commit.js`；F024 整段改成上面的 skill pin 说法；「界面中文」去掉 SSH 连接状态名；侧栏第 42 行 `ssh-status-labels.tsx` 一句删除；F050、F010、F038、F049、F021/F043、应用内更新按上面替换；登记入口一句改成两个入口函数。
- HOOKS.md：`skill-source-commit.ts`、`desktop-secret-store.ts`（不再有 guarded backend 登记）、`update-feed.ts`（没有 `registerForkUpdateFeed`/`forkReleaseFeedDecision`）、`chromium-cookie-browsers.ts`（只剩导入提示）、`terminal-lifecycle.ts`（调用点和新函数）、登记表里 `register-main.ts` 的 `resolveOrcadServeBind`。
- SYNC.md、DAILY.md、VERIFY.md、skill-update-flow.md、parity/build-skills.md：pin 路径、打包检查、`merge=ours` 和审计表步骤。

## 没有在本机验证的

- 不能启动应用窗口，F050、F006、F021/F043、F049、应用内更新都只有单元测试和 `swift build`。
- `src/fork/terminal/file-link-workspace-loader.fork.test.tsx` 的「reads a restored terminal link from the host workspace without reparenting」在基点 30373e420f 上就失败，属于 F046 区域。
