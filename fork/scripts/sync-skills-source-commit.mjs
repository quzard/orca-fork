import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FULL_COMMIT = /^[0-9a-f]{40}$/
const root = join(import.meta.dirname, '..', '..')
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
 * Merge-base with fork/base-upstream, then upstream main, then the checked-in pin.
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
  for (const ref of ['upstream/main', 'origin/upstream/main']) {
    const sha = gitSha(['rev-parse', '--verify', `${ref}^{commit}`], run)
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
  return `// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = '${sha}'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
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
