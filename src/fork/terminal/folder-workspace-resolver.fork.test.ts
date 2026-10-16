import { describe, expect, it } from 'vitest'
import { resolveFolderTerminalWorkspace } from './folder-workspace-resolver'

describe('resolveFolderTerminalWorkspace', () => {
  it('returns null for a selector the runtime does not treat as a folder', () => {
    const runtime = {
      forkTerminalHost: true as const,
      resolveFolderWorkspaceSelector: () => null,
      folderWorkspaceToResolvedWorktree: () => ({ id: 'unused' })
    }
    expect(resolveFolderTerminalWorkspace('id:repo', runtime)).toBeNull()
  })

  it('returns the resolved folder worktree', () => {
    const worktree = { id: 'folder:workspace-1', path: '/home/user/wt' }
    const runtime = {
      forkTerminalHost: true as const,
      resolveFolderWorkspaceSelector: (selector: string) =>
        selector === 'folder:workspace-1' ? { id: 'workspace-1' } : null,
      folderWorkspaceToResolvedWorktree: () => worktree
    }
    expect(resolveFolderTerminalWorkspace('folder:workspace-1', runtime)).toBe(worktree)
  })

  it('lets a missing folder throw selector_not_found', () => {
    const runtime = {
      forkTerminalHost: true as const,
      resolveFolderWorkspaceSelector: () => {
        throw new Error('selector_not_found')
      }
    }
    expect(() => resolveFolderTerminalWorkspace('folder:missing', runtime)).toThrow(
      'selector_not_found'
    )
  })
})
