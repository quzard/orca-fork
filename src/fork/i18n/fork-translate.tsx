// fork: fork code translates through this, not `translate` directly. Upstream's i18next extraction
// matches calls named `translate` and checks them against upstream en.json; fork keys live in
// src/fork/i18n/en.json instead, and fork-keys-catalog.fork.test.ts checks every forkTranslate key.
import type { TOptions } from 'i18next'
import { translate } from '../../renderer/src/i18n/i18n'

export function forkTranslate(key: string, fallback: string, options?: TOptions): string {
  return translate(key, fallback, options)
}
