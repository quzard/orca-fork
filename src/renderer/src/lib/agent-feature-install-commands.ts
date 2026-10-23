// COMPAT(wsl-bridge): removed when WSL runs as an orcad host.
import { buildAgentFeatureSkillInstallCommand as buildPinnedSkillInstallCommand } from '../../../shared/agent-feature-install-commands'
import {
  ORCA_CLI_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from './agent-feature-skill-names'
// fork: register the upstream base before the command constants below are built.
import '../../../cli/skills-source-commit'
import { resolveSkillSourceCommit } from '../../../shared/fork-hooks/skill-source-commit'

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

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

export const ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
])

export const ORCA_LINEAR_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_LINEAR_SKILL_NAME
])
