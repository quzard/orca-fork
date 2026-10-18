import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { searchMessageRows } from '../../../main/ai-vault-search/session-search-message-rows'
import { openSessionSearchDatabase } from '../../../main/ai-vault-search/session-search-schema'
import {
  registerAiVaultServiceHeap,
  registerAiVaultToolIndexPolicy,
  resetAiVaultForkHooksForTests
} from '../../../shared/fork-hooks/ai-vault'
import {
  resetStartupForkHooksForTests,
  registerDeferBrowserSessionProxy
} from '../../../shared/fork-hooks/startup'
import { applyStartupBrowserSessionProxies } from '../startup/browser-session-proxy'
import { aiVaultServiceHeapMiB } from './heap'
import { applyAiVaultForkServicePolicy, aiVaultForkServicePolicy } from './service-policy'

const MIB = 1024 * 1024
const GIB = 1024 * MIB

afterEach(() => {
  resetAiVaultForkHooksForTests()
  resetStartupForkHooksForTests()
})

describe('scan policy', () => {
  it('sizes the service heap from installed memory', () => {
    expect(aiVaultServiceHeapMiB(2 * GIB)).toBe(384)
    expect(aiVaultServiceHeapMiB(4 * GIB)).toBe(1024)
    expect(aiVaultServiceHeapMiB(16 * GIB)).toBe(2048)
    registerAiVaultServiceHeap(() => aiVaultServiceHeapMiB(16 * GIB))
    expect(aiVaultServiceHeapMiB(16 * GIB)).toBe(2048)
  })

  it('indexes a whole tool result in chunks and bumps the schema', async () => {
    const text = `${'alpha '.repeat(4000)}tail`
    expect(
      [...searchMessageRows([{ role: 'tool', text, timestamp: null }])][0]?.text.length
    ).toBeLessThanOrEqual(3072)

    applyAiVaultForkServicePolicy(aiVaultForkServicePolicy())
    const rows = [...searchMessageRows([{ role: 'tool', text, timestamp: null }])]
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.map((row) => row.text).join('')).toBe(text)

    const root = await mkdtemp(join(tmpdir(), 'orca-vault-schema-'))
    try {
      const db = openSessionSearchDatabase(join(root, 'index.sqlite'))
      const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()
      const value =
        version && typeof version === 'object' && 'value' in version ? version.value : undefined
      expect(value).toBe('7')
      db.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns the capped tool row when the fork policy is off', () => {
    registerAiVaultToolIndexPolicy('capped')
    const rows = [...searchMessageRows([{ role: 'tool', text: 'x'.repeat(9000), timestamp: null }])]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text.length).toBeLessThanOrEqual(3072)
  })

  it('does not block startup on the browser proxy apply', async () => {
    registerDeferBrowserSessionProxy(true)
    let settled = false
    await applyStartupBrowserSessionProxies(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            settled = true
            resolve(undefined)
          }, 30)
        })
    )
    expect(settled).toBe(false)
  })
})
