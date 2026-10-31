# 历史会话（rework-aiv）

分支 `fork/rework-aiv`。下面写成可以直接替换进 `FORK-CHANGES.md`、`docs/fork/HOOKS.md`、`docs/fork/parity/ai-vault.md` 的文字；`docs/fork/AUDIT.md` 要用 `fork/scripts/generate-audit.py` 重新生成，需要改的行列在最后。

## FORK-CHANGES.md

### 开头「行数上限」一条

删掉 AiVault 面板那半句（从「AiVault 面板已在 400 行」到「经面板已有的 fork import 引入。」）。`useAiVaultResumeTargetState` 和 `useSearchHostLabels` 已退回上游面板里原样的写法，面板加上 fork 的钩子行后是 391 行，没到上限，也不需要 `max-lines` 豁免。

### 删除「F022 软链目录上的 Cursor 会话」整节

上游 #35052（`matchAiVaultSessionCwdCandidates`）在 `resolveWorktreeInfoFromCandidates` 里也按 `cwdAliases` 的最短剩余路径排序，fork 唯一还不同的地方被覆盖了。`src/shared/ai-vault-session-worktree.ts` 恢复为上游，`src/shared/fork-hooks/ai-vault-cwd.ts` 删除。

### 替换「历史会话（已登记）」整节

## 历史会话（已登记）

- 列表默认看所有主机。多台主机先有可折叠的主机行，行名用主机菜单里的名字（托管 orcad 服务器显示保存时起的名字，不是环境 id），行上的数字是这台主机的会话数；下面是完整目录，长目录换行。只有一台主机时不重复主机行。
- 侧栏里新出现的主机行和目录默认收起，展开过的在渲染进程重载前一直记得。`/resume` 打开的会话历史对话框保持上游的展开状态：每次打开都是新面板，键盘只在看得见的会话行之间移动。标题栏的按钮一次收起主机和目录，只作用于它所在的面板。
- 上游面板的折叠集合和切换都不改。fork 只记一份「这个分组的折叠含义是否反过来」，显示时与上游集合做异或，所以不需要往上游的过渡状态里加写入口，也没有跨面板的全局变量。目录分组的键总带着主机，所以第二台主机的会话到了、或只选一台主机时，展开过的目录仍是展开的。上游集合满 512 条时丢掉最早的键；侧栏里它记的多是展开过的分组，所以切换超过 512 个分组后最早展开的那个会重新收起。
- 全文搜索保持命中顺序。多台主机的命中在行上标出来源，由上游 #31261 提供（环境名和 i18n 提示）。索引状态只在上游的设置「智能体会话搜索」页里看。
- 主机菜单把没有会话、不是当前工作区所在、没连上、也不是当前选中的主机收进「其他已配置主机」。「有会话」包括这个窗口里此前列出过会话的主机，选中某一台主机后其他有会话的主机不会跳进子菜单；从子菜单选中的主机移到主列表，按钮上仍是保存时起的名字。「连上」看托管/配对的运行时服务器的连接状态；上游菜单只列当前工作区的 SSH 主机，原来按 SSH 连接判断的那条已经不起作用。上游菜单那行 `hostOptions.map(` 不改（改了会让上游的 host-list-render 计数检查失败，develop 上一直是失败的），主列表之外的主机经 `otherVaultHosts` 交给子菜单。
- 原来面板顶部的「正在扫描历史…」和「N 台主机」删掉了：扫描中有上游刷新按钮的转圈和「Scanning sessions」，主机数从主机行就能看出来。
- `src/fork/ai-vault/agents-panel-empty-profile.fork.test.tsx` 用空配置渲染整个「Agents」面板，检查不会报 React #185（Maximum update depth exceeded）：fork 代码以前在 zustand 选择器里每次新建数组，`useSyncExternalStore` 一直重渲染，右侧栏崩溃。`agents-panel-multi-host.fork.test.tsx` 用本机加几台托管的 Linux 服务器渲染同一个面板（主机行、折叠、全部收起、主机菜单和选中单台主机后的菜单），钩子行被合并冲掉时会失败。
- 扫描进程的内存按本机内存计算，下限仍是 384 MiB。工具输出按块写入索引，索引版本在上游之上 +1，旧的截断索引会重建。
- 启动时浏览器分区的代理改成后台应用，不再挡住第一个窗口。每个分区在排队时同步标成「代理未就绪」，请求守卫会扣住该分区的请求直到代理生效，失败则取消请求，所以不会有请求先走直连。上游的 try/catch 保留，只把等待的那一行换成 `deferStartupProxyWait(...)`。`src/fork/main/startup/browser-session-proxy.fork.test.ts` 验证这一点。
- 不再有 Mac 签名对 `/ai-vault/` 的排除：包里没有这样的路径，这条只会在上游以后放进同名目录时悄悄跳过签名。
- 没有另做一份主机扫描缓存。Linux 上用合成会话量过：上游冷扫描已经能在一次扫描里给出列表，热扫描大约 10 毫秒；旧的 150 毫秒提前返回在冷扫描时是空列表。数字记在 [docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)。

