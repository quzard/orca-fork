// fork: skill installs clone stablyai/orca. Unregistered, that ref is the build commit.

const FULL_COMMIT = /^[0-9a-f]{40}$/

let registered: string | undefined

export function registerSkillSourceCommit(commit: string): void {
  if (FULL_COMMIT.test(commit)) {
    registered = commit
  }
}

/** Upstream base when a fork registered one; otherwise a full build commit, or null. */
export function resolveSkillSourceCommit(buildCommit: string | null | undefined): string | null {
  if (registered) {
    return registered
  }
  if (buildCommit && FULL_COMMIT.test(buildCommit)) {
    return buildCommit
  }
  return null
}
