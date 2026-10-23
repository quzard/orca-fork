// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import zh from '../i18n/zh.json'

function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    return prefix ? { [prefix]: value } : {}
  }
  if (!value || typeof value !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key))
    )
  )
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort()
}

describe('workspace repository copy', () => {
  it('has the same English and Chinese keys and placeholders', () => {
    const english = leaves(en.fork.sourceControl, 'fork.sourceControl')
    const chinese = leaves(zh.fork.sourceControl, 'fork.sourceControl')
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort())
    expect(Object.keys(english).length).toBeGreaterThan(10)
    for (const key of Object.keys(english)) {
      expect(placeholders(chinese[key] ?? '')).toEqual(placeholders(english[key] ?? ''))
    }
  })
})