## docs/fork/HOOKS.md

- 登记表 `src/fork/register-renderer.tsx` 一行：「AI Vault slots」改成「AI Vault list presentation and default host」。
- `ai-vault.ts` 一行：调用方改为 `src/main/ai-vault/session-scanner-service-spawn.ts`、`session-scanner-service-protocol.ts`、`src/main/ai-vault-search/session-search-message-rows.ts`、`session-search-schema.ts`、`src/shared/ai-vault-session-filters.ts`、`src/renderer/src/components/right-sidebar/ai-vault-host-scope.ts`；内容是「Service heap and the service policy passed in the service init (`fork?`, omitted when nothing is registered), tool-output chunk index and schema version, folder labels, default host scope.」面板插槽、分组、折叠、标题换行、分组计数和主机菜单装饰都不再经过这个登记表。
- 删除 `ai-vault-cwd.ts` 一行。
- `startup.ts` 一行：「`src/main/startup/main-process-ready-foundation.ts` awaits `deferStartupProxyWait` from `src/fork/main/startup/browser-session-proxy.ts` inside upstream's try/catch; unregistered it is the write itself.」
- 「Upstream files that call fork code directly」一段：
  - `src/renderer/src/components/right-sidebar/AiVaultPanel.tsx` 改为「(`src/fork/ai-vault/panel-hooks.tsx`: `useForkVaultHostMenu` for the host menu, `useForkAiVaultGroups` for host rows, collapsed groups and the collapse-all button passed as `headerAction`; both return their input until `registerAiVaultListPresentation` runs)」，去掉「moved here only because AiVaultPanel.tsx is at the line limit」那半句。
  - `AiVaultPanelControls.tsx` 改为「(`src/fork/ai-vault/panel-controls.tsx`: `VaultGroupHeader` returns `ForkVaultGroupHeader` once registered; the host menu appends `forkOtherVaultHostsMenu`, the hosts `useForkVaultHostMenu` left out of the list it passed)」。
  - `src/main/ai-vault/session-scanner-service-entry.ts`（applies the service policy）和 `main-process-ready-foundation.ts` 保留。

## docs/fork/parity/ai-vault.md

「界面」一节换成：

- 主机菜单默认是“所有主机”。
- 同一目录下不同主机分成两组。多台主机时先有可折叠的主机行（名字取自主机菜单，带会话数），下面是该主机的完整目录；目录标题换行，不再只留最后两段。只有一台主机时不重复主机行。
- 侧栏里新出现的主机行和目录默认收起；`/resume` 的对话框保持上游的展开。标题栏的按钮一次收起本面板的主机和目录。
- 全文搜索保持原来的命中顺序，不按主机重新分组。多台主机的命中在行上标出来源，由上游 #31261 提供（环境名和 i18n 提示）。
- 面板里不显示索引状态和主机数量，也没有单独的扫描提示，和上游一样。没有会话、不是当前工作区所在、也没连上的主机收在「其他已配置主机」里。
- 工作区归属用上游的别名匹配（#35052），fork 不再改。

「扫描进程」一节：「索引版本从 6 加到 7」改成「索引版本在上游之上 +1（上游现在是 8，fork 是 9）」；「Mac 打包签名忽略 `/ai-vault/`」一条删掉。

## docs/fork/AUDIT.md（重新生成）

- 已删除（decision `delete`）：`src/fork/ai-vault/packaging.fork.test.ts`、`panel-slots.tsx`、`panel-status.ts`、`use-list-presentation.tsx`、`use-list-presentation.fork.test.tsx`、`src/renderer/src/components/right-sidebar/fork-ai-vault-slot.tsx`、`ai-vault-host-scope-fork.test.ts`（移到 `src/fork/ai-vault/host-scope-default.fork.test.tsx`）、`src/shared/fork-hooks/ai-vault-cwd.ts`。
- 新增（`keep`，fork 自有文件）：`src/fork/ai-vault/panel-hooks.tsx`、`panel-hooks.fork.test.tsx`、`panel-controls.tsx`、`agents-panel-multi-host.fork.test.tsx`、`host-scope-default.fork.test.tsx`。
- 恢复为上游（`revert-to-upstream`）：`src/shared/ai-vault-session-worktree.ts`、`src/renderer/src/components/right-sidebar/AiVaultPanelHeader.tsx`、`ai-vault-panel-transient-state.ts`。
- 变小（`shrink`）：`AiVaultPanelControls.tsx`（48→9 行）、`main-process-ready-foundation.ts`（11→3）、`session-search-message-rows.ts`（8→3）、`session-scanner-service-entry.ts`（4→2）、`session-scanner-service-protocol.ts`（3→2）、`session-scanner-service-spawn.ts`（6→4）、`ai-vault-host-scope.ts`（5→2）。`AiVaultPanel.tsx` 重新接上，11 行（合并前 58 行）。
