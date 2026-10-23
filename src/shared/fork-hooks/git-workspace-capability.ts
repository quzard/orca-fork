// 放在 shared，桌面、orcad 和 CLI 都能编进 RUNTIME_CAPABILITIES，不必把 src/fork 拉进 CLI 工程。
export const FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY =
  'fork.git.workspace-repositories.v1' as const

export const FORK_RUNTIME_CAPABILITIES = [FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY] as const
