#!/usr/bin/env python3
"""Regenerate docs/fork/AUDIT.md: one row per file that differs from the upstream base.

Usage: python3 fork/scripts/generate-audit.py [REV]   (REV defaults to HEAD; --index uses staged files)
The upstream base is the commit src/cli/skills-source-commit.ts pins (the daily sync moves it
to each merged upstream). Needs that base, b7755e6357 (develop before PR #6), its upstream base
1b3113de8e, and 8fd7c96acc (before PR #7) in the clone. Decisions and reasons below are hand-written; rows with no entry get a
generic reason from the file's location. Rerun after changing fork files and commit the result.
"""
import os,subprocess,re,sys,collections
R=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REV=sys.argv[1] if len(sys.argv)>1 else 'HEAD'
def g(*a): return subprocess.run(['git','-C',R,*a],capture_output=True,text=True).stdout
PRD0='b7755e6357'; PRD0_UP='1b3113de8e'; BASE='8fd7c96acc'
def against(rev):
    return [UP,'--cached'] if rev=='--index' else [UP,rev]
def blob(rev,f):
    return f':{f}' if rev=='--index' else f'{rev}:{f}'
UP=re.search(r"FORK_SKILLS_SOURCE_COMMIT = '([0-9a-f]{40})'",g('show',blob(REV,'src/cli/skills-source-commit.ts'))).group(1)[:10]
def nlines_prd0(f):
    # PR #6 之前的 develop 对它自己的上游基点（不是现在的基点），否则合并进来的上游改动会算成 fork 改动。
    d=g('diff',PRD0_UP,PRD0,'--',f); return sum(1 for l in d.splitlines() if l[:1] in '+-' and l[:3] not in ('+++','---'))
def nlines(rev,f):
    d=g('diff',*against(rev),'--',f); return sum(1 for l in d.splitlines() if l[:1] in '+-' and l[:3] not in ('+++','---'))
st=[l.split('\t') for l in g('diff','--name-status',*against(REV)).splitlines()]
FORKROOT=re.compile(r'^(src/fork/|fork/|docs/fork/|src/shared/fork-hooks/|FORK-CHANGES\.md)')
FEAT=[('ssh-html-preview','F046 终端文件链接'),('html-preview-open','F046 终端文件链接'),('terminal-html-preview','F046 终端文件链接'),('doc-preview-file-reader','F046 终端文件链接'),('doc-preview-grant','F046 终端文件链接'),('doc-preview-api','F046 终端文件链接'),('doc-preview-grants','F046 终端文件链接'),('durable-workspace-archive','F048 删除工作区'),('workspace-durable-archive','F048 删除工作区'),('reused-path','F048 删除工作区'),('provisioned-root-checkout','F048 删除工作区'),('workspace-folder-delete','F048 删除工作区'),('workspace-terminal-ssh-placeholders','F048 删除工作区'),('workspace-terminal-placeholders','F048 删除工作区'),('known-ssh-worktree-fetch','F048 删除工作区'),('project-group','SB 侧栏/项目组'),('open-in','OPEN 打开方式'),('editor-launch','OPEN 打开方式'),('post-import','F003/F025 批量导入'),('composer','SB 新建工作区'),('quick-creation','SB 新建工作区'),('computer-use','F006 权限窗口'),('main.swift','F006 权限窗口'),('ai-vault','AIV 历史会话'),('AiVault','AIV 历史会话'),('session-scanner','AIV 历史会话'),
('ssh','SSH 状态'),('Ssh','SSH 状态'),('i18n','I18N 界面中文'),('skill','SKL 技能 pin'),('Skill','SKL 技能 pin'),
('sidebar','SB 侧栏'),('Sidebar','SB 侧栏'),('worktree','SB 侧栏/工作区'),('Worktree','SB 侧栏/工作区'),('file-link-nested','F046 终端文件链接'),('file-link-workspace','F046 终端文件链接'),('file-link-stay','F046 终端文件链接'),('file-link-route','F046 终端文件链接'),('file-link-disowned','F046 终端文件链接'),('git-workspace','F047 工作区仓库'),('source-control','F047 工作区仓库'),('workspace-repository','F047 工作区仓库'),('workspace','SB 侧栏/工作区'),('Workspace','SB 侧栏/工作区'),('repo','SB 侧栏/工作区'),
('mac-auto-update','F040 Mac 构建发布'),('mac-release','F040 Mac 构建发布'),('publish-','F040 Mac 构建发布'),('install-mac','F040 Mac 构建发布'),('updater','UPD 应用内更新'),('update','UPD 应用内更新'),('disowned-host-file','F046 终端文件链接'),('terminal-path-resolver','F046 终端文件链接'),('file-grants.ts','F046 终端文件链接'),('terminal','TERM 终端'),('Terminal','TERM 终端'),('safe-storage','F038 密钥存储'),('secret','F038 密钥存储'),
('mac-','F040 Mac 构建发布'),('publish','F040 Mac 构建发布'),('install','F040 Mac 构建发布'),('release','F040 Mac 构建发布'),('daily-sync','F040 每日同步'),('sync','F040 每日同步'),
('node-runtime','F040 Node 运行时'),('packaging','F040 Mac 构建发布'),('electron-builder','F040 Mac 构建发布'),('directory-browse','F007（已移除，守护测试）')]
def feat(f):
    for k,v in FEAT:
        if k in f: return v
    return 'INFRA 登记/工程/文档'
