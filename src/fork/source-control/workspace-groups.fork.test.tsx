// @vitest-environment happy-dom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBranchCompareResult } from '../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../shared/git-status-types'
import {
  SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY,
  SOURCE_CONTROL_ONLY_CHANGED_TEST_ID,
  SOURCE_CONTROL_REPO_OTHER_TEST_ID,
  SOURCE_CONTROL_REPO_TEST_ID
} from '../git-workspace/constants'
import type { WorkspaceRepositoryRecord, WorkspaceRepositoryStatus } from '../git-workspace/types'
import { WorkspaceRepositoryGroups } from './workspace-view'

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

vi.mock('@/lib/workspace-file-open', () => ({
  openWorkspaceFile: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => ({}), { getState: () => ({}) })
}))

function entry(path: string): GitStatusEntry {
  return { path, status: 'modified', area: 'unstaged' }
}

function record(
  repositoryPath: string,
  extra: Partial<WorkspaceRepositoryRecord> = {}
): WorkspaceRepositoryRecord {
  return {
    repositoryPath,
    kind: repositoryPath ? 'nested' : 'root',
    uninitialized: false,
    depth: repositoryPath ? 1 : 0,
    realPath: `/ws/${repositoryPath}`,
    ...extra
  }
}

function status(repositoryPath: string, paths: readonly string[]): WorkspaceRepositoryStatus {
  return {
    repositoryPath,
    uninitialized: false,
    branch: 'refs/heads/feature',
    head: 'abc',
    entries: paths.map(entry),
    compareTarget: { ref: 'origin/main', source: 'default' },
    baseOid: 'def'
  }
}

function compare(ahead: number, behind: number): GitBranchCompareResult {
  return {
    summary: {
      baseRef: 'origin/main',
      baseOid: 'def',
      compareRef: 'HEAD',
      headOid: 'abc',
      mergeBase: 'def',
      changedFiles: ahead,
      commitsAhead: ahead,
      commitsBehind: behind,
      status: 'ready'
    },
    entries: []
  }
}

function groups(args: {
  statuses: Record<string, WorkspaceRepositoryStatus>
  compares: Record<string, GitBranchCompareResult>
  extra?: WorkspaceRepositoryRecord[]
}) {
  return (
    <WorkspaceRepositoryGroups
      list={{
        repositories: [
          record(''),
          record('demo-api'),
          record('demo-web'),
          record('demo-empty', { kind: 'submodule', uninitialized: true }),
          ...(args.extra ?? [])
        ],
        truncated: false,
        timedOut: false
      }}
      statuses={args.statuses}
      compares={args.compares}
      worktreeId="wt-1"
      worktreePath="/ws"
      onCommitTarget={() => undefined}
      onRefresh={() => undefined}
    />
  )
}

const clean = {
  statuses: {
    '': status('', []),
    'demo-api': status('demo-api', []),
    'demo-web': status('demo-web', ['a.ts', 'b.ts'])
  },
  compares: {
    '': compare(0, 0),
    'demo-api': compare(0, 2),
    'demo-web': compare(3, 1)
  }
}

