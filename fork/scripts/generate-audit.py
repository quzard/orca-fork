#!/usr/bin/env python3
"""Regenerate docs/fork/AUDIT.md: one row per file that differs from the upstream base.

Usage: python3 fork/scripts/generate-audit.py [REV]   (REV defaults to HEAD; --index uses staged files)
Needs the upstream base 1b3113de8e, b7755e6357 (develop before PR #6) and 8fd7c96acc (before
PR #7) in the clone. Decisions and reasons below are hand-written; rows with no entry get a
generic reason from the file's location. Rerun after changing fork files and commit the result.
"""
import os,subprocess,re,sys,collections
R=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REV=sys.argv[1] if len(sys.argv)>1 else 'HEAD'
def g(*a): return subprocess.run(['git','-C',R,*a],capture_output=True,text=True).stdout
UP='1b3113de8e'; PRD0='b7755e6357'; BASE='8fd7c96acc'
def against(rev):
    return [UP,'--cached'] if rev=='--index' else [UP,rev]
def blob(rev,f):
    return f':{f}' if rev=='--index' else f'{rev}:{f}'
def nlines(rev,f):
    d=g('diff',*against(rev),'--',f); return sum(1 for l in d.splitlines() if l[:1] in '+-' and l[:3] not in ('+++','---'))
st=[l.split('\t') for l in g('diff','--name-status',*against(REV)).splitlines()]
FORKROOT=re.compile(r'^(src/fork/|fork/|docs/fork/|src/shared/fork-hooks/|FORK-CHANGES\.md)')
FEAT=[('project-group','SB 侧栏/项目组'),('open-in','OPEN 打开方式'),('editor-launch','OPEN 打开方式'),('post-import','F003/F025 批量导入'),('composer','SB 新建工作区'),('quick-creation','SB 新建工作区'),('computer-use','F006 权限窗口'),('main.swift','F006 权限窗口'),('ai-vault','AIV 历史会话'),('AiVault','AIV 历史会话'),('session-scanner','AIV 历史会话'),
('ssh','SSH 状态'),('Ssh','SSH 状态'),('i18n','I18N 界面中文'),('skill','SKL 技能 pin'),('Skill','SKL 技能 pin'),
('sidebar','SB 侧栏'),('Sidebar','SB 侧栏'),('worktree','SB 侧栏/工作区'),('Worktree','SB 侧栏/工作区'),('workspace','SB 侧栏/工作区'),('Workspace','SB 侧栏/工作区'),('repo','SB 侧栏/工作区'),
('mac-auto-update','F040 Mac 构建发布'),('mac-release','F040 Mac 构建发布'),('publish-','F040 Mac 构建发布'),('install-mac','F040 Mac 构建发布'),('updater','UPD 应用内更新'),('update','UPD 应用内更新'),('terminal','TERM 终端'),('Terminal','TERM 终端'),('safe-storage','F038 密钥存储'),('secret','F038 密钥存储'),
('mac-','F040 Mac 构建发布'),('publish','F040 Mac 构建发布'),('install','F040 Mac 构建发布'),('release','F040 Mac 构建发布'),('daily-sync','F040 每日同步'),('sync','F040 每日同步'),
('node-runtime','F040 Node 运行时'),('packaging','F040 Mac 构建发布'),('electron-builder','F040 Mac 构建发布'),('directory-browse','F007（已移除，守护测试）')]
def feat(f):
    for k,v in FEAT:
        if k in f: return v
    return 'INFRA 登记/工程/文档'
