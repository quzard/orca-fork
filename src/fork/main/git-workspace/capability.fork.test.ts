import { describe, expect, it } from 'vitest'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../../shared/fork-hooks/git-workspace-capability'
import { RUNTIME_CAPABILITIES } from '../../../shared/protocol-version'

describe('workspace repository capability', () => {
  it('is advertised with the runtime capabilities', () => {
    expect(RUNTIME_CAPABILITIES).toContain(FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY)
  })
})