describe('workspace repository groups', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.clear()
  })

  async function render(node: ReactElement): Promise<void> {
    await act(async () => {
      root.render(node)
    })
  }

  function repoPaths(): string[] {
    return [...container.querySelectorAll(`[data-testid="${SOURCE_CONTROL_REPO_TEST_ID}"]`)].map(
      (node) => node.getAttribute('data-repository-path') ?? ''
    )
  }

  function header(path: string): HTMLButtonElement {
    const section = container.querySelector(`[data-repository-path="${path}"]`)
    const button = section?.querySelector('button')
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(path)
    }
    return button
  }

  it('pins the root, sorts changed repositories first, and expands only those', async () => {
    await render(groups(clean))
    expect(repoPaths()).toEqual(['.', 'demo-web', 'demo-api'])
    expect(header('.').getAttribute('aria-expanded')).toBe('false')
    expect(header('demo-web').getAttribute('aria-expanded')).toBe('true')
    expect(header('demo-api').getAttribute('aria-expanded')).toBe('false')
    expect(header('demo-web').textContent).toContain('2 changed')
    expect(header('demo-web').textContent).toContain('3 ahead, 1 behind')
    expect(header('demo-api').textContent).toContain('0 changed')
    expect(header('demo-api').textContent).toContain('0 ahead, 2 behind')
    expect(container.querySelector(`[data-repository-path="demo-empty"]`)).toBeNull()
    const other = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_REPO_OTHER_TEST_ID}"] button`
    ) as HTMLButtonElement
    expect(other.getAttribute('aria-expanded')).toBe('false')
    expect(other.textContent).toContain('Other')
    await act(async () => {
      other.click()
    })
    expect(other.getAttribute('aria-expanded')).toBe('true')
    expect(
      container.querySelector(`[data-testid="${SOURCE_CONTROL_REPO_OTHER_TEST_ID}"]`)?.textContent
    ).toContain('demo-empty')
  })

  it('keeps order when only the change count moves, and does not collapse a manual expand', async () => {
    await render(groups(clean))
    await act(async () => {
      header('demo-api').click()
    })
    expect(header('demo-api').getAttribute('aria-expanded')).toBe('true')
    await render(
      groups({
        statuses: {
          ...clean.statuses,
          'demo-web': status('demo-web', ['a.ts', 'b.ts', 'c.ts'])
        },
        compares: clean.compares
      })
    )
    expect(repoPaths()).toEqual(['.', 'demo-web', 'demo-api'])
    expect(header('demo-api').getAttribute('aria-expanded')).toBe('true')
    expect(header('demo-web').textContent).toContain('3 changed')
  })

  it('reorders when the set of changed repositories changes, and collapses an auto-opened group', async () => {
    await render(groups(clean))
    await render(
      groups({
        statuses: {
          ...clean.statuses,
          'demo-api': status('demo-api', ['note.txt'])
        },
        compares: clean.compares
      })
    )
    expect(repoPaths()).toEqual(['.', 'demo-api', 'demo-web'])
    expect(header('demo-api').getAttribute('aria-expanded')).toBe('true')
    await render(
      groups({
        statuses: {
          '': status('', []),
          'demo-api': status('demo-api', []),
          'demo-web': status('demo-web', [])
        },
        compares: {
          '': compare(0, 0),
          'demo-api': compare(0, 0),
          'demo-web': compare(0, 0)
        }
      })
    )
    expect(repoPaths()).toEqual(['.', 'demo-api', 'demo-web'])
    expect(header('demo-web').getAttribute('aria-expanded')).toBe('false')
    expect(header('demo-api').getAttribute('aria-expanded')).toBe('false')
  })

  it('remembers only-show-changed and hides repositories known to be clean', async () => {
    await render(
      groups({
        ...clean,
        extra: [record('demo-console')]
      })
    )
    const toggle = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_ONLY_CHANGED_TEST_ID}"]`
    ) as HTMLButtonElement
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      toggle.click()
    })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY)).toBe('1')
    // 还没有状态的 demo-console 先留着。确定没有改动的根仓库和 demo-api 去掉。「其他」也去掉。
    expect(repoPaths()).toEqual(['demo-web', 'demo-console'])
    expect(container.querySelector(`[data-testid="${SOURCE_CONTROL_REPO_OTHER_TEST_ID}"]`)).toBeNull()
    act(() => root.unmount())
    root = createRoot(container)
    await render(groups(clean))
    expect(
      container
        .querySelector(`[data-testid="${SOURCE_CONTROL_ONLY_CHANGED_TEST_ID}"]`)
        ?.getAttribute('aria-pressed')
    ).toBe('true')
    expect(repoPaths()).toEqual(['demo-web'])
  })
})