OVR={
'native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift':('keep','F006 拖拽卡片；PR E：带参数时三种状态卡片同一位置，切换不跳、检查中无空白；无参数时与上游一致'),
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
'fork/scripts/verify/check-commit-identity.sh':('keep','推送和发布前检查 upstream/main 之后每个提交的作者和提交者都是 quzard 的 noreply 身份'),
'fork/scripts/check-commit-identity.test.sh':('keep','身份检查的 shell 测试：合规、作者、提交者、合并提交、缺 upstream/main'),
'fork/scripts/verify/identity-baseline':('keep','身份检查的基线：8fd7c96acc 及之前的已公开提交不查'),
'fork/scripts/verify/fetch-upstream-main.sh':('keep','身份检查前刷新 upstream/main，避免把已合并的上游提交当成 fork 提交'),
'fork/scripts/check-no-internal-refs.test.sh':('keep','标识扫描的 shell 测试：从上游改名来的文件也扫描，扫描后跑身份检查'),
'src/renderer/src/components/sidebar/worktree-list/drag/groups.ts':('keep','PR F：无标题行的分区（fork 未分组列表）自成一个拖放组，修复拖动约 46ms 后取消'),
'src/renderer/src/components/sidebar/worktree-drag-units.ts':('keep','PR F：同 groups.ts，拖放单元组按分区键切分'),
'src/renderer/src/components/sidebar/worktree-list/drag/pointer-commit.ts':('keep','跨组拖放钩子；PR F：先于设父级和状态目标判断'),
'src/renderer/src/components/sidebar/worktree-list/drag/use-document-drop.ts':('keep','跨组拖放钩子；PR F：先于设父级和状态目标判断'),
'src/renderer/src/components/sidebar/WorktreeContextMenuView.tsx':('keep','右键菜单槽位；PR F：分组项改读 worktreeMenuGroups（未登记时为上游原值）'),
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
        a=nlines(PRD0,f); b=nlines(REV,f)
        if b<a:
            d='shrink'
            how='排除列表改成通配' if 'tsconfig' in f else ('恢复上游内容，fork 断言搬到 src/fork' if '.test.' in f else '逻辑搬进 src/fork，上游只留调用')
            why=f'PR D：上游文件里的 fork 改动 {a}→{b} 行（{how}）'
        else: d='keep'; why=f'上游文件，fork 改动 {b} 行，已是最小写法'
    if s=='M' and not FORKROOT.match(f): tot1+=nlines(REV,f); tot0+=nlines(PRD0,f)
    cnt[d]+=1; rows.append(f'| `{f}` | {feat(f)} | {d} | {why} |')
for f,why in REVERTED.items():
    if g('diff','--name-only',*against(REV),'--',f).strip() or not g('cat-file','-t',blob(REV,f)).strip(): continue
    cnt['revert-to-upstream']+=1; rows.append(f'| `{f}` | {feat(f)} | revert-to-upstream | {why}；`git diff {UP} -- 文件` 为空 |')
for f,why in DEL.items():
    if g('cat-file','-t',blob(REV,f)).strip(): continue
    cnt['delete']+=1; rows.append(f'| `{f}` | {feat(f)} | delete | PR E：{why}；Mac 上从未使用 |')
rows.sort(key=lambda r:r.split('`')[1])
unsure=sum('⚠' in r for r in rows)
head=['# Fork 文件逐个审计（对比上游 1b3113de8e）','',
'由 `fork/scripts/generate-audit.py` 生成，改了 fork 文件后重新运行并用 oxfmt 格式化。每个和上游 1b3113de8e 不同的文件一行，另列已恢复成上游和已删除的文件。`src/fork/audit-table.fork.test.ts` 检查表和仓库一致。','',
f'共 {len(rows)} 行：'+'，'.join(f'{k} {v}' for k,v in sorted(cnt.items()))+f'；⚠ 不确定 {unsure} 个（保留）。',
f'上游文件（不含 fork 目录）里的 fork 改动行数：PR #6 之前（b7755e6357）{tot0}，现在 {tot1}。','',
'| 文件 | 功能 | 决定 | 原因 |','|---|---|---|---|']
open(os.path.join(R,'docs/fork/AUDIT.md'),'w').write('\n'.join(head+rows)+'\n')
print(head[4]); print(head[5])
