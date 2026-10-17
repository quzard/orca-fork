# Fork 维护（fork/base）

本分支从上游 `17a2bced1115f064e834e397c2b949d9e150d275` 起，只加扩展点。行为登记在 `src/fork/`。未登记时上游行为保持不变。上游 main 的 `package.json` 仍是 `1.4.214`（稳定版号只在发布分支上改）。本 fork 写成 `1.4.228`，比已发布的 `1.4.227` 和本机正在用的 `1.4.224` 都新，本地构建不会被当成降级。

- 扩展点说明：[docs/fork/HOOKS.md](docs/fork/HOOKS.md)
- 行为清单：[docs/fork/parity/ssh-import.md](docs/fork/parity/ssh-import.md)、[docs/fork/parity/build-skills.md](docs/fork/parity/build-skills.md)、[docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)、[docs/fork/parity/sidebar.md](docs/fork/parity/sidebar.md)
- 同步上游：[docs/fork/SYNC.md](docs/fork/SYNC.md)
- Linux 验收：[docs/fork/VERIFY.md](docs/fork/VERIFY.md)
- F024 停用说明：[docs/fork/skill-update-flow.md](docs/fork/skill-update-flow.md)
- 登记入口：`src/fork/register.ts`（两边都会调用，登记 host-directory）、`src/fork/register-main.ts`（桌面主进程和 orcad）、`src/fork/register-renderer.tsx`（仅界面）

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
- 从 Orca 移除单个工作区只归档，不删目录、不删 git 分支。多主机归属不清时中止。
- 隐藏工作区可搜索、可恢复。选择器显示目录、分支、分组和路径。设置里的项目列表可以多选后移除，只从 Orca 注销，不删目录。
- 卡片左侧用淡色、从左侧截断的目录前缀。主机标题下不再重复主机名。项目组只有一个工作区、且仓库路径不在组的父目录下时，卡片去掉父目录前缀。
- 已保存的 `groupBy: repo` 在登记后读成 host-directory。未登记时 `repo` 仍是原来的项目标题。
- SSH 状态行上的主机类型和连接状态不换行，状态名走翻译。参考实现已经去掉远程工作区同步冲突按钮，这里不把那套界面加回来。
- 旧远端刷新如果省略 `sidebarGroupId`，本机保留原来的分组。显式 `null` 仍表示取消分组。
- 组内排序：smart 保持传入顺序，其他模式在组内重排。拖到另一台主机被拒绝。
- 创建弹窗从分组打开时，主机和分组就是该组。从侧栏空白创建时，主机和分组取当前工作区。状态看板和指定仓库的创建不改。新建的 git 工作区在完成后写入这个分组。

## F003 / F025 批量导入

交接阶段把选中路径写入 `importedExternalWorktreePaths` 和 `externalWorktreeInboxBaselinePaths`。运行时导入登记了 git 根解析时，用解析出的工作区根代替扫描路径；根和工作区自己的检出相同则不写入。桌面进程不对 SSH 路径做本地 git 解析。

父目录不是 git 仓库、且至少有一个子项导入成功或原本就存在时，才添加父文件夹。同主机同路径已有文件夹则复用并取消归档；新建时用 `createFolderWorkspace` 放进父路径对应的分组。宿主接口不能把已有文件夹改到另一个分组。添加父目录失败只提示，不撤销已导入的子仓库。不自动打开，也不为此启动代理。直接 SSH、没有托管环境时，子项导入在本进程全部失败，父目录因此不会创建。这和当前参考实现一致：桌面导入遇到 `connectionId` 直接记失败，父目录块只在成功数大于 0 时运行，远端创建只走选中的托管环境。

## F006 授权窗口可拖拽的应用卡片

仅 macOS。授权窗口用可拖拽的应用卡片替换静态图标，整张卡片接收拖拽，未激活窗口也能拖出。Linux 只核对 Swift 源码。拖进系统设置需要在 Mac 上做。

