import type { TerminalWorkspaceHost } from '../../shared/fork-hooks/terminal-lifecycle'

/**
 * Resolve `folder:<id>` the same way terminal create keys the PTY.
 * A missing folder throws `selector_not_found` from the runtime. Other selectors return null.
 */
export function resolveFolderTerminalWorkspace(
  selector: string,
  runtime: TerminalWorkspaceHost
): unknown {
  if (!('resolveFolderWorkspaceSelector' in runtime)) {
    return null
  }
  const resolve = runtime.resolveFolderWorkspaceSelector
  if (typeof resolve !== 'function') {
    return null
  }
  const folder = resolve.call(runtime, selector)
  if (!folder || !('folderWorkspaceToResolvedWorktree' in runtime)) {
    return null
  }
  const convert = runtime.folderWorkspaceToResolvedWorktree
  if (typeof convert !== 'function') {
    return null
  }
  return convert.call(runtime, folder)
}
