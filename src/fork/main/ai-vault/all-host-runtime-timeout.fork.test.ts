import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer } from '../../../shared/pairing'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { addManagedOrcadEnvironment } from '../../../shared/runtime-environment-managed-orcad-store'
import { addEnvironmentFromPairingCode } from '../../../shared/runtime-environment-store'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  scanLocalSessions: vi.fn(),
  scanRuntime: vi.fn()
}))

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => mocks.userDataPath },
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../../../main/ai-vault/session-scanner-service-spawn', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  scanAiVaultSessionsInService: mocks.scanLocalSessions
}))

vi.mock('../../../main/wsl', () => ({
  listRunningWslDistrosAsync: vi.fn().mockResolvedValue([]),
  listRunningWslHomeDirsAsync: vi.fn().mockResolvedValue([]),
  hasCachedWslDistros: vi.fn(() => false)
}))

const { _internals, registerAiVaultHandlers } = await import('../../../main/ipc/ai-vault')
const { forkAiVaultAllHostRuntimeTimeout } = await import('./all-host-runtime-timeout')

const pairingCode = (endpoint: string, keyByte: number) =>
  encodePairingOffer({
    v: 2,
    endpoint,
    deviceToken: `token-${keyByte}`,
    publicKeyB64: Buffer.alloc(32, keyByte).toString('base64')
  })
const empty = { sessions: [], issues: [], scannedAt: 0, scanDurationMs: 0 }

describe('AI Vault all-hosts runtime budget', () => {
  beforeEach(() => {
    mocks.userDataPath = mkdtempSync(join(tmpdir(), 'orca-fork-aivault-budget-'))
    _internals.resetAiVaultCacheForTests()
    mocks.scanLocalSessions.mockReset().mockResolvedValue(empty)
    mocks.scanRuntime.mockReset().mockResolvedValue(empty)
  })
  afterEach(() => rmSync(mocks.userDataPath, { recursive: true, force: true }))

  it('gives SSH-tunnelled servers the 15s relay budget and keeps direct ones on 3s', async () => {
    addManagedOrcadEnvironment(mocks.userDataPath, {
      id: 'new-sls',
      name: 'new_sls',
      pairingCode: pairingCode('ws://127.0.0.1:46768', 1),
      orcadDeployment: {
        sshTargetId: 'ssh-1',
        sshTargetGeneration: 1,
        localPort: 46_768,
        remotePort: 6_768
      },
      now: 100
    })
    const direct = addEnvironmentFromPairingCode(mocks.userDataPath, {
      name: 'lan',
      pairingCode: pairingCode('ws://100.64.0.7:6768', 2),
      now: 100
    })
    const hostInfos = ['new-sls', direct.id, 'unknown'].map((environmentId) => ({
      environmentId,
      executionHostId: toRuntimeExecutionHostId(environmentId)
    }))
    registerAiVaultHandlers({
      getActiveRuntimeAiVaultHostInfos: () => hostInfos,
      scanRuntimeAiVaultSessions: mocks.scanRuntime
    })

    await _internals.listAiVaultSessions({ executionHostScope: 'all', force: true })

    const budgets = Object.fromEntries(
      mocks.scanRuntime.mock.calls.map(([environmentId, , options]) => [
        environmentId,
        options?.timeoutMs
      ])
    )
    expect(budgets).toEqual({ 'new-sls': 15_000, [direct.id]: 3_000, unknown: 3_000 })
  })

  it('falls back to the upstream 3s when the environment store cannot be read', () => {
    expect(
      forkAiVaultAllHostRuntimeTimeout({ environmentId: 'x' }, () => {
        throw new Error('unreadable')
      })
    ).toBe(3_000)
  })
})