## F007 目录软链可选

上游现在的 SSH 列表在 `ls -1A` 之后用 `[ -d ]` 给目录和目录软链加一个 `/`，失效链接仍是文件。受管服务浏览先对软链做 `stat`。未登记时这两条保持上游原样。登记后可以换掉 `cd` 之后的 POSIX 后半段，也可以再改浏览条目；已标成目录的软链不会被第二次改写。Windows SSH 列表不改。

## F010 SSH 重连后重绘

重连 fit 对 `ssh:` 终端先把列数减 1，200ms 后恢复这次记下的尺寸。随后的同尺寸 fit 在脉冲期间被挡住。`remote:` 终端和列数小于等于 2 时不脉冲。从停放模型恢复的完整画面不脉冲。面板当时不可见时先记下，第一次显示再用当时的尺寸脉冲，之后的显示不再补。

## F021 / F043 用 Cursor 或 VS Code 打开远端工作区

命令不是 VS Code 启动器时，可以返回 `cursor://vscode-remote/ssh-remote+...`，用 `shell.openExternal` 打开。Open in 多一行 Cursor；用户已经配置了 cursor 命令时不重复。直接 SSH，以及托管环境上仍存在的 `orcadDeployment.sshTargetId`，会启用 VS Code 系和 Cursor。文件管理器和解析不出的所有者仍然拒绝。没有手工的环境到 SSH 映射。

托管工作区的端口行在渲染进程登记后显示 Forward，打开已有的转发对话框并填上该端口。未登记时没有这个按钮。

## F022 软链目录上的 Cursor 会话

扫描前把作用域路径做 `realpath`。会话的 `cwd` 仍是恢复用的原路径；`cwdAliases` 只参与匹配、深度和归属。更长的工作区路径优先，避免父目录抢走子仓库的会话。失效链接记一条 scope 问题，扫描继续。本机和 orcad 都登记这条策略。SSH 分支上另有一份别名扫描文件，不登记，避免盖掉上面这条。

## F041 普通目录的终端生命周期

`folder:<id>` 在 `resolveWorktreeSelector` 之前解析。没有这个文件夹时仍抛 `selector_not_found`。`stopExact` 把该结果放进存活刷新用的工作区列表，因为文件夹不在原来的 resolved map 里。

## 历史会话（已登记）

- 列表默认看所有主机。多台主机先有可折叠的主机行，下面是完整目录；只有一台主机时不重复主机行。新组默认收起，标题栏一次收起主机和目录。
- 全文搜索保持命中顺序。多台主机的命中在行上标出来源。索引状态默认收起，离线、读失败、索引未就绪或有细节行时展开。列表正在刷新时另写一行。逐主机最近成功扫描时间属于已移除的主机扫描缓存，不再显示。主机菜单把没有会话、不是当前主机、也没连上的远端收进「其他已配置主机」。
- 扫描进程的内存按本机内存计算，下限仍是 384 MiB。工具输出按块写入索引，索引版本 +1，旧的截断索引会重建。
- 启动时浏览器分区的代理改成后台应用，不再挡住第一个窗口。
- Mac 签名忽略 `/ai-vault/` 静态资源。
- 没有另做一份主机扫描缓存。Linux 上用合成会话量过：上游冷扫描已经能在一次扫描里给出列表，热扫描大约 10 毫秒；旧的 150 毫秒提前返回在冷扫描时是空列表。数字记在 [docs/fork/parity/ai-vault.md](docs/fork/parity/ai-vault.md)。

## F024 Skill 安装来源（已放弃）

不再移植自定义仓库。skills 仍从 `https://github.com/stablyai/orca` 安装，内容与上游相同。fork 构建不能把本次构建提交当作 clone ref：该提交不在上游，`npx skills add` 会报 Failed to clone repository。

