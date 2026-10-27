// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = '55dffb479a8366fb48b49f1bc893f16a0b9455ea'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
