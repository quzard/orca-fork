import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FULL_COMMIT = /^[0-9a-f]{40}$/
const root = join(import.meta.dirname, '..', '..')
// The one pin. electron.vite.config.ts feeds it to the renderer, the only place that builds
// `npx skills add` commands; the audit and the internal-ref scan read it as the upstream base.
const pinPath = join(root, 'src/fork/skills-source-commit.ts')

export function readCheckedInSkillsSourceCommit(source = readFileSync(pinPath, 'utf8')) {
  const match = source.match(/FORK_SKILLS_SOURCE_COMMIT = '([0-9a-f]{40})'/)
  return match ? match[1] : null
}

function gitSha(args, run) {
  try {
    const sha = String((run ?? defaultGit)(args)).trim()
    return FULL_COMMIT.test(sha) ? sha : null
  } catch {
    return null
  }
}

function defaultGit(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

/**
 * Commit skill installs can clone from stablyai/orca.
 * Merge-base with fork/base-upstream, then merge-base with upstream main, then the checked-in pin.
 */
export function resolveForkSkillsSourceCommit(buildCommit, options = {}) {
  const run = options.run
  const readPin = options.readPin ?? (() => readCheckedInSkillsSourceCommit())
  for (const ref of ['fork/base-upstream', 'origin/fork/base-upstream']) {
    const sha = gitSha(['merge-base', 'HEAD', ref], run)
    if (sha) {
      return sha
    }
  }
  // Without the base ref, the upstream commit this branch contains: merge-base with upstream main,
  // never its tip, which can be newer than anything merged here.
  for (const ref of ['upstream/main', 'origin/upstream/main']) {
    const sha = gitSha(['merge-base', 'HEAD', ref], run)
    if (sha) {
      return sha
    }
  }
  const pinned = readPin()
  if (pinned && FULL_COMMIT.test(pinned)) {
    return pinned
  }
  return typeof buildCommit === 'string' && FULL_COMMIT.test(buildCommit) ? buildCommit : null
}

export function renderSkillsSourceCommitModule(sha) {
  return `// fork: skill installs clone this upstream commit; a fork build's own commit is not on
// stablyai/orca. fork/scripts/sync-skills-source-commit.mjs rewrites it after each sync.
export const FORK_SKILLS_SOURCE_COMMIT = '${sha}'

/** Upstream's renderer reads ORCA_BUILD_COMMIT only to pin skill installs, so it gets the base. */
export function forkRendererDefines(): Record<string, string> {
  return { ORCA_BUILD_COMMIT: JSON.stringify(FORK_SKILLS_SOURCE_COMMIT) }
}
`
}

function main() {
  const sha = resolveForkSkillsSourceCommit('')
  if (!sha) {
    console.error('Could not resolve an upstream commit for skill installs.')
    process.exitCode = 1
    return
  }
  const next = renderSkillsSourceCommitModule(sha)
  if (readFileSync(pinPath, 'utf8') === next) {
    console.log(`skills source commit unchanged ${sha}`)
    return
  }
  writeFileSync(pinPath, next)
  console.log(`skills source commit -> ${sha}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
