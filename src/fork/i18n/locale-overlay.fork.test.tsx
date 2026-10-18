import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { i18n, translate } from '@/i18n/i18n'
import { installForkLocaleOverlays } from './locale-overlay'
import zh from './zh.json'

type Catalog = Record<string, unknown>

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix]
  }
  return Object.entries(value as Catalog).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

function lookup(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Catalog | undefined)?.[part], catalog)
}

const en = JSON.parse(readFileSync('src/renderer/src/i18n/locales/en.json', 'utf8')) as Catalog
const upstreamZh = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/zh.json', 'utf8')
) as Catalog

describe('fork zh overlay', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('translates every fork-added key the upstream zh catalog lacks', () => {
    // Fork keys live under these roots in en.json; the overlay must cover each English leaf.
    const forkRoots = ['fork', 'sshConnectionStatus', 'workspaceImport']
    const englishForkKeys = forkRoots.flatMap((root) => leafKeys(en[root], root))
    const missingUpstream = englishForkKeys.filter((key) => lookup(upstreamZh, key) === undefined)
    expect(missingUpstream.length).toBeGreaterThan(0)
    for (const key of missingUpstream) {
      expect(lookup(zh, key), key).toEqual(expect.any(String))
    }
    // No stray overlay keys that English does not have.
    expect(leafKeys(zh).filter((key) => lookup(en, key) === undefined)).toEqual([])
  })

  it('keeps every interpolation placeholder of the English string', () => {
    for (const key of leafKeys(zh)) {
      const placeholders = (text: unknown): string[] =>
        String(text)
          .match(/\{\{\s*\w+\s*\}\}/g)
          ?.toSorted() ?? []
      expect(placeholders(lookup(zh, key)), key).toEqual(placeholders(lookup(en, key)))
    }
  })

  it('shows the Chinese strings once the lazy zh catalog loads, without hiding upstream ones', async () => {
    installForkLocaleOverlays(i18n)
    await i18n.changeLanguage('zh')
    expect(translate('sshConnectionStatus.connecting', 'Connecting\u2026')).toBe('正在连接…')
    expect(translate('fork.workspaceRemoval.menu', 'Remove from Orca')).toBe('从 Orca 移除')
    expect(translate('fork.sidebar.archivedWorkspaces', 'Removed', { value0: 3 })).toBe(
      '已从 Orca 移除（3）'
    )
    // An upstream zh string is still upstream's.
    const upstreamKey = leafKeys(upstreamZh).find((key) => key.startsWith('auto.'))!
    expect(translate(upstreamKey, 'x')).toBe(lookup(upstreamZh, upstreamKey))
  })

  it('never overwrites a key the loaded catalog already has', async () => {
    const instance = i18n.cloneInstance()
    instance.addResourceBundle('fr', 'translation', { sshConnectionStatus: { connected: 'up' } })
    installForkLocaleOverlays(instance, {
      fr: { sshConnectionStatus: { connected: 'overlay', connecting: 'overlay2' } }
    })
    expect(instance.getResource('fr', 'translation', 'sshConnectionStatus.connected')).toBe('up')
    expect(instance.getResource('fr', 'translation', 'sshConnectionStatus.connecting')).toBe(
      'overlay2'
    )
  })
})
