import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'
import zh from './zh.json'

type Catalog = Record<string, unknown>

// SAFETY: both locale files are JSON objects keyed by string.
const upstreamEn = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/en.json', 'utf8')
) as Catalog
// SAFETY: as above.
const upstreamZh = JSON.parse(
  readFileSync('src/renderer/src/i18n/locales/zh.json', 'utf8')
) as Catalog

// Every key fork code builds at runtime comes from one of these typed const lists (none today).
const KEY_LISTS: Record<string, Readonly<Record<string, string>>> = {}

function lookup(catalog: unknown, key: string): unknown {
  return (
    key
      .split('.')
      // SAFETY: a missing segment yields undefined, which the optional chain carries through.
      .reduce<unknown>((node, part) => (node as Catalog | undefined)?.[part], catalog)
  )
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
  const calls = () =>
    sourceFiles('src/fork').flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(/\bforkTranslate\(\s*([^,)]+)/g)]
        .filter((match) => !/^key: string$/.test(match[1].trim()))
        .map((match) => ({ file, text, arg: match[1].trim() }))
    })
  const literalKeys = () =>
    calls()
      .map(({ file, arg }) => ({ file, key: /^['"]([\w.-]+)['"]$/.exec(arg)?.[1] }))
      .filter((entry): entry is { file: string; key: string } => entry.key !== undefined)
  const resolvedKeys = () => [
    ...literalKeys().map(({ key }) => key),
    ...Object.values(KEY_LISTS).flatMap((list) => Object.values(list))
  ]
  const has = (catalogs: unknown[], key: string) =>
    catalogs.some((catalog) => typeof lookup(catalog, key) === 'string')

  it('every key is a string literal or comes from a typed const list, never a template literal', () => {
    const bad = calls()
      .filter(({ arg }) => !/^['"][\w.-]+['"]$/.test(arg))
      .filter(
        ({ arg, text }) =>
          arg.startsWith('`') ||
          arg.includes('+') ||
          !Object.keys(KEY_LISTS).some((name) =>
            new RegExp(`import \\{[^}]*\\b${name}\\b`).test(text)
          )
      )
      .map(({ file, arg }) => `${file}: ${arg}`)
    expect(bad).toEqual([])
    expect(literalKeys().length).toBeGreaterThan(20)
  })

  it('every resolved key has English and Chinese', () => {
    const keys = [...new Set(resolvedKeys())]
    expect(keys.filter((key) => !has([en, upstreamEn], key))).toEqual([])
    expect(keys.filter((key) => !has([zh, upstreamZh], key))).toEqual([])
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
        ? // SAFETY: the typeof/null check above narrows to a JSON object.
          Object.entries(value as Catalog).flatMap(([key, child]) =>
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
