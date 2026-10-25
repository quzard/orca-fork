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
import type * as FilePreview from '@/lib/file-preview'
import { registerTerminalFileLinkWorkspace } from '../../shared/fork-hooks/terminal-file-link-workspace'

const previewPlan = vi.hoisted(() => vi.fn())
const openPreview = vi.hoisted(() => vi.fn())
const realPreviewPlan = vi.hoisted(() => {
  const holder: { current?: typeof FilePreview.getWorkspaceFilePreviewPlan } = {}
  return holder
})

vi.mock('@/lib/file-preview', async () => {
  const actual = await vi.importActual<typeof FilePreview>('@/lib/file-preview')
  realPreviewPlan.current = actual.getWorkspaceFilePreviewPlan
  return {
    getWorkspaceFilePreviewPlan: (...args: Parameters<typeof actual.getWorkspaceFilePreviewPlan>) =>
      previewPlan(...args),
    openFileInBrowserTab: (...args: Parameters<typeof actual.openFileInBrowserTab>) =>
      openPreview(...args)
  }
})

const findWorkspaceFileRouteMock = vi.hoisted(() => vi.fn())
const doubles = createTerminalLinkTestDoubles()
const { storeState, statMock, openFileMock, runtimeEnvironmentCallMock } = doubles

const remembered: { worktreeId: string; filePath: string }[] = []

