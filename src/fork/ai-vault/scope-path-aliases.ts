import { realpath } from 'node:fs/promises'
import type { AiVaultScanIssue, AiVaultSession } from '../../shared/ai-vault-types'
import { isAiVaultScanCancelledError } from '../../shared/ai-vault-types'

const SCOPE_REALPATH_CONCURRENCY = 8

export type ScopePathAliases = ReadonlyMap<string, string>

function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || isAiVaultScanCancelledError(error))
  )
}

/** Resolve scope paths on the host that scans. A dangling link becomes a scope issue. */
export async function resolveLocalScopePathAliases(
  scopePaths: readonly string[],
  issues: AiVaultScanIssue[],
  signal?: AbortSignal
): Promise<ScopePathAliases> {
  const aliases = new Map<string, string>()
  const queue = [...new Set(scopePaths)]
  const workers = Array.from(
    { length: Math.min(SCOPE_REALPATH_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const path = queue.shift()
        if (path === undefined) {
          return
        }
        if (signal?.aborted) {
          throw signal.reason instanceof Error
            ? signal.reason
            : new Error('ai vault scan cancelled')
        }
        try {
          const resolved = await realpath(path)
          if (signal?.aborted) {
            throw signal.reason instanceof Error
              ? signal.reason
              : new Error('ai vault scan cancelled')
          }
          if (resolved !== path) {
            aliases.set(path, resolved)
          }
        } catch (error) {
          if (isCancellation(error)) {
            throw error
          }
          issues.push({
            agent: 'claude',
            kind: 'scope',
            path,
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }
  )
  await Promise.all(workers)
  return aliases
}

export function scopeAliasComplement(
  scopePaths: readonly string[],
  aliases: ScopePathAliases
): string[] {
  const complement: string[] = []
  for (const resolved of aliases.values()) {
    if (!scopePaths.includes(resolved)) {
      complement.push(resolved)
    }
  }
  return complement
}

/** Stamp the registered symlink path onto sessions whose cwd is the resolved root. Resume cwd stays put. */
export function withScopePathAliases<T extends Pick<AiVaultSession, 'cwd' | 'cwdAliases'>>(
  sessions: readonly T[],
  aliases: ScopePathAliases
): T[] {
  if (aliases.size === 0) {
    return [...sessions]
  }
  return sessions.map((session) => {
    if (!session.cwd) {
      return session
    }
    const cwdAliases: string[] = []
    for (const [alias, resolved] of aliases) {
      const suffix =
        session.cwd === resolved
          ? ''
          : session.cwd.startsWith(`${resolved}/`)
            ? session.cwd.slice(resolved.length + 1)
            : null
      if (suffix !== null) {
        cwdAliases.push(suffix === '' ? alias : `${alias}/${suffix}`)
      }
    }
    return cwdAliases.length > 0 ? { ...session, cwdAliases } : session
  })
}
