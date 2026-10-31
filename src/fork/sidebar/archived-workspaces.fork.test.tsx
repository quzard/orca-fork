// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'

const mocks = vi.hoisted(() => ({
  state: {
    repos: [] as Repo[],
    worktreesByRepo: {} as Record<string, Worktree[]>,
    updateWorktreeMeta: vi.fn(async () => ({ ok: true }))
  }
}))

vi.mock('../../renderer/src/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))

import { renderVisibilityArchivedSlot } from '../../shared/fork-hooks/sidebar-chrome'
import { registerArchivedWorkspaceSlot } from './archived-workspaces'

function repo(id: string, extra: Partial<Repo> = {}): Repo {
  return { id, path: `/srv/${id}`, displayName: id, badgeColor: '#000', addedAt: 0, ...extra }
}

function archived(id: string, repoId: string, hostId?: Worktree['hostId']): Worktree {
  return {
    id,
    repoId,
    path: `/srv/${repoId}/${id}`,
    branch: `refs/heads/${id}`,
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: true,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0,
    ...(hostId ? { hostId } : {})
  }
}

describe('removed-from-Orca list in the visibility dialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('lists a row under its own project host, not the dialog project host', () => {
    const remote = repo('remote', { connectionId: 'box' })
    const local = repo('local-repo')
    mocks.state.repos = [remote, local]
    mocks.state.worktreesByRepo = {
      remote: [archived('on-box', 'remote', 'ssh:box')],
      'local-repo': [archived('on-mac', 'local-repo')]
    }
    registerArchivedWorkspaceSlot()

    render(<>{renderVisibilityArchivedSlot({ repo: remote, hostId: 'ssh:box' })}</>)

    expect(screen.getByText('on-box')).toBeInTheDocument()
    expect(screen.queryByText('on-mac')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(mocks.state.updateWorktreeMeta).toHaveBeenCalledWith(
      'on-box',
      { isArchived: false },
      { executionHostId: 'ssh:box' }
    )
  })
})
