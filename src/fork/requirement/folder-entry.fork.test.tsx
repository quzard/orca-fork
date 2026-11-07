// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requirementOverviewLayer } from '../../shared/fork-hooks/requirement-preview'

const { state } = vi.hoisted(() => ({
  state: {
    worktreesByRepo: {},
    folderWorkspaces: [
      {
        id: 'parent',
        name: 'requirement-alpha',
        folderPath: '/tmp/requirement-alpha',
        executionHostId: 'local' as const,
        isArchived: false
      }
    ],
    worktreeLineageById: {},
    workspaceLineageByChildKey: {},
    gitStatusByWorktree: {},
    prCache: {},
    agentStatusByPaneKey: {},
    tabsByWorktree: {},
    isNavigatingHistory: false,
    recordWorktreeVisit: vi.fn()
  }
}))

vi.mock('../../renderer/src/store', () => {
  const useAppStore = (selector?: (value: typeof state) => unknown) =>
    typeof selector === 'function' ? selector(state) : state
  useAppStore.getState = () => state
  return { useAppStore }
})

vi.mock('../../renderer/src/lib/worktree-activity-state', () => ({
  getLiveAgentStatusByWorktreeId: () => new Map()
}))

import { RequirementFolderEntry } from './folder-entry'
import { registerRequirementSurfaces } from './requirement-layer'

function PreviewHarness(): React.JSX.Element {
  const layer = requirementOverviewLayer()
  return (
    <div>
      <RequirementFolderEntry folderId="parent" />
      {isValidElement(layer) ? layer : null}
    </div>
  )
}

describe('requirement folder entry', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens dry run from a folder row when the profile has no lineage', () => {
    registerRequirementSurfaces()
    render(<PreviewHarness />)
    expect(screen.queryByRole('button', { name: 'Dry run' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Requirement' }))
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeTruthy()
    expect(screen.getAllByText('/tmp/requirement-alpha').length).toBeGreaterThan(0)
  })
})
