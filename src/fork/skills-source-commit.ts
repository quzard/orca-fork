// fork: skill installs clone this upstream commit; a fork build's own commit is not on
// stablyai/orca. fork/scripts/sync-skills-source-commit.mjs rewrites it after each sync.
export const FORK_SKILLS_SOURCE_COMMIT = 'abcf0a559f8f5ffa4da4aff550920f2587b56ad3'

/** Upstream's renderer reads ORCA_BUILD_COMMIT only to pin skill installs, so it gets the base. */
export function forkRendererDefines(): Record<string, string> {
  return { ORCA_BUILD_COMMIT: JSON.stringify(FORK_SKILLS_SOURCE_COMMIT) }
}
