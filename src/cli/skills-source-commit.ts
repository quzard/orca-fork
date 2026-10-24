// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = '31fe3c74818b63dcc8c28043f00fecd33d97f14d'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
