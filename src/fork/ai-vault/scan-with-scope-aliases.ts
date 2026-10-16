import type { AiVaultListResult, AiVaultScanIssue } from '../../shared/ai-vault-types'
import {
  resolveLocalScopePathAliases,
  scopeAliasComplement,
  withScopePathAliases
} from './scope-path-aliases'

function isListResult(value: unknown): value is AiVaultListResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessions' in value &&
    'issues' in value &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.issues)
  )
}

function readScopeOptions(options: unknown): {
  scopePaths: readonly string[]
  signal?: AbortSignal
} {
  if (typeof options !== 'object' || options === null) {
    return { scopePaths: [] }
  }
  const scopePaths =
    'scopePaths' in options &&
    Array.isArray(options.scopePaths) &&
    options.scopePaths.every((entry) => typeof entry === 'string')
      ? options.scopePaths
      : []
  const signal =
    'signal' in options && options.signal instanceof AbortSignal ? options.signal : undefined
  return { scopePaths, signal }
}

/** Expand symlinked scope paths before the scan, then stamp cwd aliases for matching. */
export async function scanWithScopePathAliases<Options, Result>(
  options: Options,
  scan: (options: Options) => Promise<Result>
): Promise<Result> {
  if (typeof options !== 'object' || options === null) {
    return scan(options)
  }
  const { scopePaths, signal } = readScopeOptions(options)
  if (scopePaths.length === 0) {
    return scan(options)
  }
  const issues: AiVaultScanIssue[] = []
  const aliases = await resolveLocalScopePathAliases(scopePaths, issues, signal)
  const complement = scopeAliasComplement(scopePaths, aliases)
  const prepared =
    complement.length > 0
      ? Object.assign({}, options, { scopePaths: [...scopePaths, ...complement] })
      : options
  const result = await scan(prepared)
  if (!isListResult(result) || (aliases.size === 0 && issues.length === 0)) {
    return result
  }
  return {
    ...result,
    sessions: withScopePathAliases(result.sessions, aliases),
    issues: [...result.issues, ...issues]
  }
}
