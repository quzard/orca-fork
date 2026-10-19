import { describe, expect, it } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID, toSshExecutionHostId } from '../../shared/execution-host'
import { markSecondaryVaultHosts } from './host-menu'

describe('markSecondaryVaultHosts', () => {
  it('folds idle disconnected hosts and keeps the active, local, and connected ones', () => {
    const devbox = toSshExecutionHostId('devbox')
    const mini = toSshExecutionHostId('mini')
    const marked = markSecondaryVaultHosts(
      [
        { id: 'all', label: 'All' },
        { id: LOCAL_EXECUTION_HOST_ID, label: 'This computer' },
        { id: devbox, label: 'devbox' },
        { id: mini, label: 'mini' }
      ],
      {
        historyHostIds: new Set([devbox]),
        activeHostId: null,
        connectedSshTargetIds: new Set<string>()
      }
    )
    expect(marked.map((option) => [option.label, option.secondary ?? false])).toEqual([
      ['All', false],
      ['This computer', false],
      ['devbox', false],
      ['mini', true]
    ])
  })
})
