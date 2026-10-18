// fork: 主进程与渲染进程都会调用。不要在这里静态引入 electron、node:fs 或界面组件。
// 主进程登记在 register-main.ts，界面登记在 register-renderer.tsx。

import { registerSidebarGroupIdPreserve } from '../shared/fork-hooks/sidebar-group-membership'
import { registerForkBuild } from '../shared/fork-hooks/update-feed'
import { registerHostDirectoryMode } from './sidebar/register-mode'
import { preserveOmittedSidebarGroupIds } from './sidebar/preserve-sidebar-group'
import { registerForkSkillSource } from './skills-source-commit'

export function registerForkModules(): void {
  registerForkBuild()
  registerForkSkillSource()
  registerHostDirectoryMode()
  registerSidebarGroupIdPreserve(preserveOmittedSidebarGroupIds)
}
