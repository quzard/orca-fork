import { totalmem } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiVaultMemoryBytes, aiVaultServiceHeapMiB } from './heap'

const MIB = 1024 * 1024
const GIB = 1024 * MIB

describe('AI Vault service heap follows the memory the process may use', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses installed memory when there is no limit', () => {
    expect(aiVaultMemoryBytes(16 * GIB, 0)).toBe(16 * GIB)
    expect(aiVaultMemoryBytes(16 * GIB, Number.NaN)).toBe(16 * GIB)
  })

  it('uses a container limit below installed memory', () => {
    expect(aiVaultMemoryBytes(64 * GIB, 4 * GIB)).toBe(4 * GIB)
    expect(aiVaultServiceHeapMiB(aiVaultMemoryBytes(64 * GIB, 4 * GIB))).toBe(1024)
    // A limit at or above installed memory changes nothing (cgroup v2 reports "max" as a huge number).
    expect(aiVaultMemoryBytes(8 * GIB, 2 ** 63)).toBe(8 * GIB)
  })

  it('keeps the upstream floor and the 2048 MiB cap under a limit', () => {
    expect(aiVaultServiceHeapMiB(aiVaultMemoryBytes(64 * GIB, 1 * GIB))).toBe(384)
    expect(aiVaultServiceHeapMiB(aiVaultMemoryBytes(64 * GIB, 32 * GIB))).toBe(2048)
  })

  it('reads process.constrainedMemory() by default', () => {
    vi.spyOn(process, 'constrainedMemory').mockReturnValue(3 * GIB)
    expect(aiVaultMemoryBytes()).toBe(Math.min(totalmem(), 3 * GIB))
    expect(aiVaultServiceHeapMiB()).toBe(aiVaultServiceHeapMiB(Math.min(totalmem(), 3 * GIB)))
  })
})
