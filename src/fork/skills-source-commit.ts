// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = '1b3113de8e46fb02a13f3ade5a1bc7d307b82688'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
