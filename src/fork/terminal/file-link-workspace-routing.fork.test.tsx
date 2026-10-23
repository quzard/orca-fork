// 点击终端链接时的三条切工作区路径里，前两条在打开文件之前：
// 配对运行时询问宿主，以及同级工作区里已经打开过同一路径。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionId } from '@/lib/connection-context'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { openDetectedFilePath } from '@/components/terminal-pane/terminal-link-handlers'
import { createTerminalLinkTestDoubles } from '@/components/terminal-pane/terminal-link-handlers-test-fixtures'
import {
  flushDoubleRaf,
  installTerminalLinkTestEnvironment
} from '@/components/terminal-pane/terminal-link-handlers-test-harness'
import { registerTerminalFileLinkWorkspace } from '../../shared/fork-hooks/terminal-file-link-workspace'

const findWorkspaceFileRouteMock = vi.hoisted(() => vi.fn())
const doubles = createTerminalLinkTestDoubles()
const { storeState, statMock, openFileMock, runtimeEnvironmentCallMock } = doubles

let keepInCurrent = true
const remembered: { worktreeId: string; filePath: string }[] = []

registerTerminalFileLinkWorkspace({
  keepsCurrentWorkspace: () => keepInCurrent,
  renderSetting: () => null,
  searchEntries: () => [],
  rememberStay: (worktreeId, filePath) => {
    remembered.push({ worktreeId, filePath })
  }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => storeState
  }
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: vi.fn(() => null)
}))

vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: findWorkspaceFileRouteMock
}))

vi.mock('@/components/terminal-pane/terminal-remote-file-download-open', () => ({
  downloadAndOpenRemoteTerminalFile: vi.fn()
}))

installTerminalLinkTestEnvironment(doubles)

const HOME_FILE = '/Users/me/Library/Application Support/orca/generated.png'
const HOME_ROUTE = {
  worktreeId: 'folder:home',
  relativePath: 'Library/Application Support/orca/generated.png',
  executionHostId: 'local'
} as const

const featureWorktree = {
  worktreeId: 'wt-feat',
  worktreePath: '/repo/.orca/worktrees/feat-x',
  runtimeEnvironmentId: 'env-1'
}

function hostAnswers(result: unknown): void {
  runtimeEnvironmentCallMock.mockResolvedValueOnce({
    id: 'rpc-1',
    ok: true,
    result,
    _meta: { runtimeId: 'remote-runtime' }
  })
}

beforeEach(() => {
  keepInCurrent = true
  remembered.length = 0
  findWorkspaceFileRouteMock.mockReset()
  findWorkspaceFileRouteMock.mockReturnValue(null)
})

