import {
  buildAgentFeatureSkillInstallCommand as buildPinnedSkillInstallCommand,
  COMPUTER_USE_SKILL_NAME,
  EPHEMERAL_VMS_SKILL_NAME,
  ORCA_CLI_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '../../../shared/agent-feature-install-commands'
// fork: register the upstream base before the command constants below are built.
import '../../../fork/skills-source-commit'
import { resolveSkillSourceCommit } from '../../../shared/fork-hooks/skill-source-commit'

export {
  COMPUTER_USE_SKILL_NAME,
  EPHEMERAL_VMS_SKILL_NAME,
  LINEAR_AGENT_SKILL_NAMES,
  LINEAR_TICKETS_SKILL_NAME,
  ORCA_CLI_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '../../../shared/agent-feature-install-commands'

/** The interactive install, pinned to this build; also the update, since `add` re-copies. */
export function buildAgentFeatureSkillInstallCommand(skillNames: readonly string[]): string {
  // fork: a fork build clones the upstream base, not its own commit.
  return buildPinnedSkillInstallCommand(skillNames, {
    sourceCommit: resolveSkillSourceCommit(ORCA_BUILD_COMMIT) ?? ORCA_BUILD_COMMIT
  })
}

export const ORCA_CLI_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME
])

export const COMPUTER_USE_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  COMPUTER_USE_SKILL_NAME
])

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

export const EPHEMERAL_VMS_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  EPHEMERAL_VMS_SKILL_NAME
])

export const ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
])

export const ORCA_LINEAR_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_LINEAR_SKILL_NAME
])
