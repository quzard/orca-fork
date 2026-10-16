import { afterEach, describe, expect, it } from 'vitest'
import { folderLabel } from '../../shared/ai-vault-session-filters'
import { getLocalExecutionHostLabel, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  registerAiVaultCollapseNewGroups,
  requestAiVaultCollapseAll,
  resetAiVaultForkHooksForTests,
  setAiVaultCollapseAllHandler,
  shouldCollapseNewAiVaultGroups
} from '../../shared/fork-hooks/ai-vault'
import {
  hostHeaderKey,
  partitionAiVaultGroupsByHost,
  registerAiVaultListPresentation,
  visibleAiVaultGroups
} from './list-presentation'

afterEach(() => {
  resetAiVaultForkHooksForTests()
})

describe('history list presentation', () => {
  it('keeps the full directory and splits one folder across hosts', () => {
    registerAiVaultListPresentation()
    expect(folderLabel('/srv/wt/project/app')).toBe('/srv/wt/project/app')

    const groups = partitionAiVaultGroupsByHost([
      {
        key: 'folder:/srv/wt/project/app',
        label: '/srv/wt/project/app',
        sessions: [{ executionHostId: LOCAL_EXECUTION_HOST_ID }, { executionHostId: 'ssh:build-1' }]
      }
    ])

    expect(groups.map((group) => group.label)).toEqual([
      getLocalExecutionHostLabel(),
      '/srv/wt/project/app',
      'build-1',
      '/srv/wt/project/app'
    ])
    const hidden = visibleAiVaultGroups(groups, new Set([hostHeaderKey('ssh:build-1')]))
    expect(hidden.groups.map((group) => group.label)).toEqual([
      getLocalExecutionHostLabel(),
      '/srv/wt/project/app',
      'build-1'
    ])
    expect(hidden.hostHeaderCounts.get(hostHeaderKey('ssh:build-1'))).toBe(1)
  })

  it('leaves a search hit list flat and omits the host row for one host', () => {
    const search = partitionAiVaultGroupsByHost([
      {
        key: 'search-results',
        label: null,
        sessions: [{ executionHostId: LOCAL_EXECUTION_HOST_ID }, { executionHostId: 'ssh:build-1' }]
      }
    ])
    expect(search).toEqual([
      {
        key: 'search-results',
        label: null,
        sessions: [{ executionHostId: LOCAL_EXECUTION_HOST_ID }, { executionHostId: 'ssh:build-1' }]
      }
    ])

    const single = partitionAiVaultGroupsByHost([
      {
        key: 'folder:/srv/wt/project/app',
        label: '/srv/wt/project/app',
        sessions: [{ executionHostId: LOCAL_EXECUTION_HOST_ID }]
      }
    ])
    expect(single.map((group) => group.label)).toEqual(['/srv/wt/project/app'])
  })

  it('collapses new groups and can collapse them all', () => {
    registerAiVaultCollapseNewGroups(true)
    expect(shouldCollapseNewAiVaultGroups()).toBe(true)

    const collapsed: string[] = []
    setAiVaultCollapseAllHandler(() => collapsed.push('all'))
    requestAiVaultCollapseAll()
    expect(collapsed).toEqual(['all'])
  })

  it('keeps the short folder label until presentation is registered', () => {
    expect(folderLabel('/srv/wt/project/app')).toBe('project/app')
  })
})
