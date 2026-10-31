import { describe, expect, it } from 'vitest'
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId
} from '../../shared/execution-host'
import { otherVaultHosts, splitVaultHostMenu } from './host-menu'

const [withSessions, active, connected, idle, picked] = ['a', 'b', 'c', 'd', 'e'].map((id) =>
  toRuntimeExecutionHostId(`env-${id}`)
)
const options = [
  { id: ALL_EXECUTION_HOSTS_SCOPE, label: 'All hosts' },
  { id: LOCAL_EXECUTION_HOST_ID, label: 'Local Mac' },
  { id: withSessions, label: 'with sessions' },
  { id: active, label: 'active' },
  { id: connected, label: 'connected' },
  { id: idle, label: 'idle' },
  { id: picked, label: 'picked' }
]
const context = {
  historyHostIds: new Set([withSessions]),
  activeHostId: active,
  connectedHostIds: new Set([connected])
}

describe('splitVaultHostMenu', () => {
  it('folds idle hosts and keeps all, local, active, connected, selected and hosts with sessions', () => {
    const menu = splitVaultHostMenu(options, { ...context, selected: picked })
    expect(menu.map((option) => option.label)).toEqual([
      'All hosts',
      'Local Mac',
      'with sessions',
      'active',
      'connected',
      'picked'
    ])
    expect(otherVaultHosts(menu).map((option) => option.label)).toEqual(['idle'])
  })

  it('returns the list itself when nothing folds', () => {
    const busy = options.slice(0, 5)
    const menu = splitVaultHostMenu(busy, { ...context, selected: 'all' })
    expect(menu).toBe(busy)
    expect(otherVaultHosts(menu)).toEqual([])
  })
})