安装、更新和 CLI 用的 ref 是上游基线提交（当前 `17a2bced1115f064e834e397c2b949d9e150d275`）。同一份模块写在两处：`src/cli/skills-source-commit.ts` 随 `out/cli/**` 打进包，供 CLI 使用；`src/fork/skills-source-commit.ts` 登记桌面和渲染进程。`src/cli/index.ts` 不引用 `src/fork`。同步后运行 `node fork/scripts/sync-skills-source-commit.mjs` 重写这两个文件：先 `merge-base` `fork/base-upstream`，没有该引用就用 `upstream/main`，再没有就保留已写入的值。`src/shared/agent-feature-install-commands.ts` 与上游一致，没有 skill 仓库钩子，也没有 `ORCA_FORK_SKILLS_SOURCE`。

## F036 本机 orcad 模板目标

`ORCA_ORCAD_TEMPLATE_TARGETS`（逗号分隔）设置时，打包清单校验收窄到该子集。未设置则仍要求全部目标，发布 CI 行为不变。安装脚本把它设成 `darwin-arm64,linux-x64-glibc,linux-arm64-glibc`，并设置 `ORCA_REQUIRE_ORCAD_TEMPLATE=1`。`linux-x64-glibc217` 不写进这个变量：模板脚本在基座槽 `linux-x64-glibc` 已请求且预编译存在时自动放进清单，上游校验又会把清单里的兼容槽加进期望集合，写两次会对不上。打包后的检查另外要求这四个名字都在 `targets` 里。不能改用上游发布的 orcad 模板：`orcad.js` 打包的是 `src/main/orcad/main.ts`，它引入 `orcad-entry.ts` 并调用 `registerForkMainModules`。musl、win32、`darwin-x64` 仍不在本地包里；Apple Silicon 编不出 `darwin-x64`。SSH 到未编进模板的主机仍会失败。

## F038 macOS 本地文件密钥

仅打包后的 macOS、且不是隔离配置时，桌面 `SecretStore` 换成 `MacosFileSecretStore`。32 字节随机密钥，AES-256-GCM，密钥在 `~/.orca/secrets/macos-key-v1`，目录 0700、文件 0600。并发首次启动用排他硬链接，只保留先发布的密钥。密钥缺失或损坏会报错，不回退明文。插件和账号会话走同一个 `guardedSafeStorage` 后端。开发、Windows、Linux、SSH orcad 仍走各自原来的存储。

## F040 自用发布

- 入口：[fork/scripts/release-personal-orca.mjs](fork/scripts/release-personal-orca.mjs)
- 本机任务检查：[fork/scripts/personal-orca-host.py](fork/scripts/personal-orca-host.py)（只保留 `local check`）
- 发布分支由 `ORCA_FORK_RELEASE_BRANCH` 指定。未设置就停止。先推送，再确认已包含 `upstream/main`，不自动提交。有存活终端或不可确认任务时停止。
- 构建交给安装脚本：上游发布步骤、`darwin-arm64` 与 Linux glibc orcad 槽、`dist/mac-arm64/Orca.app`。安装、ready 验收、清理旧应用，失败时按本批备份回退。
- 构建期间工作区出现任何脏路径都阻止安装。

## 内部标识

本 fork 新增的文档、脚本和 `src/fork` 不得写入雇主或内部环境的名称、地址、主机和数量。检查是 `fork/scripts/verify/check-no-internal-refs.sh`。具体模式放在未入库的 `fork/scripts/verify/internal-ref-patterns.local`，或环境变量 `ORCA_INTERNAL_REF_PATTERNS`。

## 根目录杂项

`push_github.sh` 在 [fork/push_github.sh](fork/push_github.sh)。主机、仓库路径、GitHub 地址和分支都要由环境变量给出，没有内置默认值。示例路径是 `/srv/wt/project`。

早期方案和评审笔记没有入库，见 [docs/fork/historical-notes.md](docs/fork/historical-notes.md)。
