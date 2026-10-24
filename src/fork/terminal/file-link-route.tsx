// 路由文件不能直接依赖商店查找，否则会越过行数上限。查找和只读字段放在这里。
// 必须是 .tsx：它引用渲染进程的 @/ 别名，而 node 工程只收录 src/fork/**/*.ts。
// 写成 .ts 时 pnpm tc 会在 node 工程里解析这些别名失败。
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { useAppStore } from '@/store'
import { otherWorkspaceViewFields } from '@/components/terminal-pane/terminal-file-other-workspace-owner'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../shared/execution-host'
import type { TerminalFileLinkRoute } from '../../shared/fork-hooks/terminal-file-link-workspace'

export function findTerminalFileLinkRoute(
  executionHostId: ExecutionHostId,
  absolutePath: string
): TerminalFileLinkRoute | null {
  return findWorkspaceFileRoute(useAppStore.getState(), executionHostId, absolutePath)
}

/**
 * 上游的只读标记会把运行时 id 清掉。服务器上的视图要把它留着，
 * 否则重新打开时会被当成这台电脑上的文件。本地视图保持上游。
 */
export function terminalLinkViewFields(
  owner: TerminalFileLinkRoute | null,
  runtimeEnvironmentId: string | null | undefined
): { readOnly?: true; runtimeEnvironmentId?: string | null } {
  const fields = otherWorkspaceViewFields(owner)
  if (!owner || owner.executionHostId === LOCAL_EXECUTION_HOST_ID || !runtimeEnvironmentId) {
    return fields
  }
  return { ...fields, runtimeEnvironmentId }
}
