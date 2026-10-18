import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'

type Catalog = Record<string, unknown>

const upstreamEn = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/en.json', 'utf8')
) as Catalog

function lookup(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Catalog | undefined)?.[part], catalog)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return /\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

// Fork code calls forkTranslate, which upstream's extraction check (config/i18next.config.ts) does not
// match, so this takes its place for fork keys.
describe('fork translation keys', () => {
  it('every literal key fork code translates has English in the fork overlay or upstream', () => {
    const keys = sourceFiles('src/fork').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bforkTranslate\(\s*['"]([\w.-]+)['"]/g)].map(
        (match) => ({ file, key: match[1] })
      )
    )
    expect(keys.length).toBeGreaterThan(20)
    const missing = keys.filter(
      ({ key }) => typeof (lookup(en, key) ?? lookup(upstreamEn, key)) !== 'string'
    )
    expect(missing).toEqual([])
  })

  it('fork code does not call translate directly, so the upstream extraction never sees fork keys', () => {
    const direct = sourceFiles('src/fork')
      .filter((file) => !file.endsWith('fork-translate.tsx'))
      .filter((file) => /(?<![\w.])translate\(/.test(readFileSync(file, 'utf8')))
    expect(direct).toEqual([])
  })

  it('upstream files translate no fork key, so upstream en.json needs none', () => {
    const leafKeys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value as Catalog).flatMap(([key, child]) =>
            leafKeys(child, prefix ? `${prefix}.${key}` : key)
          )
        : [prefix]
    const forkKeys = new Set(leafKeys(en))
    const offenders = ['src/renderer/src', 'src/main']
      .flatMap((dir) => sourceFiles(dir))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/\btranslate\(\s*['"]([\w.-]+)['"]/g)]
          .filter((match) => forkKeys.has(match[1]))
          .map((match) => `${file}: ${match[1]}`)
      )
    expect(offenders).toEqual([])
  })
})