registerTerminalFileLinkWorkspace({
  rememberSshStay: (worktreeId, filePath) => {
    remembered.push({ worktreeId, filePath })
  },
  lookupStay: () => false
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

function realPlan(worktreeId: string, filePath: string) {
  const plan = realPreviewPlan.current
  if (!plan) {
    throw new Error('preview plan unavailable')
  }
  // 真实预览计划要读工作区根路径；终端链接替身原来没有这个方法。
  Object.assign(storeState, {
    getKnownWorktreeById: (id: string) => {
      for (const list of Object.values(storeState.worktreesByRepo)) {
        const found = list.find((entry) => entry.id === id)
        if (found) {
          return found
        }
      }
      return undefined
    }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the terminal-link double carries the catalog fields getWorkspaceFilePreviewPlan reads.
  return plan(storeState as never, worktreeId, filePath)
}

const previewUnsupported = {
  status: 'unsupported' as const,
  message: 'outside',
  reason: 'outside-worktree' as const
}

beforeEach(() => {
  remembered.length = 0
  findWorkspaceFileRouteMock.mockReset()
  findWorkspaceFileRouteMock.mockReturnValue(null)
  previewPlan.mockReset()
  previewPlan.mockReturnValue(previewUnsupported)
  openPreview.mockReset()
  openPreview.mockReturnValue(previewUnsupported)
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

  it('does not keep a local file read-only just because another workspace owns the path', async () => {
    // #33304 撤回了本地停留。只有同级标签撞车时上游才会切到归属工作区；这里没有已打开的标签。
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
        worktreeId: 'wt-1'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
    expect(remembered).toEqual([])
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
        worktreeId: 'wt-1'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
    expect(remembered).toEqual([])
  })

  it('keeps a nested path read-only in the outer workspace, then opens it editable in the deeper one', async () => {
    const filePath = '/Users/me/nas/x.txt'
    const nested = {
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local' as const
    }
    findWorkspaceFileRouteMock.mockReturnValue(nested)

    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-home',
      worktreePath: '/Users/me'
    })
    await flushDoubleRaf()

    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('wt-nas', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-home',
        readOnly: true
      }),
      { forceContentReload: true }
    )
    expect(remembered).toEqual([])

    openFileMock.mockClear()
    vi.mocked(activateAndRevealWorkspace).mockClear()
    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-nas',
      worktreePath: '/Users/me/nas'
    })
    await flushDoubleRaf()

    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: 'x.txt',
        worktreeId: 'wt-nas'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
    expect(remembered).toEqual([])
  })

  it('still opens the nested workspace editable when the outer workspace already has the file', async () => {
    const filePath = '/Users/me/nas/x.txt'
    storeState.openFiles = [{ filePath, worktreeId: 'wt-home' }]
    findWorkspaceFileRouteMock.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })

    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-nas',
      worktreePath: '/Users/me/nas'
    })
    await flushDoubleRaf()

    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: 'x.txt',
        worktreeId: 'wt-nas'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
    expect(remembered).toEqual([])
  })

  it('keeps a nested SSH path read-only on the outer host, in either click order', async () => {
    const filePath = '/home/me/nas/x.txt'
    vi.mocked(getConnectionId).mockImplementation((worktreeId) =>
      worktreeId === 'wt-ssh' || worktreeId === 'wt-ssh-nas' ? 'ssh-1' : null
    )
    findWorkspaceFileRouteMock.mockReturnValue({
      worktreeId: 'wt-ssh-nas',
      relativePath: 'x.txt',
      executionHostId: 'ssh:ssh-1'
    })

    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-ssh',
      worktreePath: '/home/me'
    })
    await flushDoubleRaf()

    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('wt-ssh-nas', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-ssh',
        externalSshTargetId: 'ssh-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )

    openFileMock.mockClear()
    storeState.openFiles = [{ filePath, worktreeId: 'wt-ssh' }]
    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-ssh-nas',
      worktreePath: '/home/me/nas'
    })
    await flushDoubleRaf()

    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: 'x.txt',
        worktreeId: 'wt-ssh-nas'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
  })

  it('keeps a nested runtime path read-only on the outer workspace, in either click order', async () => {
    const filePath = '/repo/.orca/worktrees/feat-x/vendor/a.ts'
    findWorkspaceFileRouteMock.mockReturnValue({
      worktreeId: 'wt-vendor',
      relativePath: 'a.ts',
      executionHostId: 'runtime:env-1'
    })
    hostAnswers({ size: 1, isDirectory: false, mtime: 1 })
    hostAnswers({ size: 1, isDirectory: false, mtime: 1 })

    openDetectedFilePath(filePath, null, null, featureWorktree)
    await flushDoubleRaf()

    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('wt-vendor', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-feat',
        runtimeEnvironmentId: 'env-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
    expect(remembered).toEqual([{ worktreeId: 'wt-feat', filePath }])

    openFileMock.mockClear()
    storeState.openFiles = [{ filePath, worktreeId: 'wt-feat' }]
    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-vendor',
      worktreePath: '/repo/.orca/worktrees/feat-x/vendor',
      runtimeEnvironmentId: 'env-1'
    })
    await flushDoubleRaf()

    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: 'a.ts',
        worktreeId: 'wt-vendor',
        runtimeEnvironmentId: 'env-1'
      }),
      { forceContentReload: true }
    )
    expect(openFileMock.mock.calls[0]?.[0]).not.toHaveProperty('readOnly')
  })

  it('opens a remote html file in the clicked workspace editor when the real preview plan is outside the worktree', async () => {
    const filePath = '/home/me/.answer-me-with-html/pages/x.html'
    // 替身类型没有 repos；真实预览计划要从仓库读连接，运行时仍挂上。
    Object.assign(storeState, {
      repos: [
        {
          id: 'runtime-repo',
          displayName: 'Runtime',
          connectionId: null,
          executionHostId: 'runtime:env-1'
        }
      ]
    })
    storeState.worktreesByRepo = {
      'runtime-repo': [
        {
          id: 'wt-feat',
          repoId: 'runtime-repo',
          path: '/repo/.orca/worktrees/feat-x',
          hostId: 'runtime:env-1'
        }
      ]
    }
    expect(realPlan('wt-feat', filePath)).toMatchObject({
      status: 'unsupported',
      reason: 'outside-worktree'
    })
    previewPlan.mockImplementation((state: never, worktreeId: string, path: string) =>
      realPreviewPlan.current?.(state, worktreeId, path)
    )
    openPreview.mockReturnValue({ status: 'doc-preview' })
    hostAnswers({
      worktree: 'folder:home',
      relativePath: '.answer-me-with-html/pages/x.html',
      absolutePath: filePath,
      exists: true,
      isDirectory: false
    })

    openDetectedFilePath(filePath, null, null, featureWorktree)
    await flushDoubleRaf()

    expect(previewPlan).toHaveBeenCalled()
    expect(openPreview).not.toHaveBeenCalled()
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-feat',
        runtimeEnvironmentId: 'env-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
  })

  it('opens a remote SSH html path as source because the external target skips a doc preview', async () => {
    const filePath = '/home/me/.answer-me-with-html/pages/x.html'
    vi.mocked(getConnectionId).mockImplementation((worktreeId) =>
      worktreeId === 'wt-ssh' ? 'ssh-1' : null
    )
    findWorkspaceFileRouteMock.mockReturnValue(HOME_ROUTE)
    // 替身类型没有 repos；真实预览计划要从仓库读连接，运行时仍挂上。
    Object.assign(storeState, {
      repos: [
        {
          id: 'repo-ssh',
          displayName: 'SSH',
          connectionId: 'ssh-1',
          executionHostId: 'ssh:ssh-1'
        }
      ]
    })
    storeState.worktreesByRepo = {
      'repo-ssh': [
        {
          id: 'wt-ssh',
          repoId: 'repo-ssh',
          path: '/home/me/project',
          hostId: 'ssh:ssh-1'
        }
      ]
    }
    expect(realPlan('wt-ssh', filePath)).toEqual({ status: 'doc-preview' })
    previewPlan.mockImplementation((state: never, worktreeId: string, path: string) =>
      realPreviewPlan.current?.(state, worktreeId, path)
    )
    openPreview.mockReturnValue({ status: 'doc-preview' })

    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-ssh',
      worktreePath: '/home/me/project'
    })
    await flushDoubleRaf()

    expect(previewPlan).not.toHaveBeenCalled()
    expect(openPreview).not.toHaveBeenCalled()
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        relativePath: filePath,
        worktreeId: 'wt-ssh',
        externalSshTargetId: 'ssh-1',
        readOnly: true
      }),
      { forceContentReload: true }
    )
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
