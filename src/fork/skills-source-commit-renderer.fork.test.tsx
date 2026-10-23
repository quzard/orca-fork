import { describe, expect, it } from 'vitest'
import { FORK_SKILLS_SOURCE_COMMIT } from '../cli/skills-source-commit'
import {
  buildAgentFeatureSkillInstallCommand,
  ORCHESTRATION_SKILL_INSTALL_COMMAND
} from '../renderer/src/lib/agent-feature-install-commands'

describe('renderer skill install commands in a fork build', () => {
  it('clone the upstream base pin, never this build commit', () => {
    const command = buildAgentFeatureSkillInstallCommand(['orca-linear'])
    expect(command).toContain(`https://github.com/stablyai/orca/tree/${FORK_SKILLS_SOURCE_COMMIT}`)
    expect(ORCHESTRATION_SKILL_INSTALL_COMMAND).toContain(`/tree/${FORK_SKILLS_SOURCE_COMMIT}`)
    if (ORCA_BUILD_COMMIT !== FORK_SKILLS_SOURCE_COMMIT) {
      expect(command).not.toContain(`/tree/${ORCA_BUILD_COMMIT}`)
    }
  })
})
