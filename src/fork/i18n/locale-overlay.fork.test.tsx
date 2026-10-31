import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { i18n, translate } from '@/i18n/i18n'
import { installForkLocaleOverlays } from './locale-overlay'
import en from './en.json'
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

const upstreamEn = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/en.json', 'utf8')
) as Catalog
const upstreamZh = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/zh.json', 'utf8')
) as Catalog

describe('fork zh overlay', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('keeps fork English out of upstream en.json, in the fork overlay instead', () => {
    const forkKeys = leafKeys(en)
    expect(forkKeys.length).toBeGreaterThan(0)
    expect(forkKeys.filter((key) => lookup(upstreamEn, key) !== undefined)).toEqual([])
  })

  it('translates every fork English key the upstream zh catalog lacks', () => {
    const missingUpstream = leafKeys(en).filter((key) => lookup(upstreamZh, key) === undefined)
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
    expect(translate('fork.workspaceRemoval.menu', 'Remove from Orca')).toBe('从 Orca 移除')
    expect(translate('fork.sidebar.archivedWorkspaces', 'Removed', { value0: 3 })).toBe(
      '已从 Orca 移除（3）'
    )
    // An upstream zh string is still upstream's.
    const upstreamKey = leafKeys(upstreamZh).find((key) => key.startsWith('auto.'))!
    expect(translate(upstreamKey, 'x')).toBe(lookup(upstreamZh, upstreamKey))
  })

  it('serves fork English from the overlay, including strings with a dynamic default', async () => {
    installForkLocaleOverlays(i18n)
    await i18n.changeLanguage('en')
    expect(i18n.getResource('en', 'translation', 'fork.sidebar.groupRollbackFailed')).toBe(
      '{{error}} Could not put back: {{names}}.'
    )
    expect(i18n.getResource('en', 'translation', 'fork.workspaceRemoval.undo')).toBe('Undo')
  })

  it('never overwrites a key the loaded catalog already has', async () => {
    const instance = i18n.cloneInstance()
    instance.addResourceBundle('fr', 'translation', { fork: { sample: { kept: 'up' } } })
    installForkLocaleOverlays(instance, {
      fr: { fork: { sample: { kept: 'overlay', added: 'overlay2' } } }
    })
    expect(instance.getResource('fr', 'translation', 'fork.sample.kept')).toBe('up')
    expect(instance.getResource('fr', 'translation', 'fork.sample.added')).toBe('overlay2')
  })
})