OVR={
'native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift':('keep','F006 拖拽卡片；PR E：带参数时三种状态卡片同一位置，切换不跳、检查中无空白；无参数时与上游一致'),
'src/main/persistence/tracking-repos/project-group-operations.ts':('keep','删除项目组时由 fork 钩子保留文件夹工作区、只取消分组（主进程）'),
'src/shared/folder-workspaces.ts':('keep','登记了上面的钩子时，加载不丢弃所属组已删的文件夹工作区'),
'src/main/persistence/migrating-orcad-catalog/orcad-catalog-records.ts':('keep','迁移到 orcad 时接受所属组已删的文件夹工作区'),
'src/shared/sidebar-list/folder-workspace-lanes.ts':('keep','所属组已删、已取消分组的文件夹工作区用替身组，其他分组方式也列出'),
'src/main/agent-hooks/restored-status-dead-terminal-sweep.ts':('keep','所属组已删的文件夹工作区按自己的主机字段判断 agent 主机'),
'src/fork/main/project-group-delete.ts':('keep','删除项目组时文件夹工作区只取消分组，补齐所属组的路径和主机字段'),
'src/renderer/src/components/settings/SshTargetCard.tsx':('shrink','PR E：翻译搬到 src/fork/ssh/ssh-status-labels.tsx，上游文件只包一层 withForkSshStatusLabels'),
'src/renderer/src/components/right-sidebar/AiVaultPanelControls.tsx':('shrink','PR E：other hosts 文案改调 fork 的 aiVaultOtherHostsLabel，上游文件不再翻译 fork 键'),
'config/i18next.config.ts':('keep','PR E 新增：上游提取检查跳过 src/fork，由 fork-keys-catalog 测试代替'),
'src/renderer/src/store/slices/worktree-helpers.ts':('keep','PR E 新增：updateWorktreeMeta 失败结果多一个可选 code 字段'),
'src/renderer/src/store/slices/worktrees/metadata/update-worktree-meta.ts':('keep','PR E 新增：失败结果保留“只写一半”的错误码'),
'src/fork/sidebar/sidebar-fields-applied.tsx':('keep','PR E：带 code 的 SidebarFieldsNotAppliedError，按 code 匹配（只在渲染进程里抛出和判断）'),
'src/fork/sidebar/workspace-group-drop-plan.tsx':('keep','跨次拖放队列；PR E：按错误码判断只写一半；PR F：重新编号的邻居只写排序'),
'src/fork/sidebar/group-drop-order.tsx':('keep','PR F 新增：手动排序跨组拖放的排序值；邻居相同或间隔用尽时只重排目标分区'),
'src/fork/i18n/en.json':('keep','PR E 新增：fork 英文覆盖层（36 个键从上游 en.json 移来，另加 6 个右键菜单键）'),
'src/fork/i18n/locale-overlay.ts':('keep','PR E：同时装 en 与 zh 覆盖层'),
'src/fork/ssh/ssh-status-labels.tsx':('keep','PR E 新增：SSH 状态名翻译'),
'src/fork/ai-vault/panel-slots.tsx':('keep','PR E：加 aiVaultOtherHostsLabel'),
'fork/scripts/mac-auto-update.sh':('keep','PR E：去掉重复的 ORCA_BUILD_RELEASES 判断和未用变量，glibc 2.17 Node 改读上游 pin；PR #7 跟进：读到的值先校验格式（净增 20 行）'),
'fork/scripts/publish-mac-release.sh':('shrink','PR E：清单上传并入 upload_one（force），去掉重复逻辑'),
'fork/scripts/publish-mac-release.test.sh':('keep','PR E：加同大小不安全清单必须替换的用例'),
'fork/scripts/install-mac-release.sh':('shrink','PR E：去掉只给已删发布入口用的 --install-built'),
'fork/scripts/verify/check-no-internal-refs.sh':('keep','PR E：扫描自上游基点以来新增的所有 fork 文件（任何扩展名）'),
'src/fork/skills-source-commit.fork.test.ts':('keep','PR E：用例名只在真的跳过时写 skipped'),
'fork/scripts/publish-bridge-release.sh':('keep','orca每日更新在用，按要求不动'),
'src/renderer/src/components/sidebar/worktree.ts':('keep','试过改回上游：会超出 300 行 max-lines'),
'src/renderer/src/components/sidebar/useAddRepoNestedImportFlow.ts':('keep','试过改回上游：会超出 300 行 max-lines'),
'src/renderer/src/components/sidebar/use-worktree-context-menu-model.tsx':('keep','PR E 新增：Sleep/Delete 文案改为一次调用 worktreeContextMenuLabels，上游英文原样作为未登记时的结果'),
'src/shared/fork-hooks/worktree-context-menu-labels.ts':('keep','PR E 新增：右键菜单 Sleep/Delete 文案钩子，未登记时返回上游英文'),
'src/fork/sidebar/context-menu-labels.tsx':('keep','PR E 新增：右键菜单 Sleep/Delete 文案的 fork 翻译'),
'src/fork/i18n/fork-translate.tsx':('keep','PR E 新增：fork 代码统一经 forkTranslate 翻译，上游提取检查看不到 fork 键，i18next 配置保持上游'),
'src/fork/sidebar/context-menu-label-keys.ts':('keep','PR #7 跟进：右键菜单文案键的常量表，键目录测试读取它'),
'src/fork/ssh/ssh-status-keys.ts':('keep','PR #7 跟进：SSH 状态名键的常量表，键目录测试读取它'),
'fork/scripts/mac-auto-update-seed.test.sh':('keep','PR #7 跟进：seed_glibc217 的 pin 校验、缓存和镜像下载的 shell 测试'),
'fork/scripts/verify/check-commit-identity.sh':('keep','推送和发布前检查 upstream/main 和写死的下限 8fd7c96acc 之后每个提交的作者和提交者都是 quzard 的 noreply 身份'),
'fork/scripts/check-commit-identity.test.sh':('keep','身份检查的 shell 测试：合规、作者、提交者、合并提交、缺 upstream/main、挪基线不能跳过坏提交、拉取超时'),
'fork/scripts/verify/fetch-upstream-main.sh':('keep','身份检查前刷新 upstream/main，避免把已合并的上游提交当成 fork 提交；默认 600 秒超时，超时杀掉 fetch；收到 TERM/INT/HUP 时杀掉 fetch 的整个进程组再退出；清理时重发 TERM、3 秒后 KILL，不 wait 子进程，就不会一直等着 fetch 结束'),
'fork/scripts/signal-test-preflight.sh':('keep','发 INT、HUP 的 shell 测试共用的预检：被忽略时用 perl 恢复后重跑，否则以 2 退出'),
'fork/scripts/fetch-upstream-signal-stress.test.sh':('keep','拉取脚本在启动窗口收到信号的压力测试：每个信号 200 次，每次 5 秒内退出、不留下进程；ps 失败、无输出或 PATH 里没有 ps 时也一样；fetch 不理 TERM 时走 3 秒后的 KILL；信号发给整个进程组时也一样；缺命令时报错'),
'fork/scripts/check-no-internal-refs.test.sh':('keep','标识扫描的 shell 测试：从上游改名来的文件也扫描，扫描后跑身份检查'),
'src/renderer/src/components/sidebar/worktree-list/drag/groups.ts':('keep','PR F：无标题行的分区（fork 未分组列表）自成一个拖放组，修复拖动约 46ms 后取消'),
'src/renderer/src/components/sidebar/worktree-drag-units.ts':('keep','PR F：同 groups.ts，拖放单元组按分区键切分'),
'src/renderer/src/components/sidebar/worktree-list/drag/pointer-commit.ts':('keep','跨组拖放钩子；PR F：先于设父级和状态目标判断'),
'src/renderer/src/components/sidebar/worktree-list/drag/use-document-drop.ts':('keep','跨组拖放钩子；PR F：先于设父级和状态目标判断'),
'src/renderer/src/components/sidebar/WorktreeContextMenuView.tsx':('keep','右键菜单槽位；PR F：分组项改读 worktreeMenuGroups（未登记时为上游原值）；多选的批量菜单不渲染 fork 单行槽位'),
'src/renderer/src/components/settings/SshTargetDestructiveActions.tsx':('keep','PR F：Remove/Removing 经 sshTargetRemoveLabels，未登记时原样英文'),
'src/shared/fork-hooks/worktree-menu-groups.ts':('keep','PR F 新增：右键菜单分组项的列表、当前分组和处理函数'),
'src/shared/fork-hooks/ssh-target-remove-labels.ts':('keep','PR F 新增：删除 SSH 目标对话框按钮文案'),
'src/fork/sidebar/menu-groups.tsx':('keep','PR F 新增：按有效分组和同主机过滤的菜单分组项，工作区级移动'),
'src/fork/sidebar/mode-labels.tsx':('keep','PR F 新增：仅取消分组、主机模式和 SSH 删除按钮的翻译；切换语言时通知分组方式菜单重渲染'),
'src/fork/sidebar/nearest-section.ts':('keep','PR F 新增：两行之间松手时取最近一行的分区'),
'fork/scripts/generate-audit.py':('keep','PR #7 跟进：生成本表'),
'docs/fork/AUDIT.md':('keep','PR #7 跟进：本表'),
'src/fork/audit-table.fork.test.ts':('keep','PR #7 跟进：检查本表和仓库一致'),
'src/fork/directory-browse.fork.test.ts':('keep','fork 测试；⚠ F007 已移除，这个测试守护上游行为不回退，是否还需要待定'),
'src/renderer/src/components/terminal-pane/terminal-file-open-routing.ts':('keep','F046：#33304 之后本地跨工作区跟上游。路由只留 SSH 停留、嵌套降级和远程 HTML 应用内预览，并直接 import file-link-route'),
'src/renderer/src/components/editor/useEditorPanelFileContentLoader.ts':('keep','F046：记下的 SSH/服务器链接按归属工作区读，本地只读绝对路径走上游'),
'src/fork/terminal/file-link-route.tsx':('keep','F046：宿主解析、远程 HTML 预览、兄弟标签碰撞和嵌套路径放在这里，给路由文件腾出行数；服务器只读视图补回运行时 id'),
'src/fork/terminal/html-preview-open.tsx':('keep','F046：托管主机工作区外的 HTML、别的运行时工作区里的 HTML、直连 SSH 工作区外的 HTML，打开应用内文档预览'),
'src/shared/fork-hooks/terminal-html-preview.ts':('keep','F046：记下远程 HTML 的读取方式。没有记录时文档预览授权跟上游'),
'src/fork/main/ssh-html-preview-read.ts':('keep','F046：直连 SSH 工作区外的 HTML 按已有连接读取。凭据目录和跳出目录的软链不读'),
'src/renderer/src/lib/doc-preview-grants.ts':('keep','F046：终端记下的远程 HTML 先取那条预览位置，没有记录时仍按工作区规则'),
'src/preload/api/doc-preview-api.ts':('keep','F046：预览授权请求可以带上终端文件授权或直连 SSH 标记'),
'src/main/ipc/doc-preview-grant-ipc.ts':('keep','F046：铸预览授权时记下怎么读，撤销时忘掉'),
'src/main/browser/doc-preview-file-reader.ts':('keep','F046：授权文件走 files.readTerminalArtifactPreview；记下的直连 SSH 走登记的读取函数。其他 ssh 仍是 404'),
'src/main/browser/doc-preview-file-reader.test.ts':('keep','F046：授权文件预览和直连 SSH 预览的读取用例'),
'src/renderer/src/lib/doc-preview-grants.test.ts':('keep','F046：记下的远程 HTML 位置优先于工作区规则'),
'src/renderer/src/components/right-sidebar/source-control/panel/panel.tsx':('keep','F047：git 仓库面板用 renderSourceControlScope 包一层，文件夹工作区仍走原来的提前返回'),
'src/renderer/src/components/editor/useEditorPanelDiffContentLoader.ts':('keep','F047：嵌套仓库里的文件 diff 交给 fork 钩子，未命中时仍是上游读取'),
'src/main/runtime/rpc/methods/index.ts':('keep','F047：摊开 FORK_GIT_WORKSPACE_METHODS，本机、orcad 和配对运行时同一份方法表'),
'src/main/runtime/construction/runtime-construction.ts':('keep','F047：git 命令面装好后绑定 fork 的工作区目标解析；方法在更下层子类上，这里做结构转换'),
'src/shared/protocol-version.ts':('keep','F047：RUNTIME_CAPABILITIES 摊进 fork.git.workspace-repositories.v1，常量放在 shared 以免 CLI 依赖 src/fork'),
'src/main/runtime/rpc/rpc-params-type-parity.ts':('keep','F047：六个 fork 方法的参数 schema 在 src/fork，不进共享 catalog，记在未编目名单里'),
'src/shared/rpc-contract/rpc-params-catalog.generated.ts':('keep','F047：生成器把六个新方法记进 RPC_METHODS_WITHOUT_SHARED_PARAMS，不手改'),
'src/renderer/src/components/right-sidebar/ai-vault-panel-transient-state.ts':('keep','一次替换整组折叠键；内容相同则跳过和 512 条上限都在 fork 的列表钩子里，渲染过程中不写'),
'src/renderer/src/components/sidebar/DeleteWorktreeDialog.tsx':('keep','F048：默认只归档；勾选才硬删除。对话框到了行数上限，复选框、软删除，以及空列表关闭、开关和确认焦点都在 fork 文件里，这里直接 import'),
'src/renderer/src/components/sidebar/DeleteWorktreeLineageNotice.tsx':('keep','F048：软删除时用传入的两句替换“子工作区会被删除”；不传时仍是上游原文'),
'src/renderer/src/components/sidebar/delete-worktree-flow.ts':('keep','F048：登记之后，“不要再问”跳过对话框也只归档；对不上的行失败关闭，回退只删文件夹。未登记时仍是原来的硬删除'),
'src/shared/fork-hooks/workspace-folder-delete.ts':('keep','F048：删除工作区是否连目录一起删。未登记时没有复选框，确认仍硬删除'),
'src/renderer/src/store/slices/worktrees/listing/fetched-worktree-merge.ts':('keep','F048：扫描结果合并前套上软删除的本机隐藏，未登记时原样返回'),
'src/renderer/src/store/slices/worktrees/listing/known-ssh-worktree-fetch.ts':('keep','F048：已知 SSH 回退列表不经过扫描合并，套上软删除隐藏；未登记时原样返回'),
'src/renderer/src/store/terminals/workspace-terminal-placeholders.ts':('keep','F048：运行时会话占位行套上软删除隐藏，未登记时仍是未归档'),
'src/renderer/src/store/terminals/workspace-terminal-ssh-placeholders.ts':('keep','F048：SSH 终端水合占位行套上软删除隐藏，未登记时仍是未归档'),
'src/renderer/src/lib/sidebar-pending-layer.ts':('keep','F048：新建工作区成功后清掉同路径本机隐藏，未登记时不动'),
'src/renderer/src/components/sidebar/run-worktree-delete-with-toast.ts':('keep','F048：删除文件夹成功后清掉同路径本机隐藏，未登记时不动'),
'src/renderer/src/components/sidebar/delete-worktree-dialog-force-delete.ts':('keep','F048：强制删除文件夹成功后清掉同路径本机隐藏，未登记时不动'),
'src/fork/sidebar/durable-workspace-archive.ts':('keep','F048：本机隐藏记录。没有所属仓库时按同一台主机的路径记住；新建、导入和硬删除成功会清掉对得上的记录'),
'src/shared/worktree/reused-path-archive.ts':('keep','F048：同一路径新建时清掉复用元数据里的 isArchived。发现扫描和血统轮换不走这里'),
'src/main/ipc/worktree-remote.ts':('keep','F048：桌面新建换 instanceId 时把复用路径的 isArchived 写成否'),
'src/main/runtime/runtime-local-worktree-materialization.ts':('keep','F048：运行时新建换 instanceId 时把复用路径的 isArchived 写成否'),
'src/main/provisioned-root-checkout.ts':('keep','F048：预置根目录新建换 instanceId 时把复用路径的 isArchived 写成否'),
'src/main/ipc/worktrees-create-metadata-persistence.test.ts':('keep','F048：同一路径再建时，软删除留下的 isArchived 被清掉，新行是活动的'),
'src/main/runtime/runtime-local-worktree-materialization.test.ts':('keep','F048：运行时新建写入的元数据带 isArchived false'),
'src/renderer/src/components/sidebar/new-external-worktrees-inbox-actions.ts':('keep','F048：导入外部工作区时先清掉同路径的归档元数据和本机隐藏，失败则不扫描；未登记时不动'),
'src/shared/fork-hooks/workspace-durable-archive.ts':('keep','F048：软删除隐藏记录的登记。未登记时不改归档标记，也不清记录，也不改 profile-state 里的 isArchived'),
'src/main/runtime/terminal/terminal-path-resolver.ts':('keep','F046：只调用 openDisownedHostFile。打开和凭据目录拒绝在 fork 文件里。未登记不 stat'),
'src/main/runtime/terminal/artifacts/file-grants.ts':('keep','F046：只读授权多一个 disowned-host 来源，和终端输出、对话引用分开'),
'src/shared/fork-hooks/terminal-disowned-host-file.ts':('keep','F046：登记打开函数。未登记时不 stat，仍返回 exists:false'),
}
REVERTED={'src/main/electron-updater-mac-staging-contract.test.ts':'PR D：fork 用例搬到 src/fork/main/*.fork.test.ts',
 'src/main/host/safe-storage-availability.test.ts':'PR D：fork 用例搬到 src/fork/main/*.fork.test.ts',
 'src/renderer/src/i18n/locales/en.json':'PR E：36 个 fork 键移到 src/fork/i18n/en.json',
 'src/renderer/src/i18n/en-runtime-required.json':'PR E：fork 键随之移出，与上游一致'}
