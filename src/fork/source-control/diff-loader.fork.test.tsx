// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import {
  useEditorPanelDiffContentLoader,
  type EditorPanelDiffContentLoader
} from '@/components/editor/useEditorPanelDiffContentLoader'
import {
  registerWorkspaceRepositoryDiff,
  resetWorkspaceRepositoryDiffForTests
} from '../../shared/fork-hooks/workspace-repository-diff'
import {
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD
} from '../git-workspace/constants'
import {
  clearDiscoveredRepositoriesForTests,
  rememberDiscoveredRepositories
} from './discovered-repos'
import { readNestedRepositoryDiff } from './diff-read'

const OID = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const MERGE = 'c'.repeat(40)

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  getRuntimeGitDiff: vi.fn(),
  getRuntimeGitBranchDiff: vi.fn(),
  getRuntimeGitCommitDiff: vi.fn(),
  getState: vi.fn(() => ({}))
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

vi.mock('@/runtime/runtime-git-diff-client', () => ({
  getRuntimeGitDiff: mocks.getRuntimeGitDiff,
  getRuntimeGitBranchDiff: mocks.getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff: mocks.getRuntimeGitCommitDiff
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => mocks.getState(), { getState: mocks.getState })
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionIdForFile: () => undefined
}))

vi.mock('@/lib/file-owner-runtime-target', () => ({
  requireRuntimeTargetForFileOwner: () => ({ kind: 'local' })
}))

const diffBody = {
  kind: 'text',
  originalContent: '',
  modifiedContent: 'body',
  originalIsBinary: false,
  modifiedIsBinary: false,
  largeDiffRenderLimit: { bytes: 1 }
}

function file(overrides: Partial<OpenFile>): OpenFile {
  return {
    id: 'file-1',
    filePath: '/ws/README.md',
    relativePath: 'README.md',
    worktreeId: 'wt-1',
    language: 'markdown',
    isDirty: false,
    mode: 'diff',
    diffSource: 'unstaged',
    ...overrides
  }
}

describe('nested repository diff hook', () => {
  let container: HTMLDivElement
  let root: Root
  let load: EditorPanelDiffContentLoader | null

  beforeEach(() => {
    clearDiscoveredRepositoriesForTests()
    resetWorkspaceRepositoryDiffForTests()
    registerWorkspaceRepositoryDiff(readNestedRepositoryDiff)
    rememberDiscoveredRepositories('wt-1', [
      {
        repositoryPath: 'libs/core',
        kind: 'nested',
        uninitialized: false,
        depth: 2,
        realPath: '/ws/libs/core'
      }
    ])
    mocks.callRuntimeRpc.mockReset()
    mocks.callRuntimeRpc.mockResolvedValue(diffBody)
    mocks.getRuntimeGitDiff.mockReset()
    mocks.getRuntimeGitDiff.mockResolvedValue(diffBody)
    mocks.getRuntimeGitBranchDiff.mockReset()
    mocks.getRuntimeGitBranchDiff.mockResolvedValue(diffBody)
    mocks.getRuntimeGitCommitDiff.mockReset()
    mocks.getRuntimeGitCommitDiff.mockResolvedValue(diffBody)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    load = null
    function Harness(): null {
      load = useEditorPanelDiffContentLoader({
        diffReadGenerationCounterRef: { current: 0 },
        diffReadGenerationRef: { current: {} },
        outstandingDiffReadsRef: { current: {} },
        setDiffContents: () => undefined
      })
      return null
    }
    act(() => root.render(<Harness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetWorkspaceRepositoryDiffForTests()
    clearDiscoveredRepositoriesForTests()
  })

  it('reads a nested path through the fork diff method', async () => {
    await act(async () => {
      await load!(
        file({
          filePath: '/ws/libs/core/src/a.ts',
          relativePath: 'libs/core/src/a.ts',
          language: 'typescript'
        })
      )
    })
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_DIFF_METHOD,
      expect.objectContaining({ repositoryPath: 'libs/core', filePath: 'src/a.ts', staged: false }),
      {}
    )
    expect(mocks.getRuntimeGitDiff).not.toHaveBeenCalled()
  })

  it('leaves a root file on the upstream diff', async () => {
    await act(async () => {
      await load!(file({}))
    })
    expect(mocks.getRuntimeGitDiff).toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('does not take over a commit diff', async () => {
    await act(async () => {
      await load!(
        file({
          filePath: '/ws/libs/core/src/a.ts',
          relativePath: 'libs/core/src/a.ts',
          diffSource: 'commit',
          commitCompare: {
            commitOid: OID,
            parentOid: BASE,
            compareRef: 'feature',
            baseRef: 'main',
            compareVersion: '1'
          }
        })
      )
    })
    expect(mocks.getRuntimeGitCommitDiff).toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('discovers a nested file before reading its diff when the cache is cold', async () => {
    clearDiscoveredRepositoriesForTests()
    mocks.callRuntimeRpc.mockImplementation(async (_target: unknown, method: string) => {
      if (method === FORK_GIT_WORKSPACE_REPOSITORIES_METHOD) {
        return {
          repositories: [
            {
              repositoryPath: 'libs/core',
              kind: 'nested',
              uninitialized: false,
              depth: 2,
              realPath: '/ws/libs/core'
            }
          ],
          truncated: false,
          timedOut: false
        }
      }
      return diffBody
    })
    await act(async () => {
      await load!(
        file({
          filePath: '/ws/libs/core/src/a.ts',
          relativePath: 'libs/core/src/a.ts'
        })
      )
    })
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      expect.objectContaining({ worktree: 'id:wt-1', refresh: false }),
      {}
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_DIFF_METHOD,
      expect.objectContaining({ repositoryPath: 'libs/core', filePath: 'src/a.ts' }),
      {}
    )
    expect(mocks.getRuntimeGitDiff).not.toHaveBeenCalled()
  })

  it('keeps a root file on the upstream diff after a cold discovery', async () => {
    clearDiscoveredRepositoriesForTests()
    mocks.callRuntimeRpc.mockResolvedValue({
      repositories: [
        {
          repositoryPath: 'libs/core',
          kind: 'nested',
          uninitialized: false,
          depth: 2,
          realPath: '/ws/libs/core'
        }
      ],
      truncated: false,
      timedOut: false
    })
    await act(async () => {
      await load!(file({ id: 'file-2' }))
    })
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      expect.objectContaining({ worktree: 'id:wt-1' }),
      {}
    )
    expect(mocks.getRuntimeGitDiff).toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_DIFF_METHOD,
      expect.anything(),
      expect.anything()
    )
  })

  it('reads a nested branch diff through the fork method', async () => {
    await act(async () => {
      await load!(
        file({
          filePath: '/ws/libs/core/src/a.ts',
          relativePath: 'libs/core/src/a.ts',
          diffSource: 'branch',
          branchCompare: {
            baseRef: 'origin/main',
            baseOid: BASE,
            compareRef: 'feature',
            headOid: OID,
            mergeBase: MERGE,
            compareVersion: '1'
          }
        })
      )
    })
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
      expect.objectContaining({
        repositoryPath: 'libs/core',
        filePath: 'src/a.ts',
        compare: expect.objectContaining({ headOid: OID, mergeBase: MERGE })
      }),
      {}
    )
    expect(mocks.getRuntimeGitBranchDiff).not.toHaveBeenCalled()
  })
})
