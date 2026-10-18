// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = '3af9c22cc94d3b0fba21c9e988afe8b1ac538ac8'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