DEL={'fork/scripts/measure-ai-vault-scan.fork.test.ts':'手动测量，无引用','fork/scripts/vitest.measure.config.ts':'只给上面的测量测试用','fork/scripts/verify/screenshot-sidebar.mjs':'手动截图，只在 parity 文档提到',
 'fork/scripts/personal-orca-host.py':'只被 release-personal-orca.mjs 调用','fork/scripts/personal-orca-host.test.py':'随脚本删除','fork/scripts/release-personal-orca.mjs':'唯一用途是调用 personal-orca-host.py',
 'fork/scripts/personal-release-checks.cjs':'唯一使用者是 release-personal-orca.mjs','src/fork/personal-release-checks.fork.test.ts':'测试已删除的发布脚本'}
rows=[]; cnt=collections.Counter(); tot0=tot1=0
for s,*fs in st:
    f=fs[-1]
    if f in OVR: d,why=OVR[f]
    elif s=='A' or FORKROOT.match(f):
        d='keep'; why='fork 自有文件' + ('（测试）' if '.test.' in f else '')
    else:
        a=nlines_prd0(f); b=nlines(REV,f)
        if b<a:
            d='shrink'
            # 只记行数变化，不猜原因：减少可能来自 PR D 的搬迁，也可能来自同步时上游改写或格式化。
            why=f'上游文件里的 fork 改动比 PR #6 之前少：{a}→{b} 行'
        else: d='keep'; why=f'上游文件，fork 改动 {b} 行，已是最小写法'
    if s=='M' and not FORKROOT.match(f): tot1+=nlines(REV,f); tot0+=nlines_prd0(f)
    cnt[d]+=1; rows.append(f'| `{f}` | {feat(f)} | {d} | {why} |')