describe('terminal file links stay in the clicked workspace', () => {
  it('reads a paired-runtime file from the owning host workspace without activating it', async () => {
    hostAnswers({
      worktree: 'folder:home',
      relativePath: HOME_ROUTE.relativePath,
      absolutePath: HOME_FILE,
      exists: true,
      isDirectory: false
    })

    openDetectedFilePath(HOME_FILE, null, null, featureWorktree)
    await flushDoubleRaf()

    expect(runtimeEnvironmentCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'files.resolveTerminalPath',
        params: expect.objectContaining({ pathText: HOME_FILE, crossWorkspace: true })
      })
    )
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith('wt-feat', {
      providesInitialSurface: true,
      executionHostId: 'runtime:env-1'
    })
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: HOME_FILE,
        relativePath: HOME_FILE,
        worktreeId: 'wt-feat',
        runtimeEnvironmentId: 'env-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
    expect(remembered).toEqual([{ worktreeId: 'wt-feat', filePath: HOME_FILE }])
  })

  it('still opens a file inside the clicked workspace as that workspace file', async () => {
    hostAnswers({ size: 1, isDirectory: false, mtime: 1 })

    openDetectedFilePath('/repo/.orca/worktrees/feat-x/a.ts', null, null, featureWorktree)
    await flushDoubleRaf()

    expect(runtimeEnvironmentCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'files.stat' })
    )
    expect(runtimeEnvironmentCallMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'files.resolveTerminalPath' })
    )
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/repo/.orca/worktrees/feat-x/a.ts',
        relativePath: 'a.ts',
        worktreeId: 'wt-feat',
        runtimeEnvironmentId: 'env-1'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
    expect(remembered).toEqual([])
  })

  it('opens a path owned by another workspace read-only without activating it', async () => {
    const filePath = '/sibling/docs/SKILL.md'
    findWorkspaceFileRouteMock.mockReturnValue({
      worktreeId: 'folder:notes',
      relativePath: 'docs/SKILL.md',
      executionHostId: 'local'
    })

    openDetectedFilePath(filePath, null, null, doubles.deps)
    await flushDoubleRaf()

    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:notes', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
    expect(remembered).toEqual([{ worktreeId: 'wt-1', filePath }])
  })

  it('does not adopt a sibling workspace that already has the same path open', async () => {
    const filePath = '/sibling/docs/SKILL.md'
    storeState.openFiles = [{ filePath, worktreeId: 'folder:notes' }]

    openDetectedFilePath(filePath, 12, null, doubles.deps)
    await flushDoubleRaf()

    expect(findWorkspaceFileRouteMock).toHaveBeenCalled()
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:notes', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
    expect(remembered).toEqual([{ worktreeId: 'wt-1', filePath }])
  })

  it('keeps a direct SSH link in the terminal workspace when another workspace contains the path', async () => {
    vi.mocked(getConnectionId).mockImplementation((worktreeId) =>
      worktreeId === 'wt-ssh' ? 'ssh-1' : null
    )
    findWorkspaceFileRouteMock.mockReturnValue(HOME_ROUTE)
    storeState.openFiles = [{ filePath: HOME_FILE, worktreeId: 'folder:home' }]

    openDetectedFilePath(HOME_FILE, null, null, {
      worktreeId: 'wt-ssh',
      worktreePath: '/home/me/ha'
    })
    await flushDoubleRaf()

    expect(statMock).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: HOME_FILE, connectionId: 'ssh-1' })
    )
    expect(findWorkspaceFileRouteMock).toHaveBeenCalled()
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: HOME_FILE,
        relativePath: HOME_FILE,
        worktreeId: 'wt-ssh',
        externalSshTargetId: 'ssh-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
  })
})

describe('terminal file links follow the owning workspace when the setting is off', () => {
  it('opens the workspace a paired runtime says holds the path', async () => {
    keepInCurrent = false
    hostAnswers({
      worktree: 'folder:home',
      relativePath: HOME_ROUTE.relativePath,
      absolutePath: HOME_FILE,
      exists: true,
      isDirectory: false
    })

    openDetectedFilePath(HOME_FILE, null, null, featureWorktree)
    await flushDoubleRaf()

    expect(runtimeEnvironmentCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'files.resolveTerminalPath',
        params: expect.objectContaining({ crossWorkspace: true })
      })
    )
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith('folder:home', {
      providesInitialSurface: true,
      executionHostId: 'runtime:env-1'
    })
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: HOME_FILE,
        relativePath: HOME_ROUTE.relativePath,
        worktreeId: 'folder:home'
      }),
      { forceContentReload: true }
    )
  })

  it('adopts a sibling workspace that already has the same path open', async () => {
    keepInCurrent = false
    const filePath = '/sibling/docs/SKILL.md'
    storeState.openFiles = [{ filePath, worktreeId: 'folder:notes' }]
    findWorkspaceFileRouteMock.mockReturnValueOnce({
      worktreeId: 'folder:notes',
      relativePath: 'docs/SKILL.md',
      executionHostId: 'local'
    })

    openDetectedFilePath(filePath, 12, null, doubles.deps)
    await flushDoubleRaf()

    expect(findWorkspaceFileRouteMock).toHaveBeenCalled()
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith('folder:notes', {
      providesInitialSurface: true,
      executionHostId: 'local'
    })
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: 'docs/SKILL.md',
        worktreeId: 'folder:notes'
      }),
      { forceContentReload: true }
    )
  })
})
