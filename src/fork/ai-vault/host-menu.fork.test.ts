import { describe, expect, it } from 'vitest'
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId
} from '../../shared/execution-host'
import { markSecondaryVaultHosts } from './host-menu'

describe('markSecondaryVaultHosts', () => {
  it('folds idle hosts and keeps all, local, active, connected and hosts with sessions', () => {
    const [withSessions, active, connected, idle] = ['a', 'b', 'c', 'd'].map((id) =>
      toRuntimeExecutionHostId(`env-${id}`)
    )
    const marked = markSecondaryVaultHosts(
      [
        { id: ALL_EXECUTION_HOSTS_SCOPE, label: 'All hosts' },
        { id: LOCAL_EXECUTION_HOST_ID, label: 'Local Mac' },
        { id: withSessions, label: 'with sessions' },
        { id: active, label: 'active' },
        { id: connected, label: 'connected' },
        { id: idle, label: 'idle' }
      ],
      {
        historyHostIds: new Set([withSessions]),
        activeHostId: active,
        connectedHostIds: new Set([connected])
      }
    )
    expect(marked.filter((option) => option.secondary).map((option) => option.label)).toEqual([
      'idle'
    ])
  })
})
