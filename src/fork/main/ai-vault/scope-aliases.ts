import { realpath } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
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
    const resolveCwd = cachedLooseRealpath()
    result.sessions = await Promise.all(
      result.sessions.map((session) => withScopeAliases(session, aliases, resolveCwd))
    )
  }
  return result
}

/**
 * realpath of the deepest existing ancestor, plus the rest of the path. A transcript cwd can be
 * spelled through another symlink (macOS /var is /private/var) or no longer exist; both still
 * resolve to the spelling the scope aliases use. Cached per scan, one lookup per distinct cwd.
 */
function cachedLooseRealpath(): (pathValue: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>()
  const resolve = (pathValue: string): Promise<string> => {
    let pending = cache.get(pathValue)
    if (!pending) {
      pending = realpath(pathValue).catch(async () => {
        const parent = dirname(pathValue)
        return parent === pathValue
          ? pathValue
          : `${(await resolve(parent)).replace(/\/$/, '')}/${basename(pathValue)}`
      })
      cache.set(pathValue, pending)
    }
    return pending
  }
  return resolve
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

async function withScopeAliases<Session extends ListedSession>(
  session: Session,
  aliases: ReadonlyMap<string, string>,
  resolveCwd: (pathValue: string) => Promise<string>
): Promise<Session> {
  if (!session.cwd) {
    return session
  }
  let cwdAliases = aliasesFor(normalizeScopePath(session.cwd), aliases)
  if (cwdAliases.length === 0) {
    // The recorded spelling did not match: try the cwd's real path.
    cwdAliases = aliasesFor(normalizeScopePath(await resolveCwd(session.cwd)), aliases)
  }
  if (cwdAliases.length === 0) {
    return session
  }
  return { ...session, cwdAliases }
}

function aliasesFor(cwd: string, aliases: ReadonlyMap<string, string>): string[] {
  const cwdAliases: string[] = []
  for (const [alias, resolved] of aliases) {
    const suffix = suffixUnder(cwd, resolved)
    if (suffix !== null) {
      cwdAliases.push(suffix === '' ? alias : `${alias}/${suffix}`)
    }
  }
  return cwdAliases
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
