# F024 已停用，技能走上游

本 fork 不改技能安装来源，不改 `skills/`、`skill-guides/`、`skill-stubs/`，也不在应用升级时自动刷新已安装技能。

安装命令与上游同一个仓库：`https://github.com/stablyai/orca`。ref 是上游基线提交，不是本次 fork 构建提交：fork 的提交不在上游仓库，`npx skills add` 会报 Failed to clone repository。上游只有渲染进程拼 `npx skills add`（`src/renderer/src/lib/agent-feature-install-commands.ts`，读构建常量 `ORCA_BUILD_COMMIT`），安装和更新是同一条命令（`add` 会重新拷贝），由用户从上游的界面发起。fork 在 `electron.vite.config.ts` 的渲染进程 define 里多一行 `...forkRendererDefines()`，把这个常量换成 `src/fork/skills-source-commit.ts` 记录的上游基线提交；每次同步后由 `node fork/scripts/sync-skills-source-commit.mjs` 重写。上游 CLI 拷贝内置技能文件，不按提交克隆，不需要 pin。没有版本戳，也没有启动时自动更新。

## 为什么不再改 SSH 技能说明

`skill-stubs/_shared/cli-resolution.md` 已经规定：环境变量 `ORCA_CLI_COMMAND` 有值就用它。上游会在 SSH 受管主机的终端和子进程里导出这个变量，指向该主机用户数据目录下的 CLI。未设置 `XDG_DATA_HOME` 时，这条路径是 `~/.orca/cli/bin/orca`。

依据：

- `src/main/orcad/orcad-app-paths.ts` 的 `resolveUserDataPath()`：没有 `XDG_DATA_HOME` 时用 `~/.orca`。
- `src/main/orcad/orcad-cli-launcher.ts` 的 `prepareOrcadCliLauncher()` 把启动脚本写到 `<userData>/cli/bin/orca`。
- `src/main/orcad/orcad-host-adapters.ts` 把该路径交给 `getCliLauncherPath`。
- `src/main/cli/orca-cli-child-path.ts` 的 `prependOrcaCliDirToChildPath()` 在拿到这个路径后写入 `ORCA_CLI_COMMAND`。
- `src/main/ipc/pty/host-env/assembly.ts` 的 `buildPtyHostEnv()` 给终端调用上面的函数。SSH 主机上的 orcad 走同一条终端环境。
- `src/main/runtime/structured-session-child-env.ts` 的 `applyThisAppCli()` 给结构化会话的子进程写入同一个变量。

因此不需要再改技能 stub 里的 CLI 解析段。
