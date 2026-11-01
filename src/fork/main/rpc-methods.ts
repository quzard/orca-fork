// fork: every RPC method the fork adds to a host. rpc/methods/index.ts spreads FORK_RPC_METHODS into
// ALL_RPC_METHODS; their schemas live in src/fork, so rpc-params-type-parity.ts skips ForkRpcMethodName.
import type { ForkGitWorkspaceMethodName } from '../git-workspace/constants'
import { FORK_GIT_WORKSPACE_METHODS } from './git-workspace/methods'
import { HOST_FILE_METHODS, type HostFileMethodName } from './host-file-methods'

export const FORK_RPC_METHODS = [...FORK_GIT_WORKSPACE_METHODS, ...HOST_FILE_METHODS]

export type ForkRpcMethodName = ForkGitWorkspaceMethodName | HostFileMethodName
