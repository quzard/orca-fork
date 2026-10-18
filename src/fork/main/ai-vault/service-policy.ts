import {
  registerAiVaultScanDecorator,
  registerAiVaultScopeAliasHook,
  registerAiVaultSearchSchemaOffset,
  registerAiVaultToolIndexPolicy,
  setAiVaultForkServicePolicy,
  type AiVaultForkServicePolicy
} from '../../shared/fork-hooks/ai-vault'
import { attachScopePathAliases, expandScopePathAliases } from './scope-aliases'

// 工具输出改为分块索引后，旧库只存了截断文本，偏移 1 会让索引重建。
const FORK_SEARCH_SCHEMA_OFFSET = 1

export function aiVaultForkServicePolicy(): AiVaultForkServicePolicy {
  return {
    scopeAliases: true,
    toolIndex: 'chunk',
    schemaOffset: FORK_SEARCH_SCHEMA_OFFSET
  }
}

export function applyAiVaultForkServicePolicy(policy: AiVaultForkServicePolicy): void {
  if (policy.scopeAliases) {
    registerAiVaultScopeAliasHook(expandScopePathAliases)
    registerAiVaultScanDecorator(attachScopePathAliases)
  }
  registerAiVaultToolIndexPolicy(policy.toolIndex)
  registerAiVaultSearchSchemaOffset(policy.schemaOffset)
}

export function installAiVaultForkServicePolicy(): void {
  const policy = aiVaultForkServicePolicy()
  setAiVaultForkServicePolicy(policy)
  applyAiVaultForkServicePolicy(policy)
}
