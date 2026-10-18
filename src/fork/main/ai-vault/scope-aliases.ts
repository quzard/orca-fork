import { realpath } from 'node:fs/promises'
import type { AiVaultAgent, AiVaultScanIssue } from '../../../shared/ai-vault-types'
import { normalizeRuntimePathSeparators } from '../../../shared/cross-platform-path'

const SCOPE_PATH_MISSING_MESSAGE = 'Scope path is not a directory.'
// 问题记录必须带 agent；这条是路径失败，不是某个助手的解析失败。
const SCOPE_ISSUE_AGENT: AiVaultAgent = 'claude'

export async function expandScopePathAliases(scopePaths: readonly string[]): Promise<string[]> {
  const expanded = [...scopePaths]
  const seen = new Set(scopePaths)
  for (const scopePath of scopePaths) {
    const resolved = await resolveScopePath(scopePath)
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved)
      expanded.push(resolved)
    }
  }
  return expanded
}

type ListedSession = { cwd: string | null; cwdAliases?: string[] }
type ListedResult = { sessions: ListedSession[]; issues: AiVaultScanIssue[] }

export async function attachScopePathAliases<Options, Result>(
  options: Options,
  scan: (options: Options) => Promise<Result>
): Promise<Result> {
  const aliases = new Map<string, string>()
  const issues: AiVaultScanIssue[] = []
  for (const scopePath of scopePathsOf(options)) {
    try {
      const resolved = await realpath(scopePath)
      if (resolved !== scopePath) {
        aliases.set(normalizeScopePath(scopePath), normalizeScopePath(resolved))
      }
    } catch {
      issues.push({
        agent: SCOPE_ISSUE_AGENT,
        kind: 'scope',
        path: scopePath,
        message: SCOPE_PATH_MISSING_MESSAGE
      })
    }
  }
  const result = await scan(options)
  if (!isListedResult(result)) {
    return result
  }
  if (issues.length > 0) {
    result.issues.push(...issues)
  }
  if (aliases.size > 0) {
    result.sessions = result.sessions.map((session) => withScopeAliases(session, aliases))
  }
  return result
}

function scopePathsOf(options: unknown): readonly string[] {
  if (typeof options !== 'object' || options === null || !('scopePaths' in options)) {
    return []
  }
  const scopePaths = options.scopePaths
  if (!Array.isArray(scopePaths)) {
    return []
  }
  return scopePaths.filter((scopePath): scopePath is string => typeof scopePath === 'string')
}

async function resolveScopePath(scopePath: string): Promise<string | undefined> {
  try {
    return await realpath(scopePath)
  } catch {
    return undefined
  }
}

function isListedResult(result: unknown): result is ListedResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'sessions' in result &&
    'issues' in result &&
    Array.isArray(result.sessions) &&
    Array.isArray(result.issues)
  )
}

function withScopeAliases<Session extends ListedSession>(
  session: Session,
  aliases: ReadonlyMap<string, string>
): Session {
  if (!session.cwd) {
    return session
  }
  const cwd = normalizeScopePath(session.cwd)
  const cwdAliases: string[] = []
  for (const [alias, resolved] of aliases) {
    const suffix = suffixUnder(cwd, resolved)
    if (suffix === null) {
      continue
    }
    cwdAliases.push(suffix === '' ? alias : `${alias}/${suffix}`)
  }
  if (cwdAliases.length === 0) {
    return session
  }
  return { ...session, cwdAliases }
}

function suffixUnder(cwd: string, resolved: string): string | null {
  if (cwd === resolved) {
    return ''
  }
  const prefix = resolved.endsWith('/') ? resolved : `${resolved}/`
  return cwd.startsWith(prefix) ? cwd.slice(prefix.length) : null
}

function normalizeScopePath(pathValue: string): string {
  return normalizeRuntimePathSeparators(pathValue)
}
