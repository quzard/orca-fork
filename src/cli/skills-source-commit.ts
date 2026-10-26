// fork: skills clone this upstream commit. fork/scripts/sync-skills-source-commit.mjs rewrites it.
import { registerSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'

export const FORK_SKILLS_SOURCE_COMMIT = 'ae55694d279ad0a0210874516a36f1772a7ebe57'

export function registerForkSkillSource(): void {
  registerSkillSourceCommit(FORK_SKILLS_SOURCE_COMMIT)
}

registerForkSkillSource()