for f,why in REVERTED.items():
    if g('diff','--name-only',*against(REV),'--',f).strip() or not g('cat-file','-t',blob(REV,f)).strip(): continue
    cnt['revert-to-upstream']+=1; rows.append(f'| `{f}` | {feat(f)} | revert-to-upstream | {why}；`git diff {UP} -- 文件` 为空 |')
for f,why in DEL.items():
    if g('cat-file','-t',blob(REV,f)).strip(): continue
    cnt['delete']+=1; rows.append(f'| `{f}` | {feat(f)} | delete | PR E：{why}；Mac 上从未使用 |')
rows.sort(key=lambda r:r.split('`')[1])
unsure=sum('⚠' in r for r in rows)
head=[f'# Fork 文件逐个审计（对比上游 {UP}）','',
f'由 `fork/scripts/generate-audit.py` 生成，改了 fork 文件后重新运行并用 oxfmt 格式化。每个和上游 {UP} 不同的文件一行，另列已恢复成上游和已删除的文件。`src/fork/audit-table.fork.test.ts` 检查表和仓库一致。','',
f'共 {len(rows)} 行：'+'，'.join(f'{k} {v}' for k,v in sorted(cnt.items()))+f'；⚠ 不确定 {unsure} 个（保留）。',
f'上游文件（不含 fork 目录）里的 fork 改动行数：PR #6 之前（b7755e6357）{tot0}，现在 {tot1}。','',
'| 文件 | 功能 | 决定 | 原因 |','|---|---|---|---|']
open(os.path.join(R,'docs/fork/AUDIT.md'),'w').write('\n'.join(head+rows)+'\n')
print(head[4]); print(head[5])
